// Quality gate for generated offer-page slots.
//
// Two layers, both must pass before a page can be published:
//   1. Deterministic - auto-fixes what is mechanically fixable (dashes, capitalised
//      vikanje, brand spelling) and HARD FAILS on the categories that destroyed the
//      GenePlanet page: invented people, unsourced numeric claims, template
//      placeholders, missing exclusions on regulated-data leads.
//   2. LLM proofread - a separate Sonnet call whose only job is "is this correct,
//      meaningful Slovenian, and does every sentence actually mean something".
//      Reviewing is a different task from writing; the writer cannot catch its own
//      fluent nonsense.
//
// A failure returns issues, which are fed back into one regeneration attempt.
// Two failures mean no offer page for that lead. That is the correct outcome:
// the reply still goes out, just without a link.

const { default: Anthropic } = require('@anthropic-ai/sdk');

const PROOFREAD_MODEL = process.env.OFFER_PROOFREAD_MODEL || 'claude-sonnet-4-6';
const STRICT_NAMES = process.env.OFFER_STRICT_NAMES !== '0';
const PROOFREAD_ENABLED = process.env.OFFER_PROOFREAD_ENABLED !== '0';

// Modules that must never be proposed to a company handling regulated personal
// data on a cold proposal - they all imply AI touching that data.
const SENSITIVE_BLOCKED_MODULES = ['customer_service', 'agenti', 'svetovalec'];

const strip = s => String(s || '').toLowerCase()
  .normalize('NFD').replace(/\p{Diacritic}/gu, '');
// Slovenian declines names, so "Maša" in the input and "Mašo" in the copy must
// match. Strip diacritics, drop one trailing vowel, keep the first 5 characters:
// Masa/Maso -> mas, Martin/Martina -> marti, Bitenc/Bitenca -> biten.
const stem = s => {
  const base = strip(s).replace(/[^a-z0-9]/g, '');
  return base.replace(/[aeiou]$/, '').slice(0, 5);
};

// Slovenian also declines with consonant suffixes ("z Žanom", "pri Bitencu"),
// which a fixed-length stem cannot absorb. Accept a token when its normalised
// form and an allowlisted stem are a prefix of one another. Three characters
// minimum, so short stems cannot wave everything through.
function allowedToken(tok, allowedStems) {
  const s = stem(tok);
  if (allowedStems.has(s)) return true;
  const full = strip(tok).replace(/[^a-z0-9]/g, '');
  if (full.length < 3) return false;
  for (const a of allowedStems) {
    if (a.length < 3) continue;
    if (full.startsWith(a) || a.startsWith(full)) return true;
  }
  return false;
}

// Proper nouns that are legitimately allowed to appear in offer copy.
const ALLOWED_PROPER = [
  // ours
  'AIERA', 'Zan', 'Bagaric', 'B2Booster', 'Booster',
  // references
  'Munchies', 'Megasplet', 'Valtheron', 'NordLogistics', 'RedEyeMonkey',
  // tech
  'Claude', 'OpenAI', 'Gemini', 'Google', 'LinkedIn', 'Instagram', 'TikTok',
  'Facebook', 'YouTube', 'Calendly', 'Shopify', 'WordPress', 'Excel', 'Slack',
  'Discovery', 'Lovable', 'Cursor', 'Clay', 'Zoom', 'Teams', 'Outlook',
  // geo / institutions that plausibly belong in B2B copy
  'Slovenija', 'Sloveniji', 'Slovenije', 'Slovenskem', 'Slovenski', 'Slovenskih',
  'Evropa', 'Evropi', 'Evrope', 'Evropski', 'Evropskem', 'Evropsko', 'Uniji',
  'Balkan', 'Balkanu', 'Adria', 'Jadran', 'Hrvaska', 'Hrvaskem', 'Srbija',
  'Srbiji', 'Avstrija', 'Avstriji', 'Nemcija', 'Nemciji', 'Italija', 'Italiji',
  'Madzarska', 'Madzarski', 'Poljska', 'Poljski', 'Ceska', 'Ceskem', 'Slovaska',
  'Bosna', 'Bosni', 'Makedonija', 'Kosovo', 'Crna', 'Gora', 'Gori', 'Svica',
  'Svici', 'Francija', 'Franciji', 'Spanija', 'Spaniji', 'Nizozemska', 'Belgija',
  'Skandinavija', 'Skandinaviji', 'Benelux', 'DACH', 'CEE', 'EU', 'ZDA', 'UK',
  'Ljubljana', 'Ljubljani', 'Maribor', 'Mariboru', 'Celje', 'Celju', 'Koper',
  'Kopru', 'Kranj', 'Kranju', 'Nova', 'Gorica', 'Gorici', 'Primorska', 'Stajerska',
  // months
  'januar', 'februar', 'marec', 'april', 'maj', 'junij', 'julij', 'avgust',
  'september', 'oktober', 'november', 'december',
  // formal vikanje survives lowercasing but keep as safety
  'Vi', 'Vas', 'Vam', 'Vami',
];

