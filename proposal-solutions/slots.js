// Slot generator for solution-module offer pages.
//
// ONE Sonnet call picks 2-3 relevant modules and writes only the
// company-specific lines. All core module copy stays fixed in modules.js.
//
// History: this ran on Haiku with a loose prompt and produced fluent-looking
// Slovenian garbage plus invented people ("spoznali Mašo in Martina"). The model
// is now Sonnet, the prompt forbids every category of invention, and every
// output goes through validate.js before it can reach a page.

const { default: Anthropic } = require('@anthropic-ai/sdk');
const { MODULE_IDS } = require('./modules');

const SLOTS_MODEL = process.env.OFFER_SLOTS_MODEL || 'claude-sonnet-4-6';

const SLOTS_PROMPT = `You generate JSON content slots for a Slovenian AIERA sales page, personalized for ONE company. The page is sent to a decision maker who replied "you can send it" to a cold LinkedIn message. It has to read as if a senior consultant wrote it after reading about their company. One wrong or nonsensical sentence loses the deal.

AIERA POSITIONING
AIERA is a Slovenian AI agency (founder Žan Bagarič). It builds practical AI systems for companies: B2B outbound lead-gen (B2Booster), AI quote generators, AI landing page generators, AI marketing content production, on-site AI advisors, chatbots, AI customer service, end-to-end AI agents.

SOLUTION MODULES (pick 2-3, most relevant first)
- outbound: systematic B2B lead-gen / outreach. Priced on the page. Strong default for B2B sellers.
- generator_ponudb: AI generator of personalized quotes. Relevant when they send many quotes.
- landing_gen: AI landing page generator. Relevant for campaigns, new markets, seasonal business.
- marketing_content: AI production of images, video, blog, SEO.
- svetovalec: on-site AI advisor. Relevant with a large catalogue or complex choice.
- chatbot: website AI chatbot for FAQ and qualification.
- customer_service: AI drafts replies to inbound mail, staff approves.
- agenti: end-to-end AI agents for repeatable orders and processes.

PICK 2 OR 3. NEVER MORE. Three well-argued solutions read as a proposal. Six read as a service catalogue and kill the sale.

═══ ABSOLUTE PROHIBITIONS ═══
Breaking any of these makes the whole output unusable:

1. NEVER name a person other than the recipient given in the input. No colleagues, no team members, no founders, no invented names. If you want to reference their team, write "vasa ekipa" (with correct sumniki).
2. NEVER state a number, percentage, multiplier or timeframe as a result. Banned: "2-3x vec", "50 % hitreje", "prihranite 10 ur", "v 30 dneh". The only numbers allowed on the page are the fixed prices and the pilot length, which the template adds itself.
3. NEVER invent a fact about the company. If it is not in VERIFIED FACTS below and not obviously true of the whole industry, do not write it.
4. Write the company name EXACTLY as given in CANONICAL BRAND, every single time, including casing and spacing.
5. NEVER claim they have a problem, are slow, are behind, or are losing money. Frame everything as added capacity, never as a deficiency.

═══ LANGUAGE ═══
- Slovenian throughout. Correct s, c, z with carons. Correct declensions and verb forms.
- Vikanje in LOWERCASE: "vasa ekipa", "za vas", "vase prodaje". Never capitalised mid-sentence.
- Hyphens only (-). Never an en dash or em dash.
- Never first person dual ("se slisiva"). Use "se slisimo".
- Short sentences. Premium consulting tone, not marketing copy.
- Avoid the words: problem, tezava, izziv, revolucija, transformacija.
- Read every sentence back before you output it. If a Slovene native speaker would stop and reread it, rewrite it. Fluency is not enough - it must mean something.

═══ WITHOUT VERIFIED FACTS ═══
If VERIFIED FACTS is empty, you know nothing specific about this company. Do NOT compensate by inventing colour. Write industry-level lines that are true of any serious company in that sector, name the company only where the template needs it, and let "assumption" say plainly that the proposal is based on their public profile and the role of the recipient.

═══ REGULATED DATA ═══
If SENSITIVE DATA is true, the pilot must visibly stay away from that data. Never propose that AI reads, processes, sends or answers about personal, health, genetic, patient, financial or legal client data. Keep every proposed solution on the commercial side (lead-gen, marketing, quotes, public-facing content). "pilot_excludes" must state explicitly which data the pilot does not touch.

═══ OUTPUT ═══
ONE valid JSON object. No markdown fences, no commentary.
{
  "hero_h1": "<max 11 words. Company-first, concrete, no hype. Pattern: 'Dve konkretni priloznosti za {Brand}' or 'AI za rast {Brand}: X in Y'>",
  "hero_sub": "<2 sentences. What the two or three proposed solutions would concretely do for this company. Name the brand once. No numbers.>",
  "assumption": "<1-2 sentences, plain and honest: what this proposal is based on (their public profile / the recipient's role / a specific verified fact) and that a short call would confirm whether it is the right direction. This sentence is what makes the page credible - write it like a consultant, not a marketer.>",
  "why_now_title": "<1 sentence, max 12 words. What the company already has, and what AI adds on top.>",
  "why_now_body": "<2-3 sentences tying the recommendation to their industry and, if available, to a verified fact. No numbers.>",
  "quick_wins": [ {"title": "<3-5 words>", "desc": "<1 sentence, no numbers>"}, {"...": "..."}, {"...": "..."} ],
  "modules": [ {"id": "<module id>", "intro": "<1-2 sentences connecting THIS module to THIS company's actual business. Specific. No numbers.>"} ],
  "pilot_first": "<1-2 sentences: which single module to start with and why that one first for this company.>",
  "pilot_includes": [ "<short phrase>", "<short phrase>", "<short phrase>" ],
  "pilot_excludes": [ "<short phrase describing what the pilot deliberately does NOT touch. Required and data-specific when SENSITIVE DATA is true.>" ],
  "needed_from_client": [ "<what AIERA needs from them, short phrase>", "<short phrase>" ],
  "cta_paragraph": "<2 sentences. Propose a short call to confirm the direction and pick the first step. Do NOT name anyone. Do NOT promise results.>"
}`;

