// Generator ponudb orchestrator: leadData → slots (Haiku) → render → deploy → URL
// Deploys to ai.aiera.si/g/{slug}

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fetch = require('node-fetch');

const { generateGeneratorSlots } = require('./slots');
const { renderTemplate } = require('./renderer');

const NETLIFY_SITE_ID = process.env.NETLIFY_SITE_ID || 'ed777b57-cb14-4997-91f9-733fe911fc70';
const GENERATOR_BASE_URL = process.env.GENERATOR_BASE_URL || 'https://ai.aiera.si';
const GENERATOR_PREFIX = process.env.GENERATOR_PREFIX || 'g'; // ai.aiera.si/g/{slug}
const MANIFEST_PATH = './generator-files.json';

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
  const company = leadData.company && leadData.company !== 'LinkedIn'
    ? leadData.company
    : `${leadData.firstName || ''}-${leadData.lastName || ''}`;
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

async function deployToNetlify(slug, html) {
  if (!process.env.NETLIFY_TOKEN) {
    console.warn('[GENERATOR] No NETLIFY_TOKEN, skipping deploy');
    return null;
  }
  const remoteManifest = await fetchExistingManifest();
  const localManifest = loadManifest();
  const manifest = { ...localManifest, ...(remoteManifest || {}) };

  const filePath = `/${GENERATOR_PREFIX}/${slug}/index.html`;
  const robotsPath = `/${GENERATOR_PREFIX}/robots.txt`;
  const robotsContent = 'User-agent: *\nDisallow: /\n';

  const fileHash = sha1(html);
  const robotsHash = sha1(robotsContent);
  manifest[filePath] = fileHash;
  manifest[robotsPath] = robotsHash;

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

  if (required.includes(fileHash)) {
    const uploadRes = await fetch(`https://api.netlify.com/api/v1/deploys/${deploy.id}/files${filePath}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${process.env.NETLIFY_TOKEN}`,
        'Content-Type': 'application/octet-stream',
      },
      body: html,
    });
    if (!uploadRes.ok) {
      throw new Error(`Netlify upload html failed: ${await uploadRes.text()}`);
    }
  }

  if (required.includes(robotsHash)) {
    await fetch(`https://api.netlify.com/api/v1/deploys/${deploy.id}/files${robotsPath}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${process.env.NETLIFY_TOKEN}`, 'Content-Type': 'text/plain' },
      body: robotsContent,
    });
  }

  saveManifest(manifest);
  const url = `${GENERATOR_BASE_URL}/${GENERATOR_PREFIX}/${slug}`;
  console.log(`[GENERATOR] Live: ${url}`);
  return url;
}

// Build HTML only (for /generator-preview)
async function buildGeneratorHTML(leadData, options = {}) {
  const slots = await generateGeneratorSlots(leadData);
  const slug = options.slug || createSlug(leadData);
  const html = renderTemplate(leadData, slots, { ...options, slug });
  return { html, slots, slug };
}

// Full pipeline
async function createAndDeployGeneratorOffer(leadData, options = {}) {
  try {
    const { html, slug } = await buildGeneratorHTML(leadData, options);
    const url = await deployToNetlify(slug, html);
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
  deployToNetlify,
  GENERATOR_BASE_URL,
  GENERATOR_PREFIX,
  createSlug,
};
