// Generator ponudb orchestrator: leadData → slots (Haiku) → render (landing + 3 themed offers) → deploy 4 files → URL
// Deploys to ai.aiera.si/g/{slug}/  (landing)
//             ai.aiera.si/g/{slug}/offer-minimal.html
//             ai.aiera.si/g/{slug}/offer-modern.html
//             ai.aiera.si/g/{slug}/offer-premium.html

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fetch = require('node-fetch');

const { generateGeneratorSlots } = require('./slots');
const { renderLanding, renderOffer, renderTemplate } = require('./renderer');

const NETLIFY_SITE_ID = process.env.NETLIFY_SITE_ID || 'ed777b57-cb14-4997-91f9-733fe911fc70';
const GENERATOR_BASE_URL = process.env.GENERATOR_BASE_URL || 'https://ai.aiera.si';
const GENERATOR_PREFIX = process.env.GENERATOR_PREFIX || 'g';
const MANIFEST_PATH = './generator-files.json';

const OFFER_THEMES = ['minimal', 'modern', 'premium'];

function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')); }
  catch { return {}; }
}

function saveManifest(m) {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2));
}

function sha1(content) {
  return crypto.createHash('sha1').update(content).digest('hex');
}

function slugifyCompany(company) {
  return (company || 'ponudba')
    .toLowerCase()
    .replace(/[čć]/g, 'c').replace(/[š]/g, 's').replace(/[ž]/g, 'z').replace(/[đ]/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 40);
}

function randomHash(len = 4) {
  return crypto.randomBytes(8).toString('hex').slice(0, len);
}

function createSlug(leadData) {
  // URL slug = company only. NEVER the person's name. Empty -> "ponudba-<hash>".
  const company = leadData.company && leadData.company !== 'LinkedIn' ? leadData.company : '';
  return `${slugifyCompany(company)}-${randomHash(4)}`;
}

// Fetch latest published deploy's file manifest from Netlify - merge so we don't unpublish AIERA + B2Booster files.
async function fetchExistingManifest() {
  if (!process.env.NETLIFY_TOKEN) return null;
  try {
    const deploysRes = await fetch(
      `https://api.netlify.com/api/v1/sites/${NETLIFY_SITE_ID}/deploys?per_page=1`,
      { headers: { 'Authorization': `Bearer ${process.env.NETLIFY_TOKEN}` } }
    );
    if (!deploysRes.ok) {
      console.warn('[GENERATOR] Could not fetch latest deploy');
      return null;
    }
    const deploys = await deploysRes.json();
    if (!deploys.length) return null;
    const latestId = deploys[0].id;

    const filesRes = await fetch(
      `https://api.netlify.com/api/v1/deploys/${latestId}/files`,
      { headers: { 'Authorization': `Bearer ${process.env.NETLIFY_TOKEN}` } }
    );
    if (!filesRes.ok) {
      console.warn('[GENERATOR] Could not fetch deploy files');
      return null;
    }
    const files = await filesRes.json();
    const manifest = {};
    for (const f of files) manifest[f.path] = f.sha;
    console.log(`[GENERATOR] Inherited ${files.length} existing files`);
    return manifest;
  } catch (err) {
    console.warn('[GENERATOR] fetchExistingManifest error:', err.message);
    return null;
  }
}