function buildUserBlock(leadData, research) {
  const brand = (research && research.brandName) || leadData.company;
  const recipient = [leadData.firstName, leadData.lastName].filter(Boolean).join(' ') || 'unknown';

  const factLines = research && research.facts && research.facts.length
    ? research.facts.map(f => `- ${f.claim} (source: ${f.url}${f.recency && f.recency !== 'undated' ? `, ${f.recency}` : ''})`).join('\n')
    : '(none - you know nothing specific about this company)';

  return [
    `CANONICAL BRAND (use this exact spelling everywhere): ${brand}`,
    `RECIPIENT (the only person you may name): ${recipient}`,
    `Recipient role: ${leadData.title || leadData.role || 'unknown'}`,
    `Industry: ${leadData.industry || leadData.industryContext || 'unknown'}`,
    `Employees: ${leadData.employees || 'unknown'}`,
    `Country: ${leadData.country || 'unknown'}`,
    research && research.whatTheyDo ? `What they do: ${research.whatTheyDo}` : null,
    '',
    'VERIFIED FACTS:',
    factLines,
    '',
    `SENSITIVE DATA: ${research && research.sensitive ? `true - ${research.sensitiveReason || 'regulated personal data'}` : 'false'}`,
    research && research.aiMaturity === 'advanced'
      ? `AI MATURITY: advanced. ${research.aiMaturityNote} Do not explain what AI is or sell "AI" as such. Propose a specific commercial process instead.`
      : null,
    '',
    `Their reply to our outreach: ${leadData.theirMessage || leadData.theirReply || '(none)'}`,
    '',
    'Generate the JSON now.',
  ].filter(l => l !== null).join('\n');
}

async function generateSolutionSlots(leadData, research, retryFeedback) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  const anthropic = new Anthropic({ apiKey });

  let userBlock = buildUserBlock(leadData, research);
  if (retryFeedback) {
    userBlock += `\n\nYOUR PREVIOUS ATTEMPT WAS REJECTED BY THE QUALITY GATE:\n${retryFeedback}\nFix every one of these and regenerate the full JSON.`;
  }

  const response = await anthropic.messages.create({
    model: SLOTS_MODEL,
    max_tokens: 4000,
    system: SLOTS_PROMPT,
    messages: [{ role: 'user', content: userBlock }],
  });

  let raw = response.content[0].text.trim();
  raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');

  let slots;
  try {
    slots = JSON.parse(raw);
  } catch (err) {
    console.error('[SOLUTIONS-SLOTS] JSON parse failed. Raw (500):', raw.slice(0, 500));
    throw new Error(`Solutions slot JSON parse failed: ${err.message}`);
  }

  // Shape validation only. Content validation lives in validate.js.
  for (const key of ['hero_h1', 'hero_sub', 'assumption', 'why_now_title', 'why_now_body', 'pilot_first', 'cta_paragraph']) {
    if (!slots[key] || typeof slots[key] !== 'string') throw new Error(`Missing slot: ${key}`);
  }
  if (!Array.isArray(slots.quick_wins) || slots.quick_wins.length < 2) throw new Error('Missing quick_wins');
  slots.quick_wins = slots.quick_wins.filter(q => q && q.title && q.desc).slice(0, 3);

  if (!Array.isArray(slots.modules)) throw new Error('Missing modules');
  slots.modules = slots.modules.filter(m => m && MODULE_IDS.includes(m.id));
  const seen = new Set();
  slots.modules = slots.modules.filter(m => (seen.has(m.id) ? false : seen.add(m.id)));
  if (slots.modules.length < 2) throw new Error(`Too few valid modules (${slots.modules.length})`);
  // Hard cap at 3: a catalogue of six reads as untargeted and does not convert.
  slots.modules = slots.modules.slice(0, 3);

  const strArr = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()).slice(0, 5) : []);
  slots.pilot_includes = strArr(slots.pilot_includes);
  slots.pilot_excludes = strArr(slots.pilot_excludes);
  slots.needed_from_client = strArr(slots.needed_from_client);

  return slots;
}

module.exports = { generateSolutionSlots, SLOTS_PROMPT };
