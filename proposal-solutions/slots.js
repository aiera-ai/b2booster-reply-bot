// Slot generator for solution-module offer pages. ONE Haiku call picks 4-6
// relevant modules for the lead's industry and writes only the industry-specific
// lines. All core module copy is fixed in modules.js.

const { default: Anthropic } = require('@anthropic-ai/sdk');
const { MODULE_IDS } = require('./modules');

const SLOTS_PROMPT = `You generate JSON content slots for a Slovenian AIERA sales offer page, personalized per company.

AIERA POSITIONING:
AIERA is a Slovenian AI agency (founder Žan Bagarič). It builds practical AI systems for companies: B2B outbound lead-gen (B2Booster), AI quote/offer generators, AI landing page generators, AI marketing content production, on-site AI advisors, chatbots, AI customer service, and end-to-end AI agents. References: 30+ companies in SI and EU (Munchies, Megasplet, Valtheron, B2Booster, NordLogistics, RedEyeMonkey).

AVAILABLE SOLUTION MODULES (pick 4-6, ordered by relevance for THIS company):
- outbound: systematic B2B lead-gen / outreach (almost always relevant for B2B; put first when picked)
- generator_ponudb: AI generator of personalized quotes/offers (relevant when they send quotes to clients)
- landing_gen: AI landing page generator (relevant for campaigns, foreign markets, seasonal business)
- marketing_content: AI content production - images, video, blog, SEO
- svetovalec: on-site AI product/service advisor (relevant with a large catalog or complex choice)
- chatbot: website AI chatbot for FAQ + qualification
- customer_service: AI drafts replies to inbound mail, staff approves, gradual autopilot
- agenti: end-to-end AI agents for repeatable orders/processes

LANGUAGE RULES (strict):
- Slovenian throughout, vikanje (Vi, Vas, Vam)
- No dashes (—), use hyphens (-) only
- Šumniki correct: š, č, ž
- No 1st person dual: "se slišimo" NOT "se slišiva"
- Short, punchy, premium tone. Avoid negative words (problem, težava, izziv)
- Never invent facts about the company. Use only what the input states or what is safely generic for the industry.

INPUT: lead (name, title, company, industry, employees, country), their message, optional research notes.

OUTPUT: ONE valid JSON object, nothing else, no markdown fences:
{
  "hero_h1": "<'AI za rast {Company} - od X do Y.' style. Company-first, concrete, max 12 words>",
  "hero_sub": "<2-3 sentences: what concrete AI solutions bring this company - new clients, faster quotes, new markets, less manual work. Mention the company by name once.>",
  "why_now_title": "<1 sentence: '{Company} ima X. AI doda Y.' pattern>",
  "why_now_body": "<2-3 sentences: which part of their work AI leverages most, tied to their industry>",
  "quick_wins": [ {"title": "<3-5 words>", "desc": "<1 sentence>"}, {..}, {..} ],
  "modules": [ {"id": "<module id>", "intro": "<1-2 sentences tying THIS module to their industry/company. Specific, not generic.>"}, ... 4-6 items ],
  "start_modules": "<1 sentence: which 2 modules to start with and why>",
  "cta_paragraph": "<2 sentences proposing a short call to pick the first step>"
}`;

async function generateSolutionSlots(leadData) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  const anthropic = new Anthropic({ apiKey });

  const userBlock = `Lead: ${leadData.firstName || ''} ${leadData.lastName || ''}
Title/role: ${leadData.title || leadData.role || 'unknown'}
Company: ${leadData.company}
Industry: ${leadData.industry || leadData.industryContext || 'unknown'}
Employees: ${leadData.employees || 'unknown'}
Country: ${leadData.country || 'unknown'}
Their message: ${leadData.theirMessage || leadData.theirReply || '(none)'}
Research notes: ${leadData.researchSummary || leadData.fitReason || '(none)'}

Generate the JSON now.`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 3000,
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

  // Validate: required strings + 4-6 known module ids.
  for (const key of ['hero_h1', 'hero_sub', 'why_now_title', 'why_now_body', 'start_modules', 'cta_paragraph']) {
    if (!slots[key] || typeof slots[key] !== 'string') throw new Error(`Missing slot: ${key}`);
  }
  if (!Array.isArray(slots.quick_wins) || slots.quick_wins.length < 2) throw new Error('Missing quick_wins');
  slots.quick_wins = slots.quick_wins.slice(0, 3);
  if (!Array.isArray(slots.modules)) throw new Error('Missing modules');
  slots.modules = slots.modules.filter(m => m && MODULE_IDS.includes(m.id));
  // Dedupe, keep order
  const seen = new Set();
  slots.modules = slots.modules.filter(m => (seen.has(m.id) ? false : seen.add(m.id)));
  if (slots.modules.length < 3) throw new Error(`Too few valid modules (${slots.modules.length})`);
  slots.modules = slots.modules.slice(0, 6);

  return slots;
}

module.exports = { generateSolutionSlots, SLOTS_PROMPT };
