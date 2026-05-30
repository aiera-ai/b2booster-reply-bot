// Public orchestrator: lead data → content → HTML → Netlify deploy → URL
// Drop-in replacement for the existing createAndDeployOffer() in server.js.

const fs = require('fs');
const crypto = require('crypto');
const fetch = require('node-fetch');

const { detectPersona, getPersona } = require('./personas');
const { themeFromContext, getTheme } = require('./colors');
const { generateContent } = require('./generator');
const { renderPage } = require('./template');

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const NETLIFY_SITE_ID = process.env.NETLIFY_SITE_ID || 'ed777b57-cb14-4997-91f9-733fe911fc70';
const NETLIFY_BASE_URL = process.env.PROPOSAL_BASE_URL || 'https://ai.aiera.si';
const PROPOSAL_PREFIX = process.env.PROPOSAL_PREFIX || 'predlog'; // ai.aiera.si/predlog/{slug}
const PROPOSAL_MANIFEST = './proposal-files.json';
const CALENDLY_URL = process.env.CALENDLY_AI_15MIN || 'https://calendly.com/aiera-koledar/aiera-ai';

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function loadManifest() {
  if (!fs.existsSync(PROPOSAL_MANIFEST)) {
    // Migrate from existing offer-files.json if present? No - keep separate.
    return {};
  }
  try { return JSON.parse(fs.readFileSync(PROPOSAL_MANIFEST, 'utf8')); }
  catch { return {}; }
}
function saveManifest(m) {
  fs.writeFileSync(PROPOSAL_MANIFEST, JSON.stringify(m, null, 2));
}
function sha1(content) {
  return crypto.createHash('sha1').update(content).digest('hex');
}
function createSlug(company) {
  return (company || 'predlog')
    .toLowerCase()
    .replace(/[čć]/g, 'c').replace(/[š]/g, 's').replace(/[ž]/g, 'z').replace(/[đ]/g, 'd')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .substring(0, 40);
}
function dedupeSlug(slug, manifest) {
  const base = slug;
  let i = 1;
  while (Object.keys(manifest).some(k => k === `/${PROPOSAL_PREFIX}/${slug}/index.html`)) {
    // Already exists → append counter only if content differs
    // (in practice we overwrite on same slug; only dedupe if user wants new variant)
    slug = `${base}-${++i}`;
    if (i > 20) break;
  }
  return slug;
}

// ─── DEPLOY ──────────────────────────────────────────────────────────────────

async function deployToNetlify(slug, html) {
  if (!process.env.NETLIFY_TOKEN) {
    console.warn('[PROPOSAL] No NETLIFY_TOKEN - skipping deploy');
    return null;
  }
  const manifest = loadManifest();
  const filePath = `/${PROPOSAL_PREFIX}/${slug}/index.html`;
  const fileHash = sha1(html);
  manifest[filePath] = fileHash;

  const deployRes = await fetch(`https://api.netlify.com/api/v1/sites/${NETLIFY_SITE_ID}/deploys`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.NETLIFY_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ files: manifest, async: false }),
  });
  if (!deployRes.ok) {
    const errText = await deployRes.text();
    throw new Error(`Netlify create deploy failed: ${errText}`);
  }
  const deploy = await deployRes.json();

  if (deploy.required && deploy.required.includes(fileHash)) {
    const uploadRes = await fetch(`https://api.netlify.com/api/v1/deploys/${deploy.id}/files${filePath}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${process.env.NETLIFY_TOKEN}`,
        'Content-Type': 'application/octet-stream',
      },
      body: html,
    });
    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`Netlify upload failed: ${errText}`);
    }
  }

  saveManifest(manifest);
  const url = `${NETLIFY_BASE_URL}/${PROPOSAL_PREFIX}/${slug}`;
  console.log(`[PROPOSAL] Live: ${url}`);
  return url;
}

// ─── BUILD ONLY (no deploy) ──────────────────────────────────────────────────

async function buildProposalHTML(leadData) {
  const personaKey = leadData.personaOverride || detectPersona(leadData.title || leadData.role);
  const persona = getPersona(personaKey);
  const themeName = leadData.themeOverride || themeFromContext({
    industry: leadData.industry || leadData.industryContext,
    persona: leadData.title || leadData.role,
  });

  const company = leadData.company && leadData.company !== 'LinkedIn'
    ? leadData.company
    : `${leadData.firstName || ''} ${leadData.lastName || ''}`.trim();
  const fullName = `${leadData.firstName || ''} ${leadData.lastName || ''}`.trim();
  const titleRoleStr = leadData.title || leadData.role || '';
  const titlePrefix = leadData.gender === 'female' ? 'ga.' : 'g.';

  const recipientFull = [
    titlePrefix,
    fullName,
    titleRoleStr ? `, ${titleRoleStr}` : '',
    company ? ` - ${company}` : '',
  ].join('').replace(/^,\s*/, '').trim();

  const recipientShort = `${titlePrefix} ${leadData.firstName || ''} ${leadData.lastName || ''}`.trim();

  // URL slug = company. NEVER the person's name (the `company` display var above
  // falls back to the person name, so read leadData.company directly here).
  // When company is unknown, use a neutral stable hash instead of the name.
  const realCompany = (leadData.company && leadData.company !== 'LinkedIn') ? leadData.company : '';
  const slug = realCompany
    ? createSlug(realCompany)
    : `ponudba-${sha1((fullName || '') + (leadData.linkedinUrl || '')).slice(0, 6)}`;

  const meta = {
    company,
    companyDisplay: (company || fullName).toUpperCase(),
    recipientFull,
    recipientShort,
    slug,
    calendlyUrl: CALENDLY_URL,
    pixelEndpoint: process.env.SERVER_URL ? `${process.env.SERVER_URL}/pixel/${slug}` : `/pixel/${slug}`,
    disablePixel: leadData.disablePixel === true || process.env.PROPOSAL_DISABLE_PIXEL === '1',
  };

  console.log(`[PROPOSAL] Generating content for ${company} | persona=${personaKey} | theme=${themeName}`);
  const content = await generateContent({ leadData, persona, themeName });

  const html = renderPage({ persona, theme: themeName, content, meta });
  return { html, slug, persona: personaKey, theme: themeName, meta };
}

// ─── PUBLIC: createAndDeployProposal (drop-in replacement) ───────────────────

// Optional Airtable insert hook (injected by server.js to avoid circular require)
let onProposalGenerated = null;
function setOnProposalGenerated(fn) { onProposalGenerated = fn; }

async function createAndDeployProposal(leadData) {
  try {
    const { html, slug, persona, theme, meta } = await buildProposalHTML(leadData);
    const url = await deployToNetlify(slug, html);
    // Track in Airtable Proposals table (fire-and-forget, never blocks return)
    if (onProposalGenerated && url) {
      Promise.resolve()
        .then(() => onProposalGenerated({ slug, persona, theme, url, leadData, meta }))
        .catch(err => console.error('[PROPOSAL] onProposalGenerated hook error:', err.message));
    }
    return url;
  } catch (err) {
    console.error('[PROPOSAL] Error:', err.message);
    return null;
  }
}

module.exports = {
  createAndDeployProposal,
  buildProposalHTML,
  deployToNetlify,
  setOnProposalGenerated,
};
