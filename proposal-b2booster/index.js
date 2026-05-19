// B2Booster orchestrator: leadData → slots (Haiku) → render template → deploy → URL
// Deploys to ponudbe.b2booster.eu/{slug}

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fetch = require('node-fetch');

const { generateB2BoosterSlots } = require('./slots');
const { renderTemplate } = require('./renderer');

const NETLIFY_SITE_ID = process.env.NETLIFY_SITE_ID || 'ed777b57-cb14-4997-91f9-733fe911fc70';
const B2BOOSTER_BASE_URL = process.env.B2BOOSTER_BASE_URL || 'https://ponudbe.b2booster.eu';
const B2BOOSTER_PREFIX = process.env.B2BOOSTER_PREFIX || 'p'; // ponudbe.b2booster.eu/p/{slug}
const MANIFEST_PATH = './b2booster-files.json';

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

async function deployToNetlify(slug, html) {
  if (!process.env.NETLIFY_TOKEN) {
    console.warn('[B2BOOSTER] No NETLIFY_TOKEN, skipping deploy');
    return null;
  }
  const manifest = loadManifest();
  const filePath = `/${B2BOOSTER_PREFIX}/${slug}/index.html`;
  const robotsPath = `/${B2BOOSTER_PREFIX}/robots.txt`;
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
    const txt = await deployRes.text();
    throw new Error(`Netlify create deploy failed: ${txt}`);
  }
  const deploy = await deployRes.json();

  // Upload required files
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
    const uploadRobots = await fetch(`https://api.netlify.com/api/v1/deploys/${deploy.id}/files${robotsPath}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${process.env.NETLIFY_TOKEN}`,
        'Content-Type': 'text/plain',
      },
      body: robotsContent,
    });
    if (!uploadRobots.ok) {
      console.warn('[B2BOOSTER] robots.txt upload failed:', await uploadRobots.text());
    }
  }

  saveManifest(manifest);
  const url = `${B2BOOSTER_BASE_URL}/${B2BOOSTER_PREFIX}/${slug}`;
  console.log(`[B2BOOSTER] Live: ${url}`);
  return url;
}

// Build HTML only (no deploy). Used for /b2booster-preview route.
async function buildB2BoosterHTML(leadData) {
  const slots = await generateB2BoosterSlots(leadData);
  const html = renderTemplate(leadData, slots);
  const slug = createSlug(leadData);
  return { html, slots, slug };
}

// Full pipeline: lead → slots → render → deploy → URL
async function createAndDeployB2BoosterOffer(leadData) {
  try {
    const { html, slug } = await buildB2BoosterHTML(leadData);
    const url = await deployToNetlify(slug, html);
    return url;
  } catch (err) {
    console.error('[B2BOOSTER] Error:', err.message);
    if (err.stack) console.error(err.stack);
    return null;
  }
}

module.exports = {
  createAndDeployB2BoosterOffer,
  buildB2BoosterHTML,
  deployToNetlify,
  B2BOOSTER_BASE_URL,
  B2BOOSTER_PREFIX,
};
