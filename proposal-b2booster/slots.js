// B2Booster slot generator. Single Haiku call → JSON with all personalization slots.

const { default: Anthropic } = require('@anthropic-ai/sdk');

const SLOTS_PROMPT = `You generate JSON content slots for a Slovenian B2Booster sales offer page.

B2BOOSTER POSITIONING:
B2Booster is a done-for-you B2B AI outreach service. We find target accounts, identify decision makers, write personalized first-touch messages in their language, automate follow-ups, and an AI reply bot leads conversations to a meeting. Pricing: 790 EUR setup + 890 EUR/month, no annual lock-in. Sales teams stop doing manual prospecting, focus on closing.

LANGUAGE RULES (strict):
- Slovenian throughout, vikanje (Vi, Vas, Vam)
- No dashes (—), use hyphens (-) only
- Šumniki correct: š, č, ž
- No banned cliches ("se slišiva", "rezerviraj termin")
- No 1st person dual (dvojina): "se slišimo" NOT "se slišiva"
- Short, punchy, premium SaaS tone
- Avoid negative words (problem, težava, izziv)

INPUT YOU RECEIVE:
- Lead: firstName, lastName, title, company, industry, employees, seniority, country
- Their message (LinkedIn reply) or notification context
- Target market hypothesis (e.g. "international B2B sales")

YOUR OUTPUT: Return ONE valid JSON object. NO other text. NO markdown fences. Just the JSON.

REQUIRED JSON SCHEMA:
{
  "hero_eyebrow": "Prilagojen predlog za {Company}",
  "hero_h1_intro": "AI prevzame outreach.",
  "hero_h1_accent": "Prodajniki se posvetijo prodaji.",
  "lead_paragraph": "<2-3 sentences. Industry-specific. What B2Booster builds for them. Mention their geography/region if international.>",
  "lead_accent_paragraph": "<1-2 sentences. ROI angle for their size. Start with bold key phrase wrapped in <strong>. Use real numbers: '65% time on non-selling work', '4-5 dodatnih ur na dan'.>",
  "funnel_project_label": "<company-slug>.b2booster / <market> outreach",
  "funnel_msg": "<1 sentence. Example: 'Wien Industrial Buyer GmbH - prilagojeno sporočilo o avtomatizaciji nabavnih procesov, poslano v nemškem jeziku. Ocena ustreznosti 89/100.' Adapt to their actual target industry.>",
  "goal_section_lead": "<2-3 sentences. Why the system matters specifically for their type of business.>",
  "cta_eyebrow": "<Za g. {FirstName LastName} - {Title}, {Company}. Use 'ga.' if female-sounding name. Skip title clause if title unknown.>",
  "cta_h2": "<1 sentence. E.g. '{Company} lahko vzpostavi lasten AI outreach motor v 14 dneh.'>",
  "cta_paragraph": "<2 sentences. Offer next step (concrete presentation).>"
}

CRITICAL:
- All slot values must be plain strings (HTML allowed only in lead_accent_paragraph and funnel_msg, where a single <strong> is fine)
- Keep everything specific to the lead's industry/geography, never generic
- Return JSON only, valid, parseable. No code fences, no commentary.`;

async function generateB2BoosterSlots(leadData) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const anthropic = new Anthropic({ apiKey });

  const company = leadData.company && leadData.company !== 'LinkedIn'
    ? leadData.company
    : `${leadData.firstName || ''} ${leadData.lastName || ''}`.trim() || 'vaše podjetje';

  const userBlock = `Lead: ${leadData.firstName || ''} ${leadData.lastName || ''}
Title/role: ${leadData.title || leadData.role || 'unknown'}
Company: ${company}
Industry: ${leadData.industry || leadData.industryContext || 'unknown'}
Employees: ${leadData.employees || 'unknown'}
Seniority: ${leadData.seniority || 'unknown'}
Country: ${leadData.country || 'unknown'}
Their message: ${leadData.theirMessage || leadData.theirReply || '(no message yet, cold outreach context)'}
Target market hypothesis: ${leadData.targetMarketHypothesis || (leadData.country && leadData.country !== 'Slovenia' ? 'international B2B in their region' : 'B2B EU expansion')}

Generate the JSON now.`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4000,
    system: SLOTS_PROMPT,
    messages: [{ role: 'user', content: userBlock }]
  });

  let raw = response.content[0].text.trim();
  // Strip code fences if model wrapped output
  raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');

  let slots;
  try {
    slots = JSON.parse(raw);
  } catch (err) {
    console.error('[B2BOOSTER-SLOTS] JSON parse failed. Raw output (first 500 chars):', raw.slice(0, 500));
    throw new Error(`Slot JSON parse failed: ${err.message}`);
  }

  // Validate required fields
  const required = ['hero_eyebrow', 'lead_paragraph', 'goal_section_lead', 'cta_eyebrow', 'cta_h2'];
  for (const key of required) {
    if (!slots[key]) {
      console.warn(`[B2BOOSTER-SLOTS] Missing slot: ${key}`);
    }
  }

  return slots;
}

module.exports = { generateB2BoosterSlots, SLOTS_PROMPT };
