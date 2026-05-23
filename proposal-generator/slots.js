// Generator ponudb - slot generator (Haiku).
// Produces BOTH:
//   1. landing page slots (Generator product page hero, why blocks, proof)
//   2. demo offer slots (full Lovable-quality offer: title, parties, categories, recap, manager)
// Used to render 4 deploy files per lead: landing + 3 themed demo offers (minimal/modern/premium).

const { default: Anthropic } = require('@anthropic-ai/sdk');

const SLOTS_PROMPT = `You generate JSON content slots for an AIERA "Generator ponudb" demo page set: ONE landing page + ONE demo offer (the offer is rendered in 3 visual themes, but content is identical).

PRODUCT POSITIONING:
AIERA Generator ponudb is a B2B SaaS + service that helps Slovenian sales teams generate personalized branded offers/quotes (Slovenian: "ponudbe"). Companies that send many B2B quotes (manufacturing, construction, IT services, distribution, electromechanical, HVAC, engineering, agencies, consulting) use it to:
- Generate first draft of offer in 30 seconds from their pricelist
- Send offers as personalized web pages (not PDF attachments) in their own brand
- Track when customer opens, how long they read, what they click
- Replace static Word/PDF quotes with branded interactive pages

Pricing is custom per segment. Pilot from 290 EUR/month + 490 EUR setup. SMB target.

YOUR JOB:
Given a lead's company, role, industry, etc., generate a realistic DEMO OFFER that LOOKS LIKE the kind of offer THIS LEAD'S COMPANY would send to ITS OWN customers. The demo shows the lead what their offers would look like through AIERA. The buyer side stays clearly generic (placeholder labels) so credibility is protected.

LANGUAGE RULES (HARD - apply to every Slovenian field):
- VIKANJE always (formal Vi/Vas/Vaš). Never tikanje. Never dvojina.
- Imperatives in vikanje form: "Rezervirajte", "Poglejte", "Shranite", "Kopirajte", "Potrdite". Never "Rezerviraj", "Poglej", "Shrani", "Kopiraj", "Potrdi".
- No em dashes (—), only hyphens (-) or commas.
- Correct šumniki (š, č, ž).
- Premium B2B Slovenian tone. No fluff.
- No banned cliches ("rezerviraj termin", "se slišiva", "z veseljem").

PLACEHOLDER RULES (protect credibility):
- BUYER NAME: never a real Slovenian company name. Use generic patterns: "Naročnik d.o.o.", "Vzorčni naročnik d.o.o.", or industry-fit generic like "Industrijski naročnik d.o.o.", "Tehnološki kupec d.o.o."
- BUYER CONTACT NAME: use a clearly common-template Slovenian name: "Janez Novak" or "Ana Kovač". Acceptable because the template makes clear this is a sample slot.
- BUYER CONTACT ROLE: industry-appropriate role like "Vodja nabave", "Komercialni direktor", "Direktor", "Vodja marketinga".
- BUYER EMAIL: generic format like "janez.novak@narocnik.si" (matches buyer name + buyer company slug).
- SELLER MAT ŠT, DAVČNA, TRR: use realistic-looking placeholder digits but NOT a real company match. Patterns: mat_st = "1234567000", davcna = "SI12345678", trr = "SI56 0000 0000 0000 000 (Vaša banka)".
- MANAGER (Vaš skrbnik): name "Ime Priimek", role "Skrbnik ključnih kupcev" (or industry-relevant), phone "+386 XX XXX XXX", email "ime.priimek@<seller_slug>.si", website "www.<seller_slug>.si". The template makes clear these are samples to be replaced.

OUTPUT: Return ONE valid JSON object. NO markdown fences. NO commentary.

REQUIRED SCHEMA:
{
  "landing": {
    "hero_headline": "<H1 first line. Address THE LEAD'S COMPANY. Example: 'Ponudbe ki jih Big Bang pošilja korporativnim kupcem,'>",
    "hero_headline_accent": "<H1 second line, gradient highlight. Example: 'zdaj v 30 sekundah.' or 'avtomatsko in v vaši podobi.'>",
    "hero_lead": "<2 sentences. Specific to their industry. What pain we solve for THEIR sales team. Mention concrete time saved or quote volume. VIKANJE.>",

    "style_minimal_title": "Minimalist",
    "style_minimal_sub": "<6-10 words. Industry-appropriate angle for clean/elegant brand. Example: 'Čisto in profesionalno, brez odvečnih detajlov.'>",
    "style_modern_title": "Modern",
    "style_modern_sub": "<6-10 words. Warm and approachable angle. Example: 'Topel in sodoben videz, primeren za premium blagovne znamke.'>",
    "style_premium_title": "Premium dark",
    "style_premium_sub": "<6-10 words. Luxe, dark, B2B enterprise angle. Example: 'Temen in luksuzen, za visoke B2B transakcije.'>",

    "why_lead_paragraph": "<2-3 sentences in VIKANJE. Why generic Word/PDF quotes lose deals. Industry-specific angle. Mention that buyers compare offers in real time and the best-presented one wins.>",
    "why_1_title": "<Short bold benefit 1 (no period). Example: 'V vaši grafični podobi, ne v generičnem PDF-u'>",
    "why_1_text": "<2 sentences, VIKANJE.>",
    "why_2_title": "<Benefit 2. Example: 'Sledenje odzivu v realnem času'>",
    "why_2_text": "<2 sentences, VIKANJE.>",
    "why_3_title": "<Benefit 3. Example: 'Personalizacija za vsakega kupca'>",
    "why_3_text": "<2 sentences. Mention AI tailoring per customer. VIKANJE.>",
    "why_4_title": "<Benefit 4. Example: '30-krat hitreje od ročne priprave'>",
    "why_4_text": "<2 sentences, VIKANJE.>",

    "proof_1_num": "287",
    "proof_1_label": "Pripravljenih ponudb na lastni agenciji",
    "proof_2_num": "531k EUR",
    "proof_2_label": "V pipeline-u v 13 mesecih",
    "proof_3_num": "22 %",
    "proof_3_label": "Delež zaključenih dogovorov"
  },

  "offer": {
    "offer_title": "<Short title of the offer subject. Specific to what the LEAD'S company SELLS. Example: 'Pisarniška oprema za marketing ekipo' or 'Strojna obdelava ohišij - serija 500 kos'. Max 60 chars.>",
    "offer_subtitle": "<1 sentence describing the scope. Example: 'Celotna oprema za 4 nove sodelavce v oddelku marketinga'. VIKANJE if it addresses anyone.>",
    "offer_ref": "<Offer reference. Format: 'XX-2026-05-001' where XX = seller initials.>",

    "seller_full_name": "<The LEAD'S OWN company legal name. Example: 'BIG BANG d.o.o.' or 'F.A. MAIK d.o.o.'>",
    "seller_address": "<Plausible address - real city for their HQ if known, street can be generic. Example: 'Šmartinska cesta 152, 1000 Ljubljana'>",
    "seller_mat_st": "<10-digit placeholder. Example: '1234567000'>",
    "seller_davcna": "<SI + 8 digits placeholder. Example: 'SI12345678'>",
    "seller_trr": "<Placeholder TRR. Example: 'SI56 0000 0000 0000 000 (Vaša banka)'>",

    "buyer_name": "<CLEARLY GENERIC sample buyer label. Never a real Slovenian company. Example: 'Naročnik d.o.o.', 'Industrijski naročnik d.o.o.', 'Tehnološki kupec d.o.o.'>",
    "buyer_address": "<Generic Slovenian address. Example: 'Cesta XYZ 7, 4000 Naklo'>",
    "buyer_contact_name": "<Common Slovenian sample name. Example: 'Janez Novak' or 'Ana Kovač'>",
    "buyer_contact_role": "<Industry-relevant role. Example: 'Vodja nabave', 'Komercialni direktor', 'Direktor', 'Vodja marketinga'>",
    "buyer_contact_email": "<Format: 'firstname.lastname@narocnik.si' matching buyer_contact_name + buyer_name slug>",

    "greeting_paragraphs": [
      "<Paragraph 1: Opener with proper Slovenian business salutation, VIKANJE. Reference buyer_contact_name. Example: 'Spoštovani gospod Novak, zahvaljujemo se vam za zaupanje in priložnost, da za vašo ekipo pripravimo celovito ponudbo.'>",
      "<Paragraph 2: Specific to what's being offered. 1-2 sentences. VIKANJE. May include <strong>bold</strong> for the key benefit.>",
      "<Paragraph 3 (optional): One additional sentence on pricing/savings angle. VIKANJE.>"
    ],

    "categories": [
      {
        "num": "1",
        "title": "<Category title. Industry-relevant. Example: 'Prenosni računalniki' or 'CNC obdelava ohišij'>",
        "items": [
          {
            "name": "<Specific product/service name. Industry-appropriate. Example: 'Lenovo IdeaPad Slim 3 16\\" i5/16GB/512GB/W11H'>",
            "sku": "<Internal SKU. Format: 'XX-NNNNNNN' where XX = seller initials. Example: 'BB-1564488'>",
            "desc": "<1 sentence technical description. Industry-relevant terminology.>",
            "orig_price": "<original price as string with 2 decimals. Example: '799.99'>",
            "final_price": "<discounted price. Example: '759.99'>",
            "discount_pct": "<percentage. Example: '5%' or '-5%'>",
            "quantity": "<count. Example: '4x' or '500x'>",
            "sum": "<total for this line. Example: '3039.96 EUR'>",
            "why_this_choice": "<2-3 sentences. WHY this specific product fits the buyer's stated needs. Industry-relevant reasoning. VIKANJE. This is the KILLER FEATURE - shows the lead what their offers will look like with AI-tailored justifications per item.>"
          }
        ]
      }
    ],

    "subtotal": "<sum of all items, e.g. '6070.21 EUR'>",
    "vat": "<22% of subtotal, e.g. '1335.45 EUR'>",
    "total": "<subtotal + vat, e.g. '7405.66 EUR'>",
    "savings": "<saving as positive number string, e.g. '319.50 EUR'>",

    "delivery_terms": [
      "<Term 1. Example: 'Dostava na naslov naročnika - brezplačno'>",
      "<Term 2. Example: 'Vnos in postavitev vključena'>",
      "<Term 3. Example: 'Predviden rok dostave: 5-7 delovnih dni po potrditvi'>",
      "<Term 4. Example: 'Odvoz embalaže vključen'>"
    ],

    "payment_terms": [
      "<Term 1. Example: 'Plačilo v 30 dneh po prejemu računa'>",
      "<Term 2. Example: 'Možnost plačila na obroke (do 12 obrokov)'>"
    ],

    "manager_name": "<Sample manager name. Example: 'Ime Priimek'>",
    "manager_role": "<Sales role appropriate for seller's industry. Example: 'Skrbnik ključnih kupcev', 'Vodja prodaje podjetjem', 'Komercialni svetovalec'>"
  }
}

CRITICAL CHECKS:
- categories MUST have 2-4 categories total
- Each category MUST have 2-4 items
- Numbers must be plausible and arithmetically reasonable (sum of items = subtotal, vat = 22% of subtotal, total = subtotal + vat)
- buyer side is GENERIC (no real SI companies, no real people other than common sample names)
- seller side IS the lead's company name + plausible details
- VIKANJE everywhere. No imperatives in tikanje form.
- All "why_this_choice" entries are substantive (not generic filler) - they show off the AI's ability to tailor reasoning per item
- Return JSON only. Parseable. No fences.`;

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