// Deploys multiple files in a single Netlify deploy:
//   newFiles = { '/g/{slug}/index.html': htmlString, '/g/{slug}/offer-minimal.html': ..., ... }
// Inherits all existing files from the latest deploy so nothing gets unpublished.
async function deployFilesToNetlify(newFiles) {
  if (!process.env.NETLIFY_TOKEN) {
    console.warn('[GENERATOR] No NETLIFY_TOKEN, skipping deploy');
    return false;
  }
  const remoteManifest = await fetchExistingManifest();
  const localManifest = loadManifest();
  const manifest = { ...localManifest, ...(remoteManifest || {}) };

  // Compute hashes for new files and add to manifest
  const pathToContent = {}; // path → { hash, content }
  for (const [p, content] of Object.entries(newFiles)) {
    const h = sha1(content);
    manifest[p] = h;
    pathToContent[p] = { hash: h, content };
  }

  // Robots.txt (always include to keep AI-generated URLs out of crawlers)
  const robotsPath = `/${GENERATOR_PREFIX}/robots.txt`;
  const robotsContent = 'User-agent: *\nDisallow: /\n';
  const robotsHash = sha1(robotsContent);
  manifest[robotsPath] = robotsHash;
  pathToContent[robotsPath] = { hash: robotsHash, content: robotsContent };

  // Create deploy
  const deployRes = await fetch(`https://api.netlify.com/api/v1/sites/${NETLIFY_SITE_ID}/deploys`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.NETLIFY_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ files: manifest, async: false }),
  });

  if (!deployRes.ok) {
    throw new Error(`Netlify create deploy failed: ${await deployRes.text()}`);
  }
  const deploy = await deployRes.json();
  const required = deploy.required || [];

  // Upload each required file by hash
  for (const [filePath, info] of Object.entries(pathToContent)) {
    if (!required.includes(info.hash)) continue;
    const contentType = filePath.endsWith('.html') ? 'text/html; charset=utf-8'
      : filePath.endsWith('.txt') ? 'text/plain' : 'application/octet-stream';
    const uploadRes = await fetch(`https://api.netlify.com/api/v1/deploys/${deploy.id}/files${filePath}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${process.env.NETLIFY_TOKEN}`,
        'Content-Type': contentType,
      },
      body: info.content,
    });
    if (!uploadRes.ok) {
      throw new Error(`Netlify upload ${filePath} failed: ${await uploadRes.text()}`);
    }
  }

  saveManifest(manifest);
  console.log(`[GENERATOR] Deploy complete (${Object.keys(newFiles).length} new files)`);
  return true;
}

// Build all HTML files (landing + 3 themed offers). Used by /generator-preview and by the deploy pipeline.
async function buildGeneratorHTML(leadData, options = {}) {
  const slots = await generateGeneratorSlots(leadData);
  const slug = options.slug || createSlug(leadData);
  const baseOpts = { ...options, slug };

  const landingHtml = renderLanding(leadData, slots, baseOpts);
  const offerHtml = {};
  for (const theme of OFFER_THEMES) {
    offerHtml[theme] = renderOffer(leadData, slots, theme, baseOpts);
  }

  // Backward-compat 'html' field: returns the landing HTML (so old call sites still get the same shape)
  return { html: landingHtml, landingHtml, offerHtml, slots, slug };
}

// Full pipeline: build + deploy all 4 files. Returns the LANDING URL.
async function createAndDeployGeneratorOffer(leadData, options = {}) {
  try {
    const { landingHtml, offerHtml, slug } = await buildGeneratorHTML(leadData, options);

    const files = {};
    files[`/${GENERATOR_PREFIX}/${slug}/index.html`] = landingHtml;
    for (const theme of OFFER_THEMES) {
      files[`/${GENERATOR_PREFIX}/${slug}/offer-${theme}.html`] = offerHtml[theme];
    }

    await deployFilesToNetlify(files);

    const url = `${GENERATOR_BASE_URL}/${GENERATOR_PREFIX}/${slug}/`;
    console.log(`[GENERATOR] Live: ${url}`);
    return url;
  } catch (err) {
    console.error('[GENERATOR] Error:', err.message);
    if (err.stack) console.error(err.stack);
    return null;
  }
}

module.exports = {
  createAndDeployGeneratorOffer,
  buildGeneratorHTML,
  deployFilesToNetlify,
  // Backward-compat: keep old name as alias so any caller using `deployToNetlify(slug, html)` still works
  deployToNetlify: async (slug, html) => deployFilesToNetlify({ [`/${GENERATOR_PREFIX}/${slug}/index.html`]: html }),
  renderTemplate,
  renderLanding,
  renderOffer,
  GENERATOR_BASE_URL,
  GENERATOR_PREFIX,
  OFFER_THEMES,
  createSlug,
};
