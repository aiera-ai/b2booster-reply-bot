// Solution-module offer pages: fixed proven copy per AI solution module, a model
// picks 2-3 relevant modules per lead and writes only the company-specific lines.
// Build-only: serving/deploy stays in server.js (createAndServeOffer).
//
// Pipeline: research (cited facts) -> slots (Sonnet) -> quality gate -> render.
//
// Two return modes, and the difference matters:
//   null            -> this style does not apply (non-SI lead, no company).
//                      Caller falls back to the spirit builder.
//   throw w/ .qualityFail -> we could not produce copy good enough to send.
//                      Caller must NOT fall back; no offer page at all. The reply
//                      still goes out, just without a link. A missing page costs
//                      nothing, a bad one costs the deal.

const { generateSolutionSlots } = require('./slots');
const { renderPage } = require('./template');
const { researchCompany, looksSensitive } = require('./research');
const { validateSlots } = require('./validate');

const CALENDLY_URL = process.env.CALENDLY_AI_15MIN || 'https://calendly.com/aiera-koledar/aiera-ai';
const MAX_ATTEMPTS = Number(process.env.OFFER_SLOT_ATTEMPTS || 2);

function slugifyCompany(company) {
  return (company || 'ponudba')
    .toLowerCase()
    .replace(/[čć]/g, 'c').replace(/[š]/g, 's').replace(/[ž]/g, 'z').replace(/[đ]/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 40);
}

function qualityFail(message) {
  const err = new Error(message);
  err.qualityFail = true;
  return err;
}

async function buildSolutionsHTML(leadData) {
  // SI only for now - fixed module copy is Slovenian. Spirit handles the rest.
  if (leadData.language && leadData.language !== 'sl') {
    console.log(`[SOLUTIONS] Lead language "${leadData.language}" - falling back to spirit`);
    return null;
  }
  // Company must already be validated by the caller (resolveOfferCompany gate).
  if (!leadData.company || leadData.company === 'LinkedIn') {
    console.log('[SOLUTIONS] No company - falling back');
    return null;
  }

  // 1. Verified facts. Fails open to null - the slot prompt then stays generic
  //    instead of inventing colour, which is what produced "Gene Planet raste hitro".
  const research = await researchCompany(leadData);

  const canonicalBrand = (research && research.brandName) || leadData.company;
  if (canonicalBrand !== leadData.company) {
    console.log(`[SOLUTIONS] Brand corrected: "${leadData.company}" -> "${canonicalBrand}"`);
    leadData.company = canonicalBrand;
  }
  const sensitive = research ? research.sensitive : looksSensitive(leadData);

  const ctx = {
    canonicalBrand,
    rawCompany: leadData.company,
    firstName: leadData.firstName,
    lastName: leadData.lastName,
    title: leadData.title || leadData.role,
    industry: leadData.industry || leadData.industryContext,
    sensitive,
    facts: (research && research.facts) || [],
    theirMessage: leadData.theirMessage || leadData.theirReply || '',
  };

  // 2. Generate + gate. One retry, with the gate's own complaints fed back.
  let slots = null;
  let issues = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let raw;
    try {
      raw = await generateSolutionSlots(leadData, research, issues.length ? issues.map(i => `- ${i}`).join('\n') : null);
    } catch (e) {
      issues = [`generation error: ${e.message}`];
      console.warn(`[SOLUTIONS] attempt ${attempt} generation failed: ${e.message}`);
      continue;
    }
    const verdict = await validateSlots(raw, ctx);
    if (verdict.ok) { slots = verdict.slots; break; }
    issues = verdict.issues;
    console.warn(`[SOLUTIONS] attempt ${attempt} rejected by quality gate (${issues.length} issues)`);
  }

  if (!slots) {
    throw qualityFail(`quality gate rejected all ${MAX_ATTEMPTS} attempts for ${canonicalBrand}: ${issues.slice(0, 3).join(' | ')}`);
  }

  const slug = slugifyCompany(canonicalBrand);

  const meta = {
    calendlyUrl: CALENDLY_URL,
    pixelEndpoint: process.env.SERVER_URL ? `${process.env.SERVER_URL}/pixel/${slug}` : '',
    disablePixel: leadData.disablePixel === true || process.env.PROPOSAL_DISABLE_PIXEL === '1',
    pageUrl: process.env.OFFER_SERVE_URL ? `${String(process.env.OFFER_SERVE_URL).replace(/\/$/, '')}/${slug}` : '',
    sources: ctx.facts,
    sensitive,
  };

  const html = renderPage({ leadData, slots, meta });
  if (html.length > 99000) {
    throw qualityFail(`rendered HTML too large (${html.length})`);
  }
  console.log(`[SOLUTIONS] Built ${slug} (${slots.modules.length} modules, ${ctx.facts.length} sources, ${html.length} chars)`);
  return { html, slug, slots };
}

module.exports = { buildSolutionsHTML };