// Result claims we will not put in front of a CFO without a source.
const NUMERIC_CLAIM_PATTERNS = [
  { re: /\b\d+\s*[-–—]?\s*\d*\s*x\b/i, why: 'multiplier claim (Nx)' },
  { re: /\b\d+([.,]\d+)?\s*%/, why: 'percentage claim' },
  { re: /\b\d+\s*[-–—]\s*\d+\s*(ur|dni|dnev|tedn|mesec|leto|let)/i, why: 'time-saving range' },
  { re: /\b(prihran\w*|hitreje|vec|manj|dvig\w*|povecan\w*)\s+(za\s+)?\d+/i, why: 'quantified benefit' },
  { re: /\b\d+\s*(ur|urah|dni|dneh|tednov|tednih)\b/i, why: 'time quantity' },
];

// Slovenian written without carons ("vec kot 50 trgov", "stiri prevzeme") reads
// as a machine wrote it. Two signals: known stripped word forms, and a long
// stretch of Slovenian containing not a single č/š/ž.
// Every stem listed here MUST carry a caron in correct Slovenian, so the bare
// ASCII form is proof of stripping. Words that legitimately have none
// (prevzem, izziv, storitev, tedensko) must never be added - they would reject
// perfectly good copy.
const STRIPPED_WORDS = new RegExp('\\b(' + [
  'vec', 'vecji', 'vecina', 'najvecji', 'stiri', 'stirih', 'sest', 'sestih',
  'siritev', 'siritve', 'sirjenje', 'sirimo', 'razsirit\\w*',
  'pospesen\\w*', 'stratesk\\w*', 'resitev', 'resitve', 'resitvam', 'resujemo',
  // not bare "nas" - that is also the legitimate accusative of "mi"
  'nasa', 'nase', 'nasi', 'nasih', 'nasem', 'nasega',
  'vasa', 'vase', 'vasi', 'vasih', 'vasem', 'vasega',
  'zeli', 'zelim', 'zelite', 'zelja', 'zelje', 'zdruzit\\w*', 'zdruzen\\w*',
  'povprasevanj\\w*', 'narocil\\w*', 'obcutljiv\\w*', 'dolocit\\w*', 'dolocimo',
  'krajsi', 'krajsa', 'hitrejsi', 'hitrejsa', 'kljucn\\w*', 'drzav\\w*', 'tezav\\w*',
  'ucinek', 'ucink\\w*', 'mesecn\\w*', 'priloznost\\w*', 'moznost\\w*',
  'zacetek', 'zacetk\\w*', 'zacnemo', 'casu', 'casa', 'stevil\\w*', 'druzb\\w*',
  'uspesn\\w*', 'ceprav',
].join('|') + ')\\b', 'i');

function diacriticsIssue(text) {
  const t = String(text || '');
  if (t.length < 25) return null;
  const hit = t.match(STRIPPED_WORDS);
  if (hit) return `Slovenian word written without carons ("${hit[0]}")`;
  // Weak backstop only. Correct Slovenian sentences with no caron at all do exist
  // ("S prevzemom New Era Genetics je okrepil prisotnost v Srednji Evropi"), so
  // this threshold is deliberately high.
  if (t.length > 140 && !/[čšžćđČŠŽĆĐ]/.test(t)) {
    return 'long Slovenian passage with no č/š/ž at all - almost certainly diacritics-stripped';
  }
  return null;
}

