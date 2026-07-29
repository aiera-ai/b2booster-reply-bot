// Solution-module offer pages (habeco/dentalplan style): fixed proven copy per
// AI solution module, Haiku picks 4-6 relevant modules per lead and writes only
// the industry-specific lines. Build-only: serving/deploy stays in server.js
// (createAndServeOffer), same as the other proposal builders.
//
// Returns null (instead of throwing) when this style cannot serve the lead well
// - currently: non-Slovenian leads (module copy is SI). Caller falls back to
// the spirit builder, which handles languages.

const crypto = require('crypto');
const { generateSolutionSlots } = require('./slots');
const { renderPage } = require('./template');

const CALENDLY_URL = process.env.CALENDLY_AI_15MIN || 'https://calendly.com/aiera-koledar/aiera-ai';

function slugifyCompany(company) {
  return (company || 'ponudba')
    .toLowerCase()
    .replace(/[čć]/g, 'c').replace(/[š]/g, 's').replace(/[ž]/g, 'z').replace(/[đ]/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 40);
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

  const slots = await generateSolutionSlots(leadData);
  const slug = slugifyCompany(leadData.company);

  const meta = {
    calendlyUrl: CALENDLY_URL,
    pixelEndpoint: process.env.SERVER_URL ? `${process.env.SERVER_URL}/pixel/${slug}` : '',
    disablePixel: leadData.disablePixel === true || process.env.PROPOSAL_DISABLE_PIXEL === '1',
  };

  const html = renderPage({ leadData, slots, meta });
  if (html.length > 99000) {
    console.warn(`[SOLUTIONS] HTML too large (${html.length}) - falling back to spirit`);
    return null;
  }
  console.log(`[SOLUTIONS] Built ${slug} (${slots.modules.length} modules, ${html.length} chars)`);
  return { html, slug, slots };
}

module.exports = { buildSolutionsHTML };
