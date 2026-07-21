// Claude content generator for personalized proposals.
// Uses claude-opus-4-6 for top-tier Slovene language quality.
// Output: strict JSON with content slots that template.js fills.

const Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk');

// ─── PROMPT ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Si starejši slovenski B2B copywriter, ki piše predloge sodelovanja za AIERA (aiera.si). AIERA je slovenska agencija za AI sisteme po meri za podjetja.

NAMEN PREDLOGA:
- Cilj NI prodaja s ceno. Cilj je rezervacija 15-minutnega Calendly sestanka.
- Predlog je PERSONALIZIRAN za konkretno osebo in podjetje.
- Ton: zrel, samozavesten, brez navijaške energije. Kot da bi pisal direktor direktorju.

JEZIK - PRAVILA, KI JIH NIKOLI NE KRŠIŠ:
1. Slovenščina je MATERINSKI jezik. Brez "kalkov" iz angleščine ali hrvaščine.
2. ŠUMNIKE pišeš PRAVILNO. Vedno č, š, ž (nikoli c, s, z kot zamenjava).
3. NIKOLI ne uporabljaš pomišljaja (—). Samo navadni vezaj (-) z presledki: " - ".
4. Brez AI-stila fraz. PREPOVEDANE besedne zveze (in podobne):
   - "v današnjem hitro spreminjajočem se svetu"
   - "izkušnja na naslednji ravni"
   - "odklenite potencial"
   - "transformirajte svoje poslovanje"
   - "rešitve po meri za vas"
   - "potovanje k uspehu"
   - "izkoristite moč AI"
   - "v dobi umetne inteligence"
   - "ustvarjamo prihodnost"
   - "podjetja prihodnosti"
   - "celostne rešitve"
   - "preprosto, a učinkovito"
   - "potopite se v"
   - "v hitro spreminjajočem se digitalnem okolju"
5. Brez "Pomagamo vam..." in podobnih agencijskih klišejev. Govori KAJ se zgodi, ne kako "pomagamo".
6. Brez "naša ekipa", "naši strokovnjaki", "naše rešitve". Govori O REŠITVI sami.
7. Brez emojijev v telu besedila (razen v ikonah, ki jih posebej zahteva schema).
8. Stavki naj bodo SREDNJE DOLŽINE. Mešaj 8-besedne stavke z 18-besednimi. Ne 30+.
9. Aktivni glagoli. Nikoli pasivna konstrukcija ("je bilo storjeno" → "ekipa naredi").
10. Konkretni primeri, ne abstrakcije. Namesto "veliko" piši "12 razpisov mesečno".
11. Brez velikih obljub. Nikoli "transformiramo, revolucioniramo, optimaliziramo na maksimum".
12. Smiselne tehnične izraze pusti v angleščini, če jih slovenska scena tako uporablja: pipeline, dashboard, audit log, workflow, CRM, lead, KPI, brief, demo, scope, integracija, API. NE poslovenjaj nasilno.

STILSKI VZOR (kar je DOBRA slovenščina za ta dokument):
- "V SPIRIT Slovenija vsak dan iščete med 12 aktivnimi programi. AI naredi to v 3 sekundah in vrne le tisto, kar je vredno odpreti."
- "Ne nadomeščamo obstoječih sistemov. Nad njih postavimo sloj, ki jih poveže in spravi informacije do ljudi, ki jih potrebujejo."
- "Pilot v 3 tednih, brez vendor lock-in. Če rešitev ne deluje za vašo ekipo, jo izklopite."

STILSKI VZOR (kar je SLABA slovenščina - tega NE počneš):
- ✗ "V današnjem hitro spreminjajočem se svetu poslovne inteligence..."
- ✗ "Pomagamo vam transformirati vaše poslovanje s pomočjo AI."
- ✗ "Naša ekipa strokovnjakov je pripravljena ustvariti rešitev po meri."
- ✗ "Odklenite potencial vaših podatkov in dvignite produktivnost na novo raven."