const PLACEHOLDER_PATTERNS = [
  { re: /\{[A-Za-z_]+\}/, why: 'unfilled template placeholder' },
  { re: /<[a-z_ ]{3,}>/i, why: 'prompt scaffold leaked into copy' },
  { re: /\blorem ipsum\b/i, why: 'lorem ipsum' },
  { re: /\bTODO\b|\bXXX\b|\bTBD\b/, why: 'draft marker' },
];

function collectStrings(slots) {
  const out = [];
  const push = (path, v) => { if (typeof v === 'string' && v.trim()) out.push({ path, text: v }); };
  for (const k of ['hero_h1', 'hero_sub', 'assumption', 'why_now_title', 'why_now_body', 'pilot_first', 'cta_paragraph']) {
    push(k, slots[k]);
  }
  (slots.quick_wins || []).forEach((q, i) => { push(`quick_wins[${i}].title`, q.title); push(`quick_wins[${i}].desc`, q.desc); });
  (slots.modules || []).forEach((m, i) => push(`modules[${i}].intro`, m.intro));
  ['pilot_includes', 'pilot_excludes', 'needed_from_client'].forEach(k =>
    (slots[k] || []).forEach((s, i) => push(`${k}[${i}]`, s)));
  return out;
}

function mapStrings(slots, fn) {
  const s = JSON.parse(JSON.stringify(slots));
  for (const k of ['hero_h1', 'hero_sub', 'assumption', 'why_now_title', 'why_now_body', 'pilot_first', 'cta_paragraph']) {
    if (typeof s[k] === 'string') s[k] = fn(s[k]);
  }
  (s.quick_wins || []).forEach(q => { if (q.title) q.title = fn(q.title); if (q.desc) q.desc = fn(q.desc); });
  (s.modules || []).forEach(m => { if (m.intro) m.intro = fn(m.intro); });
  ['pilot_includes', 'pilot_excludes', 'needed_from_client'].forEach(k => {
    if (Array.isArray(s[k])) s[k] = s[k].map(x => (typeof x === 'string' ? fn(x) : x));
  });
  return s;
}

// ── Layer 1a: mechanical auto-fixes ─────────────────────────────────────────
function autoFix(slots, canonicalBrand) {
  const brandVariants = [];
  if (canonicalBrand) {
    const compact = canonicalBrand.replace(/\s+/g, '');
    // "GenePlanet" -> also match "Gene Planet", "gene planet", "GENEPLANET"
    const spaced = compact.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    for (const v of new Set([compact, spaced, canonicalBrand])) {
      if (v && v.toLowerCase() !== canonicalBrand.toLowerCase()) brandVariants.push(v);
      brandVariants.push(v);
    }
  }

  return mapStrings(slots, txt => {
    let t = txt;
    // dashes -> hyphen
    t = t.replace(/\s*[–—]\s*/g, ' - ');
    // capitalised vikanje mid-sentence -> lowercase (consistency; also stops the
    // proper-noun detector from tripping on it)
    t = t.replace(/(?<=[^.!?:]\s)(Vi|Vas|Vam|Vami|Va[sš]|Va[sš]a|Va[sš]e|Va[sš]o|Va[sš]i|Va[sš]ih|Va[sš]im|Va[sš]imi|Va[sš]ega|Va[sš]emu)\b/g,
      m => m.charAt(0).toLowerCase() + m.slice(1));
    // canonical brand spelling
    for (const v of brandVariants) {
      if (!v || v === canonicalBrand) continue;
      t = t.replace(new RegExp(v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), canonicalBrand);
    }
    // collapse double spaces introduced above
    return t.replace(/[ \t]{2,}/g, ' ').trim();
  });
}

