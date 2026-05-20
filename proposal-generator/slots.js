// Generator ponudb - slot generator (Haiku).
// Produces lead-specific demo offer + wrap page slots.
// Optimized for Slovenian SMB B2B context.

const { default: Anthropic } = require('@anthropic-ai/sdk');

const SLOTS_PROMPT = `You generate JSON content slots for a Slovenian AIERA "Generator ponudb" demo page.

PRODUCT POSITIONING:
AIERA Generator ponudb is a B2B SaaS + service that helps sales teams generate personalized offers/quotes (Slovenian: "ponudbe") for their customers. Companies that send many B2B quotes (manufacturing, construction, IT services, distribution, electromechanical, HVAC, engineering, agencies, consulting) use it to:
- Generate first draft of offer in 30 seconds from their pricelist
- Send offers as personalized web pages (not PDF attachments) in their own brand
- Track when customer opens, how long they read, what they click
- Replace static Word/PDF quotes with branded interactive pages

Pricing is custom per segment. Pilot from 290 EUR/month + 490 EUR setup. SMB target.

YOUR JOB:
Given a lead's company, role, industry, etc., generate a realistic DEMO OFFER that LOOKS LIKE the kind of offer THIS LEAD'S COMPANY would send to ITS OWN customers. The demo shows the lead what their offers would look like through AIERA.

EXAMPLE:
- Lead is at "Big Bang" (electronics retailer/IT distributor) → demo offer shows Big Bang selling office equipment to a corporate customer like "Merkur"
- Lead is at "F.A. Maik" (metal manufacturing) → demo offer shows F.A. Maik selling parts to a customer like "Hidria"
- Lead is at "Petrol" → demo offer shows Petrol selling fleet fuel cards to a corporate customer

So you must infer: what does the lead's company SELL, and to WHOM?

LANGUAGE RULES:
- Slovenian throughout, vikanje (Vi, Vas, Vam)
- No em dashes (—), only hyphens (-)
- Correct šumniki: š, č, ž
- Punchy, premium SaaS tone
- No banned cliches ("rezerviraj termin", "se slišiva")

OUTPUT: Return ONE valid JSON object. NO markdown fences, NO commentary.

REQUIRED SCHEMA:
{
  "hero_headline": "<H1 first line. Address THE LEAD'S COMPANY. Example: 'Ponudbe ki jih Big Bang pošilja korporativnim kupcem,'>",
  "hero_headline_accent": "<H1 second line, gradient highlight. Example: 'zdaj v 30 sekundah.' or 'avtomatsko in v vaši podobi.'>",
  "hero_lead": "<2 sentences. Specific to their industry. What pain we solve for THEIR sales team. Mention concrete time saved or quote volume.>",

  "demo_seller_name": "<The LEAD'S OWN company name, formatted as they would present it. Example: 'BIG BANG' or 'F.A. MAIK d.o.o.'>",
  "demo_seller_address": "<Plausible Slovenian address for their HQ. Use real city if known, generic street if not. Example: 'Šmartinska cesta 152, 1000 Ljubljana'>",
  "demo_offer_ref": "<Offer reference number. Format: 'XX-2026-MM-NNN'. Example: 'BB-2026-04-MK-001'>",
  "demo_eyebrow": "PONUDBA",
  "demo_title": "<Short title of the offer subject. Specific to what the LEAD'S company SELLS. Example: 'Pisarniška oprema za marketing ekipo' or 'Strojna obdelava ohišij - serija 500 kos'>",
  "demo_subtitle": "<1 sentence describing what's in the offer. Example: 'Celotna oprema za 4 nove sodelavce v oddelku marketinga'>",
  "demo_buyer_name": "<A plausible Slovenian B2B customer that the lead's company would sell to. Example: 'Merkur trgovina, d.o.o.' or 'Hidria d.o.o.'>",
  "demo_buyer_contact": "<Plausible contact at buyer company. Example: 'Janez Korelc, Vodja nabave'>",
  "demo_greeting": "<2-3 sentences greeting paragraph from the seller to the buyer. Slovenian business tone. Mention why this offer fits their needs.>",

  "demo_items": [
    {
      "num": "1",
      "title": "<Product/service name as the LEAD'S company would name it>",
      "desc": "<1 sentence description. Industry-specific terminology.>",
      "orig_price": "<original price, e.g. '799.99'>",
      "final_price": "<discounted, e.g. '759.99'>",
      "quantity": "<e.g. '4x'>",
      "sum": "<total for this line, e.g. '3039.96 EUR'>"
    },
    {"num": "2", "title": "...", "desc": "...", "orig_price": "...", "final_price": "...", "quantity": "...", "sum": "..."},
    {"num": "3", "title": "...", "desc": "...", "orig_price": "...", "final_price": "...", "quantity": "...", "sum": "..."},
    {"num": "4", "title": "...", "desc": "...", "orig_price": "...", "final_price": "...", "quantity": "...", "sum": "..."},
    {"num": "5", "title": "...", "desc": "...", "orig_price": "...", "final_price": "...", "quantity": "...", "sum": "..."}
  ],

  "demo_subtotal": "<sum of all items, e.g. '6070.21 EUR'>",
  "demo_vat": "<22% of subtotal, e.g. '1335.45 EUR'>",
  "demo_total": "<subtotal + vat, e.g. '7405.66 EUR'>",
  "demo_savings": "<saving vs original prices, negative number, e.g. '-319.50 EUR'>",
  "demo_valid_until": "<a date 21 days from preparation, Slovenian format. Example: '15. junij 2026'>",
  "demo_rep_name": "<Plausible Slovenian sales rep at the lead's company. Example: 'Andraž Kern'>",
  "demo_rep_phone": "<plausible SI mobile, e.g. '+386 51 369 554'>",

  "why_lead_paragraph": "<2-3 sentences. Why generic Word/PDF quotes lose deals. Industry-specific angle. Mention that buyers compare offers in real time and the best-presented one wins.>",
  "why_1_title": "<Short bold benefit 1. Example: 'V vaši grafični podobi, ne v generičnem PDF'>",
  "why_1_text": "<2 sentences supporting it.>",
  "why_2_title": "<Benefit 2. Example: 'Sledenje odzivu v realnem času'>",
  "why_2_text": "<2 sentences.>",
  "why_3_title": "<Benefit 3. Example: 'Personalizacija za vsakega kupca'>",
  "why_3_text": "<2 sentences. Mention AI tailoring per customer.>",
  "why_4_title": "<Benefit 4. Example: '30-krat hitreje od ročne priprave'>",
  "why_4_text": "<2 sentences.>",

  "proof_1_num": "287",
  "proof_1_label": "Pripravljenih ponudb na lastni agenciji",
  "proof_2_num": "531k EUR",
  "proof_2_label": "V pipeline-u v 13 mesecih",
  "proof_3_num": "22 %",
  "proof_3_label": "Delež zaključenih dogovorov"
}

CRITICAL:
- demo_items must have 5 realistic line items that match the LEAD'S COMPANY'S product/service portfolio
- demo_buyer must be a realistic Slovenian B2B customer that the lead's company actually sells to
- Numbers must be plausible (no million-EUR offers unless it's a heavy industry deal)
- All slot values are plain strings, no nested HTML except where noted
- Use realistic Slovenian product names and terminology for the lead's industry
- Return JSON only, valid, parseable, no fences, no commentary`;