FORMAT IZHODA:
- Vrneš SAMO veljaven JSON, brez kakšne koli razlage pred ali po.
- Brez markdown ovitka (\`\`\`).
- JSON mora vsebovati VSE polja iz sheme spodaj.
- Vsak tekst mora biti čista slovenščina, lektorirano kot da gre v tisk.`;

// ─── CONTENT SCHEMA (what Claude must produce) ───────────────────────────────

function buildSchemaInstructions(persona) {
  const sections = persona.sections;
  const includeWidget = sections.includes('hero');
  const includeKontekst = sections.includes('kontekst');
  const includeAiStack = sections.includes('aiStack');
  const includeResitve = sections.includes('resitve');
  const includeArhitektura = sections.includes('arhitektura');
  const includePilot = sections.includes('pilot');
  const includeSpotlight = sections.includes('personaSpotlight');
  const includeBenefits = sections.includes('benefits');
  const includeVarnostKratko = sections.includes('varnostKratko');
  const includeVarnostPodatki = sections.includes('varnostPodatki');
  const includePristop = sections.includes('pristop');
  const includeFaq = sections.includes('faq');

  const parts = [];

  parts.push(`{
  "metaTitle": "string (60-70 znakov, format: '{Podjetje} - AI predlog · AIERA')",
  "metaDescription": "string (150-160 znakov, OG description)",`);

  // HERO
  parts.push(`
  "heroTitleTop": "string (4-6 besed, prvi del naslova, npr. 'AI sloj nad procesi')",
  "heroTitleBottom": "string (1-3 besede, brand-colored del, npr. ime podjetja ali konkreten use-case)",
  "heroLead": "string (2-3 stavki, 35-55 besed, KONKRETEN opis česa konkretnega rešujemo - omeni stvari iz njihove industrije/role)",
  "heroTrust": ["3 elementi, vsak 3-5 besed, primeri: 'Pilot v 3 tednih', 'Ekipa v SLO', 'NDA na voljo'"],`);

  // WIDGET (mock dashboard in hero)
  if (includeWidget) {
    parts.push(`
  "widgetTag": "string (1 beseda, tehnično ime, npr. 'pilot' ali 'preview')",
  "widgetTitle": "string (3-5 besed, npr. '{Podjetje} pregled' ali 'Pipeline pregled')",
  "widgetStats": [
    {"label": "string (1-2 besedi, UPPERCASE, npr. 'RAZPISI')", "value": "string (številka, npr. '12')", "delta": "string (npr. '+3')"},
    {"label": "...", "value": "...", "delta": "..."},
    {"label": "...", "value": "...", "delta": "..."}
  ],
  "widgetActivityLabel": "string (npr. 'AKTIVNOST (30D)')",
  "widgetActivityDelta": "string (npr. '24%')",
  "widgetChatPrompt": "string (vprašanje, ki bi ga naslovnik vprašal AI, 5-12 besed, KONKRETNO za njihovo delo)",
  "widgetChatAnswer": "string (AI odgovor v 1-2 stavkih, lahko vsebuje **krepki** poudarki za ključne številke/imena)",
  "widgetSources": ["3-4 viri, kratko, npr. 'CRM', 'Dokumenti', 'Razpisi'"],
  "widgetPillTopLabel": "string (UPPERCASE, 1-2 besedi, npr. 'MATCH NAJDEN')",
  "widgetPillTopValue": "string (5-8 besed, konkretna ugotovitev sistema)",
  "widgetPillBottomLabel": "string (UPPERCASE, npr. 'AUDIT LOG')",
  "widgetPillBottomValue": "string (3-6 besed, npr. '+42 dejanj danes')",`);
  }

  // KONTEKST
  if (includeKontekst) {
    parts.push(`
  "kontekstEyebrow": "string (1-2 besedi, default: 'Kontekst')",
  "kontekstTitle": "string (1 dolg stavek z dvopičjem ali vejicama, opisuje glavno težavo industrije/role)",
  "kontekstLead": "string (2-3 stavki, 45-70 besed, kontekstualizira težavo SPECIFIČNO za to podjetje)",
  "kontekstCards": [
    {"icon": "1 unicode simbol (npr. ◎ ⊙ ✦ ⌬ ⎈)", "title": "3-5 besed", "body": "1 kratek stavek, 8-14 besed"},
    {"icon": "...", "title": "...", "body": "..."},
    {"icon": "...", "title": "...", "body": "..."},
    {"icon": "...", "title": "...", "body": "..."}
  ],`);
  }

  // AI STACK
  if (includeAiStack) {
    parts.push(`
  "aiStackTools": ["6 imen orodij, izberi mix iz: Claude, OpenAI, Gemini, n8n, Lovable, Make, Anthropic API, Open Claw, Voiceflow, Airtable"],`);
  }

  // RESITVE
  if (includeResitve) {
    parts.push(`
  "resitveEyebrow": "string (default: 'Možne rešitve')",
  "resitveTitle": "string (npr. 'Kaj bi lahko razvili za {Podjetje}')",
  "resitveLead": "string OPCIJSKO (1 stavek, lahko prazen)",
  "resitveModules": [
    {"icon": "1 unicode simbol", "title": "3-6 besed - ime modula/rešitve", "body": "2-3 stavki, 25-45 besed, opis kaj modul počne v praksi", "example": "1 stavek v narekovajih kot citat sistema/uporabnika, 12-22 besed"},
    "... ponovi 6x z DRUGAČNIMI rešitvami, primernimi za persona+industry"
  ],`);
  }

  // ARHITEKTURA
  if (includeArhitektura) {
    parts.push(`
  "arhitekturaTitle": "string (1 stavek, npr. 'Ne gre za eno samo orodje. Gre za varen AI sloj nad obstoječimi procesi.')",
  "arhitekturaLead": "string (1 stavek konteksta)",
  "arhitekturaParagraphs": ["2-3 odstavki, vsak 2-3 stavke, opisujejo modularen pristop"],
  "arhitekturaLayers": [
    {"icon": "1 znak ali številka", "label": "UPPERCASE, npr. 'VIRI'", "value": "konkretni viri, npr. 'CRM · dokumenti · razpisi'", "brand": false},
    {"icon": "...", "label": "...", "value": "...", "brand": false},
    {"icon": "...", "label": "...", "value": "...", "brand": true},
    {"icon": "...", "label": "...", "value": "...", "brand": false},
    {"icon": "...", "label": "...", "value": "...", "brand": false}
  ],`);
  }

  // PILOT
  if (includePilot) {
    parts.push(`
  "pilotTitle": "string (npr. 'Predlagan prvi pilot: ...')",
  "pilotLead": "string (2-3 stavki, opisuje scope pilota)",
  "pilotCilj": ["5 točk, kaj bo pilot dokazal, vsaka 5-10 besed"],
  "pilotFaze": ["5 faz, vsaka po obrazcu: 'Faza N: opis (X dni)' ali samo 'opis - rezultat'"],`);
  }

  // PERSONA SPOTLIGHT
  if (includeSpotlight) {
    parts.push(`
  "spotlightTitle": "string (1 odločen stavek za to persono, 6-12 besed)",
  "spotlightBody": "string (2-3 stavki, 35-55 besed, govori specifično o problemih/odgovornosti te persone)",
  "spotlightBullets": ["5 specifičnih točk za to persono, vsaka 6-14 besed"],`);
  }

  // BENEFITS
  if (includeBenefits) {
    parts.push(`
  "benefitsTitle": "string (1 stavek, npr. 'Manj iskanja, manj administracije, več pregleda')",
  "benefitsLeft": {
    "label": "UPPERCASE oznaka (npr. 'ZA ZAPOSLENE' ali 'ZA EKIPO')",
    "title": "1 kratek stavek povzetka, 5-10 besed",
    "items": ["3-5 točk, vsaka 6-12 besed"]
  },
  "benefitsRight": {
    "label": "UPPERCASE oznaka (npr. 'ZA VODSTVO' ali 'ZA STRANKE')",
    "title": "1 kratek stavek povzetka, 5-10 besed",
    "items": ["3-5 točk, vsaka 6-12 besed"]
  },`);
  }

  // VARNOST KRATKO
  if (includeVarnostKratko) {
    parts.push(`
  "varnostKratkoTitle": "string (npr. 'AI naj pomaga, ne odloča namesto ljudi')",
  "varnostKratkoLead": "string (2-3 stavki, 35-55 besed, kontekst zakaj je varnost pomembna za tega naslovnika)",
  "varnostKratkoItems": ["6 točk, vsaka 5-12 besed, konkretna varnostna pravila"],`);
  }

  // VARNOST PODATKI
  if (includeVarnostPodatki) {
    parts.push(`
  "varnostPodatkiTitle": "string (npr. 'Razvoj poteka hitro, končna rešitev pa živi tam, kjer ustreza vašemu IT.')",
  "varnostPodatkiParagraphs": ["3-4 odstavki, vsak 2-3 stavki, o data residency, integracijah, vzdrževanju"],`);
  }

  // PRISTOP
  if (includePristop) {
    parts.push(`
  "pristopLabel": "string (UPPERCASE, default 'AIERA pristop')",
  "pristopTitle": "string (1 stavek, opisuje pristop)",
  "pristopParagraphs": ["2-3 odstavki, vsak 2-3 stavki"],
  "pristopFacts": [
    {"value": "1-3 besede (npr. '3 tedne', '0 vendor lock-in', '100% v EU')", "label": "UPPERCASE, 1-3 besede"},
    "... 3-4 facts skupaj"
  ],`);
  }

  // FAQ
  if (includeFaq) {
    parts.push(`
  "faqTitle": "string (default 'Pogosta vprašanja')",
  "faqItems": [
    {"q": "konkretno vprašanje, ki bi ga ta persona vprašala (8-15 besed)", "a": "konkreten odgovor, 2-3 stavki, 30-50 besed"},
    "... 5-6 vprašanj, ki naslovijo PRAVE ugovore te persone"
  ],`);
  }

  // CTA FINAL
  parts.push(`
  "ctaFinalTitle": "string (1 stavek, vabilo na sestanek, npr. 'Predlog: 15-minutni pregled možnosti za {Podjetje}')",
  "ctaFinalBody": "string (2-3 stavki, 35-55 besed, povzame zakaj se splača vzeti 15 minut)"`);

  parts.push(`
}`);

  return parts.join('');
}

// ─── PROMPT BUILDER ──────────────────────────────────────────────────────────

function buildUserPrompt({ leadData, persona, themeName }) {
  // NEVER pass the person's name as "company" - the LLM then writes page copy as
  // if the person were a firm. Unknown company → explicit instruction instead.
  const company = (leadData.company && leadData.company !== 'LinkedIn')
    ? leadData.company
    : 'NI ZNANO - imena osebe NIKOLI ne uporabi kot ime podjetja; kjer bi sicer pisal ime podjetja, piši "vaše podjetje"';
  const fullName = `${leadData.firstName || ''} ${leadData.lastName || ''}`.trim();
  const title = leadData.title || leadData.role || 'decision maker';
  const industry = leadData.industry || leadData.industryContext || '';
  const context = leadData.theirMessage || leadData.context || '';

  // First-party research: this is what turns the page from a product pitch into a
  // company-specific proposal ("kje vse bi AI pomagal poslovanju {Company}").
  const researchLines = [
    leadData.researchSummary && `- Kaj vemo o podjetju: ${leadData.researchSummary}`,
    leadData.fitReason && `- Zakaj so dober fit: ${leadData.fitReason}`,
    leadData.personalizationHook && `- Personalization hook (iz classifierja): ${leadData.personalizationHook}`,
    leadData.employees && `- Velikost: ${leadData.employees} zaposlenih`,
    leadData.country && `- Država: ${leadData.country}`
  ].filter(Boolean).join('\n');

  // Page language follows the lead (persisted on the lead record). Slovenian default.
  const LANG_FULL = { en: 'ANGLEŠČINI (English)', de: 'NEMŠČINI (Deutsch)', cs: 'ČEŠČINI (Czech)' };
  const langOverride = leadData.language && LANG_FULL[leadData.language]
    ? `\nJEZIK STRANI (NAJVIŠJA PRIORITETA, prepiše vsa pravila o slovenščini zgoraj): Naslovnik komunicira v ${LANG_FULL[leadData.language]}. VSA besedila v JSON izhodu napiši v tem jeziku, na native ravni. Slovenska pravila o šumnikih ne veljajo, pravila o tonu, prepovedanih frazah in konkretnosti pa ostanejo.\n`
    : '';

  return `Pripravi predlog sodelovanja za naslednjega naslovnika.

NASLOVNIK:
- Ime: ${fullName}
- Naziv/funkcija: ${title}
- Podjetje: ${company}
- Industrija/dejavnost: ${industry || 'ni eksplicitno navedeno'}
- Persona blueprint: ${persona.label}
- Persona theme (fokus): ${persona.spotlight.themes.join(', ')}
- Spotlight section bo: "${persona.spotlight.label}"
${researchLines ? `
RAZISKAVA O PODJETJU (prva roka, uporabi to kot hrbtenico vsebine):
${researchLines}
` : ''}
KONTEKST (od kod prihaja stik, kaj je rekel/-a):
${context || 'Outbound stik prek LinkedIn ali emaila. Naslovnik je izrazil zanimanje za AI rešitve.'}
${langOverride}
CILJ TEGA DOKUMENTA:
Personaliziran predlog sodelovanja, ki ${fullName.split(' ')[0] || 'naslovnik'} prepriča, da rezervira 15-minutni Calendly sestanek. Brez cen. Brez splošnih agencijskih besed.

NAJPOMEMBNEJŠE PRAVILO (to loči stran, ki proda, od strani, ki jo zaprejo):
Stran NI predstavitev AIERE in njenih storitev. Stran je odgovor na vprašanje "kje vse bi AI konkretno pomagal poslovanju podjetja ${company}". Vsaka sekcija govori o NJIHOVIH oddelkih, procesih in dnevnem delu, AIERA je samo izvajalec. Če kontekst ali raziskava omenja konkreten oddelek ali use-case (npr. nabava, logistika, prodajne ponudbe, customer service), postavi CELOTEN fokus strani tja - tako kot bi svetovalec pripravil izhodišča za ta konkreten oddelek.

ZAHTEVE ZA KOPIJO:
1. Vsak tekst MORA biti specifičen za ${company} in role "${title}".
2. Ko omeniš podjetje, uporabi natanko: "${company}".
3. Ko omeniš osebo, uporabi: "${fullName.split(' ')[0]}" (samo ime) ali "g. ${leadData.lastName}" za bolj formalne reference.
4. Hero mock widget mora ponazoriti KONKRETEN use-case za "${industry || persona.label}". Ne generičnih stvari.
5. FAQ vprašanja MORAJO naslavljati prave ugovore te persone (persona ima v fokusu: ${persona.faqFocus.join(', ')}).
6. resitveModules: izberi 6 modulov, ki so smiselni za to persono+industrijo (ne generic AI features). Vsak modul poimenuj po NJIHOVEM procesu/oddelku (npr. "AI za pripravo ponudb v prodaji", ne "AI Workflow Engine").
7. spotlightBullets: pišejo TOČNO o tem, kar je za to persono najbolj kritično.

PRODUCT KNOWLEDGE - AIERA reference moduli (ti so resnični, jih lahko vključiš če pasujejo):
- Interni AI asistent (odgovarja na vprašanja iz internih dokumentov)
- AI svetovalec za stranke na spletni strani
- Interni dashboard/operativni sistem
- AI podpora pri pripravi dokumentov (razpisi, ponudbe, briefingi)
- AI matchmaking (povezovanje strank s ponudniki/programi)
- AI poročila in management pregled
- AI sales motor (outbound, message generation, CRM hygiene)
- AI content engine (vsebine na podlagi brand voicea)
- Data extraction iz nestrukturiranih virov
- Smart workflow avtomatizacije

REFERENCE (uporabi pri references sekciji):
Munchies, Valtheron, B2Booster, NordLogistics, RedEyeMonkey, + 30 podjetij v SI in EU

TEHNIČNI STACK (uporabi pri aiStackTools):
Claude, OpenAI, Gemini, n8n, Lovable, Open Claw, Anthropic API, Make, Airtable

VRNI SAMO JSON. Struktura mora natanko ustrezati spodnji shemi:

${buildSchemaInstructions(persona)}`;
}

// ─── VALIDATION ──────────────────────────────────────────────────────────────

const FORBIDDEN_PHRASES = [
  /v današnjem hitro spreminjajočem/i,
  /odklen(i|ite|imo) (potencial|moč)/i,
  /izkoristite moč/i,
  /transformir(amo|aj|ate|ali) (vaše|svoje)/i,
  /izkušnj(o|a) na naslednji ravni/i,
  /potovanj(e|a) k uspehu/i,
  /v dobi umetne inteligence/i,
  /podjetja prihodnosti/i,
  /celostne rešitve/i,
  /preprosto,? a učinkovito/i,
  /pomagamo vam (transformirati|rasti|napredovati)/i,
  /naša ekipa strokovnjakov/i,
  /rešitve po meri za vas/i,
  /potopite se v/i,
  /dvigniti.* na (novo|višjo) raven/i,
];

const EM_DASH = /—/;
// Croatianisms / common Slovene mistakes
const SUSPICIOUS_PATTERNS = [
  /\b(zato sto|kao)\b/i,                  // Croatian
  /\b(tjedan|jučer|sutra|sat\b)/i,        // Croatian time words
];

function validateContent(content) {
  const issues = [];
  const allText = JSON.stringify(content);

  if (EM_DASH.test(allText)) issues.push('Vsebuje pomišljaj — namesto vezaja -.');

  for (const re of FORBIDDEN_PHRASES) {
    const m = allText.match(re);
    if (m) issues.push(`Prepovedana fraza: "${m[0]}"`);
  }

  for (const re of SUSPICIOUS_PATTERNS) {
    const m = allText.match(re);
    if (m) issues.push(`Sumljiv vzorec (hrvatizem/napaka): "${m[0]}"`);
  }

  // Check for required fields
  const required = ['metaTitle', 'metaDescription', 'heroTitleTop', 'heroTitleBottom', 'heroLead', 'heroTrust', 'ctaFinalTitle', 'ctaFinalBody'];
  for (const k of required) {
    if (!content[k]) issues.push(`Manjka polje: ${k}`);
  }

  return issues;
}

// Sanitize content: fix em dashes, normalize whitespace
function sanitizeContent(content) {
  const fix = (s) => {
    if (typeof s !== 'string') return s;
    return s
      .replace(/—/g, ' - ')      // em dash → " - "
      .replace(/–/g, ' - ')      // en dash → " - "
      .replace(/  +/g, ' ')      // collapse multiple spaces
      .replace(/ - {2,}/g, ' - ')
      .trim();
  };
  const walk = (obj) => {
    if (typeof obj === 'string') return fix(obj);
    if (Array.isArray(obj)) return obj.map(walk);
    if (obj && typeof obj === 'object') {
      const out = {};
      for (const k of Object.keys(obj)) out[k] = walk(obj[k]);
      return out;
    }
    return obj;
  };
  return walk(content);
}

// ─── CLAUDE CALL ─────────────────────────────────────────────────────────────

async function generateContent({ leadData, persona, themeName, retryOnValidationFail = true }) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const userPrompt = buildUserPrompt({ leadData, persona, themeName });

  const response = await anthropic.messages.create({
    model: process.env.PROPOSAL_MODEL || 'claude-opus-4-6',
    max_tokens: 8000,
    temperature: 0.7,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  let raw = response.content[0].text.trim();
  // strip any markdown code fences
  raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

  let content;
  try {
    content = JSON.parse(raw);
  } catch (e) {
    console.error('[PROPOSAL] JSON parse failed. Raw:', raw.slice(0, 500));
    throw new Error(`Claude vrnil neveljaven JSON: ${e.message}`);
  }

  content = sanitizeContent(content);
  const issues = validateContent(content);

  if (issues.length && retryOnValidationFail) {
    console.warn(`[PROPOSAL] Validation issues, retrying once. Issues:`, issues);
    // Retry once with explicit error feedback
    const retryResponse = await anthropic.messages.create({
      model: process.env.PROPOSAL_MODEL || 'claude-opus-4-6',
      max_tokens: 8000,
      temperature: 0.5,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userPrompt },
        { role: 'assistant', content: raw },
        { role: 'user', content: `Tvoj prejšnji odgovor ima naslednje težave, ki jih MORAŠ popraviti:\n\n${issues.map(i => `- ${i}`).join('\n')}\n\nPopravi te težave in vrni POPRAVLJEN JSON. Vrni samo JSON, brez razlage.` },
      ],
    });
    let retryRaw = retryResponse.content[0].text.trim();
    retryRaw = retryRaw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
    try {
      content = sanitizeContent(JSON.parse(retryRaw));
    } catch (e) {
      console.warn('[PROPOSAL] Retry JSON parse failed, using sanitized original:', e.message);
    }
  }

  return content;
}

module.exports = { generateContent, validateContent, sanitizeContent, SYSTEM_PROMPT };