// ── Layer 1b: deterministic hard fails ──────────────────────────────────────
function deterministicCheck(slots, ctx) {
  const issues = [];
  const strings = collectStrings(slots);

  // Allowlist stems: our fixed list + the brand's own tokens + the recipient's name.
  const allowed = new Set(ALLOWED_PROPER.map(stem));
  // CamelCase brands ("GenePlanet", "RedEyeMonkey") must contribute each of their
  // parts, because the proper-noun scanner sees "Planet" and "Monkey" separately.
  const addTokens = s => String(s || '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .flatMap(t => [t, ...(t.match(/\p{Lu}\p{Ll}+|\p{Lu}+(?!\p{Ll})|\p{Ll}+/gu) || [])])
    .forEach(t => allowed.add(stem(t)));
  addTokens(ctx.canonicalBrand);
  addTokens(ctx.rawCompany);
  addTokens(ctx.firstName);
  addTokens(ctx.lastName);
  addTokens(ctx.title);
  addTokens(ctx.industry);
  // Proper nouns that appear inside a CITED fact are allowed - they came with a
  // URL, so they are not inventions. This is the whole point of the research step.
  (ctx.facts || []).forEach(f => addTokens(f && f.claim));
  // Names the lead volunteered in their own reply are legitimate and often the
  // most valuable personalisation there is ("kontaktiraj Maso Razinger ali
  // Martina Mikelna"). Blocking them would throw away a warm referral.
  addTokens(ctx.theirMessage);

  for (const { path, text } of strings) {
    for (const { re, why } of NUMERIC_CLAIM_PATTERNS) {
      if (re.test(text)) issues.push(`${path}: unsourced ${why} - remove the number entirely ("${text.slice(0, 90)}")`);
    }
    for (const { re, why } of PLACEHOLDER_PATTERNS) {
      if (re.test(text)) issues.push(`${path}: ${why} ("${text.slice(0, 90)}")`);
    }
    if (/[–—]/.test(text)) issues.push(`${path}: contains a dash character, hyphens only`);
    const dia = diacriticsIssue(text);
    if (dia) issues.push(`${path}: ${dia} ("${text.slice(0, 90)}")`);

    if (STRICT_NAMES) {
      // Capitalised tokens that are not sentence-initial and not allowlisted are
      // treated as invented proper nouns. This is the check that would have caught
      // "spoznali Masso in Martina".
      const sentences = text.split(/(?<=[.!?:])\s+/);
      for (const sentence of sentences) {
        const tokens = sentence.match(/\p{Lu}\p{Ll}{2,}/gu) || [];
        const firstWord = (sentence.match(/^\s*(\p{Lu}\p{Ll}{2,})/u) || [])[1];
        for (const tok of tokens) {
          if (tok === firstWord) continue;
          if (allowedToken(tok, allowed)) continue;
          issues.push(`${path}: unverified proper noun "${tok}" - never name a person, place or brand that was not in the input`);
        }
      }
    }
  }

  // Regulated-data leads: no modules that imply AI touching their data, and the
  // page must say out loud what the pilot does not touch.
  if (ctx.sensitive) {
    const bad = (slots.modules || []).map(m => m.id).filter(id => SENSITIVE_BLOCKED_MODULES.includes(id));
    if (bad.length) issues.push(`modules: ${bad.join(', ')} must not be proposed to a company handling regulated personal data - use commercial-side modules only (outbound, generator_ponudb, landing_gen, marketing_content, chatbot)`);
    if (!(slots.pilot_excludes || []).length) issues.push('pilot_excludes: required for a regulated-data company - state explicitly which data the pilot does not touch');
  }

  // Basic substance checks.
  if ((slots.assumption || '').length < 40) issues.push('assumption: too short to be credible, write 1-2 real sentences');
  if ((slots.modules || []).length > 3) issues.push('modules: maximum 3');

  return issues;
}

// ── Layer 2: LLM proofread ──────────────────────────────────────────────────
const PROOFREAD_PROMPT = `You are a Slovenian native-speaker editor reviewing copy for a premium B2B sales page before it is sent to a company CEO. You did not write it. Your job is to catch what the writer could not see.

You will receive a JSON object of copy slots plus the verified context they were written from.

Check every single sentence for:
1. MEANING. Does the sentence actually say something coherent? AI-generated Slovenian often reads fluently but is nonsense ("AI kvalificira nevroze povprasevanja", "brez da bi se zamenjali v papirjih"). This is the most important check. A sentence that a native speaker has to reread is a FAIL.
2. GRAMMAR. Declensions, verb agreement, word order, carons (s, c, z with diacritics), typos in the brand name.
3. INVENTED CONTENT. Any person, place, product, number, date or claim that is not in the verified context. Any name other than the recipient is an automatic FAIL.
4. TONE. Consistent vikanje in lowercase. No hype. No implied criticism of the company. Hyphens, never dashes.
5. CONSISTENCY. Same language throughout (Slovenian only). Brand spelled identically everywhere.

Return ONE JSON object, no fences:
{
  "verdict": "pass" | "fail",
  "issues": ["<specific, actionable, one per problem, quoting the offending text>"],
  "corrected": { <the full slot object with purely mechanical fixes applied - typos, declensions, casing. Keep the structure and keys identical. Do NOT rewrite meaning or invent replacements for content you had to delete.> }
}

Rules for the verdict:
- Any nonsensical sentence, any invented person, any unsourced number: "fail".
- Pure typos and declension slips you can fix yourself: "pass", with the fix applied in "corrected".
- When in doubt, "fail". A missing offer page costs nothing. A bad one costs the deal.`;

async function llmProofread(slots, ctx) {
  if (!PROOFREAD_ENABLED) return { verdict: 'pass', issues: [], corrected: slots };
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { verdict: 'pass', issues: [], corrected: slots };

  const anthropic = new Anthropic({ apiKey });
  const context = [
    `Canonical brand: ${ctx.canonicalBrand}`,
    `Recipient (the only person who may be named): ${[ctx.firstName, ctx.lastName].filter(Boolean).join(' ') || 'unknown'}`,
    `Recipient role: ${ctx.title || 'unknown'}`,
    `Industry: ${ctx.industry || 'unknown'}`,
    `Regulated personal data: ${ctx.sensitive ? 'yes' : 'no'}`,
    'Verified facts available to the writer:',
    (ctx.facts || []).length ? ctx.facts.map(f => `- ${f.claim}`).join('\n') : '(none)',
    '',
    'COPY TO REVIEW:',
    JSON.stringify(slots, null, 2),
  ].join('\n');

  try {
    const res = await anthropic.messages.create({
      model: PROOFREAD_MODEL,
      max_tokens: 4000,
      system: PROOFREAD_PROMPT,
      messages: [{ role: 'user', content: context }],
    });
    let raw = res.content[0].text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
    const parsed = JSON.parse(raw);
    return {
      verdict: parsed.verdict === 'pass' ? 'pass' : 'fail',
      issues: Array.isArray(parsed.issues) ? parsed.issues.slice(0, 12) : [],
      corrected: parsed.corrected && typeof parsed.corrected === 'object' ? parsed.corrected : slots,
    };
  } catch (e) {
    // A broken reviewer must not silently wave copy through.
    console.warn('[OFFER-PROOFREAD] failed:', e.message);
    return { verdict: 'fail', issues: [`proofread step failed: ${e.message}`], corrected: slots };
  }
}

// ── Entry point ─────────────────────────────────────────────────────────────
// Returns { ok, slots, issues }.
async function validateSlots(rawSlots, ctx) {
  let slots = autoFix(rawSlots, ctx.canonicalBrand);

  const detIssues = deterministicCheck(slots, ctx);
  if (detIssues.length) {
    console.warn(`[OFFER-GATE] deterministic fail (${detIssues.length}):`, detIssues.slice(0, 5).join(' | '));
    return { ok: false, slots, issues: detIssues };
  }

  const review = await llmProofread(slots, ctx);
  if (review.verdict !== 'pass') {
    console.warn(`[OFFER-GATE] proofread fail (${review.issues.length}):`, review.issues.slice(0, 5).join(' | '));
    return { ok: false, slots, issues: review.issues };
  }

  // Re-run the mechanical layer over the proofreader's corrections: it can fix a
  // typo and reintroduce a dash or a capitalised Vas at the same time.
  slots = autoFix(review.corrected, ctx.canonicalBrand);
  const postIssues = deterministicCheck(slots, ctx);
  if (postIssues.length) {
    console.warn('[OFFER-GATE] post-correction fail:', postIssues.slice(0, 5).join(' | '));
    return { ok: false, slots, issues: postIssues };
  }

  return { ok: true, slots, issues: [] };
}

module.exports = { validateSlots, autoFix, deterministicCheck, diacriticsIssue, SENSITIVE_BLOCKED_MODULES };