Generate the JSON now. Remember:
1. The DEMO OFFER must show what THE LEAD'S COMPANY would send to ITS OWN customer (not what we sell).
2. VIKANJE everywhere.
3. Generic buyer side, real-looking seller side.
4. Each item gets a substantive "why_this_choice" reasoning.`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 6000,
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

  // Validate top-level shape
  if (!slots.landing || !slots.offer) {
    throw new Error('Slots missing landing or offer block');
  }

  // Validate required offer fields
  const requiredOffer = ['offer_title', 'seller_full_name', 'buyer_name', 'categories', 'subtotal', 'vat', 'total'];
  for (const key of requiredOffer) {
    if (!slots.offer[key]) console.warn(`[GENERATOR-SLOTS] Missing offer.${key}`);
  }
  if (!Array.isArray(slots.offer.categories) || slots.offer.categories.length < 1) {
    console.warn('[GENERATOR-SLOTS] offer.categories missing or empty');
  }

  // Validate required landing fields
  const requiredLanding = ['hero_headline', 'hero_lead', 'why_lead_paragraph'];
  for (const key of requiredLanding) {
    if (!slots.landing[key]) console.warn(`[GENERATOR-SLOTS] Missing landing.${key}`);
  }

  return slots;
}

module.exports = { generateGeneratorSlots, SLOTS_PROMPT };
