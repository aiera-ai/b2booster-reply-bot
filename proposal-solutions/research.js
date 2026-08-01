// Verified-facts research step for offer pages.
//
// Root cause of hallucinated offer copy: the slot model was asked to write
// company-specific lines with no company-specific input, so it invented them
// ("Gene Planet raste hitro", "spoznali Mašo in Martina"). This module gives the
// slot model a small set of CITED facts instead - or nothing at all, in which
// case the slot prompt is required to stay industry-generic.
//
// One web-search-enabled Claude call per lead. Raw fetch (the pinned SDK 0.39
// predates the web_search tool). Fails open: returns null, never throws.

const RESEARCH_ENABLED = process.env.OFFER_RESEARCH_ENABLED !== '0';
const RESEARCH_MODEL = process.env.OFFER_RESEARCH_MODEL || 'claude-sonnet-4-6';
const RESEARCH_TIMEOUT_MS = Number(process.env.OFFER_RESEARCH_TIMEOUT_MS || 75000);

// Industries where an AI pilot must be scoped away from the sensitive data set,
// and where over-promising triggers a compliance reflex instead of a meeting.
const SENSITIVE_HINTS = [
  'health', 'zdrav', 'medic', 'medicin', 'clinic', 'klinik', 'hospital', 'bolni',
  'pharma', 'farmac', 'genet', 'genom', 'dna', 'diagnost', 'laborator', 'biotech',
  'bioteh', 'patient', 'pacient', 'insur', 'zavarov', 'bank', 'financ', 'fintech',
  'lending', 'kredit', 'legal', 'odvetni', 'pravn', 'notar', 'otro', 'children',
  'school', 'sola', 'šola', 'hr ', 'kadrov', 'payroll', 'place',
];

function looksSensitive(leadData) {
  const hay = [leadData.industry, leadData.industryContext, leadData.company, leadData.researchSummary]
    .filter(Boolean).join(' ').toLowerCase();
  return SENSITIVE_HINTS.some(h => hay.includes(h));
}

const RESEARCH_PROMPT = `You are a B2B research analyst preparing input for a personalized sales page. Accuracy matters more than volume: a wrong fact kills the deal, a missing fact costs nothing.

Search the web for the company you are given. Then return ONE JSON object, no markdown fences, no prose:

{
  "found": true|false,
  "brand_name": "<the company's own official spelling and casing, exactly as it writes itself (e.g. 'GenePlanet', not 'Gene Planet'). If you cannot confirm it from a source, repeat the input spelling unchanged.>",
  "what_they_do": "<one factual sentence, plain and neutral. Empty string if unconfirmed.>",
  "facts": [
    {"claim": "<one short, checkable, non-promotional fact about the company - recent news, funding, expansion, markets, product line, scale>", "url": "<the source URL you actually opened>", "recency": "<YYYY-MM or 'undated'>"}
  ],
  "sensitive_data": true|false,
  "sensitive_reason": "<if true: which regulated data category they handle (health, genetic, patient, financial, legal, minors). Empty if false.>",
  "ai_maturity": "none|some|advanced",
  "ai_maturity_note": "<if they already publicly build or deploy their own AI/ML, say so in one sentence with the source. Empty otherwise.>"
}

HARD RULES:
- Every entry in "facts" MUST have a real URL you retrieved. No URL, no fact. Never fabricate a URL.
- Maximum 5 facts. Prefer the last 12 months. Prefer the company's own site, press releases and reputable press.
- No adjectives of praise, no "leading", no "innovative". Facts only.
- If search returns nothing usable, set found=false and facts=[]. That is a correct and acceptable answer.
- Never guess numbers. If a figure is not in a source, leave it out.`;

async function researchCompany(leadData) {
  if (!RESEARCH_ENABLED) return null;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const company = (leadData && leadData.company || '').trim();
  if (!apiKey || !company) return null;

  const fetchFn = global.fetch || require('node-fetch');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESEARCH_TIMEOUT_MS);

  try {
    const userBlock = [
      `Company: ${company}`,
      leadData.country && `Country: ${leadData.country}`,
      leadData.industry && `Industry (unverified, from our CRM): ${leadData.industry}`,
      leadData.website && `Website: ${leadData.website}`,
      `Contact person at the company: ${[leadData.firstName, leadData.lastName].filter(Boolean).join(' ') || 'unknown'}`,
      '',
      'Research this company now and return the JSON.',
    ].filter(Boolean).join('\n');

    const res = await fetchFn('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: RESEARCH_MODEL,
        max_tokens: 2500,
        system: RESEARCH_PROMPT,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 }],
        messages: [{ role: 'user', content: userBlock }],
      }),
    });

    if (!res.ok) {
      console.warn(`[OFFER-RESEARCH] HTTP ${res.status} - continuing without facts`);
      return null;
    }
    const data = await res.json();
    const textBlocks = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    const match = textBlocks.match(/\{[\s\S]*\}/);
    if (!match) {
      console.warn('[OFFER-RESEARCH] no JSON in response - continuing without facts');
      return null;
    }

    const parsed = JSON.parse(match[0]);
    const facts = (Array.isArray(parsed.facts) ? parsed.facts : [])
      .filter(f => f && typeof f.claim === 'string' && /^https?:\/\//i.test(f.url || ''))
      .slice(0, 5);

    const out = {
      found: parsed.found === true && facts.length > 0,
      brandName: (typeof parsed.brand_name === 'string' && parsed.brand_name.trim()) || company,
      whatTheyDo: (parsed.what_they_do || '').trim(),
      facts,
      sensitive: parsed.sensitive_data === true || looksSensitive(leadData),
      sensitiveReason: (parsed.sensitive_reason || '').trim(),
      aiMaturity: ['none', 'some', 'advanced'].includes(parsed.ai_maturity) ? parsed.ai_maturity : 'none',
      aiMaturityNote: (parsed.ai_maturity_note || '').trim(),
    };
    console.log(`[OFFER-RESEARCH] ${company}: ${facts.length} cited facts, brand="${out.brandName}", sensitive=${out.sensitive}, ai=${out.aiMaturity}`);
    return out;
  } catch (e) {
    console.warn('[OFFER-RESEARCH] failed, continuing without facts:', e.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { researchCompany, looksSensitive };