async function generateGeneratorSlots(leadData) {
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
Country: ${leadData.country || 'Slovenia'}
Their message: ${leadData.theirMessage || leadData.theirReply || '(no message yet, cold outreach context)'}

Generate the JSON now. Remember: the DEMO OFFER must show what THE LEAD'S COMPANY would send to ITS OWN customer (not what we sell).`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4000,
    system: SLOTS_PROMPT,
    messages: [{ role: 'user', content: userBlock }]
  });

  let raw = response.content[0].text.trim();
  raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');

  let slots;
  try {
    slots = JSON.parse(raw);
  } catch (err) {
    console.error('[GENERATOR-SLOTS] JSON parse failed. Raw (first 500):', raw.slice(0, 500));
    throw new Error(`Slot JSON parse failed: ${err.message}`);
  }

  // Validate required fields
  const required = ['hero_headline', 'hero_lead', 'demo_seller_name', 'demo_title', 'demo_buyer_name', 'demo_items', 'why_lead_paragraph'];
  for (const key of required) {
    if (!slots[key]) console.warn(`[GENERATOR-SLOTS] Missing slot: ${key}`);
  }

  if (!Array.isArray(slots.demo_items) || slots.demo_items.length < 3) {
    console.warn('[GENERATOR-SLOTS] demo_items missing or too short');
  }

  return slots;
}

module.exports = { generateGeneratorSlots, SLOTS_PROMPT };
