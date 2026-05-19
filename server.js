require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const fetch = require('node-fetch');
const fs = require('fs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

// New deterministic-template proposal generator (spirit-style, no prices, meeting-focused)
const { createAndDeployProposal: createAndDeployProposalSpirit, setOnProposalGenerated } = require('./proposal');

// ─── GLOBAL ERROR HANDLERS (prevent process crash) ────────────────────────────
process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err.message);
});

const app = express();

// CORS - allow file:// and all origins (healthcheck, local tools)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const PENDING_FILE = './pending.json';
const TRAINING_FILE = './training_examples.json';

// ─── AIRTABLE INTEGRATION ────────────────────────────────────────────────────

const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || 'appDYFcKNxPmZw3P7';
const AT_LEADS = 'tblfobqavxfv7hqC2';
const AT_MESSAGES = 'tblNvqZEFcNaOwbnO';
const AT_PROPOSALS = 'tblHS9tAl7c1XAQpi';

async function airtableRequest(method, endpoint, body) {
  if (!AIRTABLE_PAT) return null;
  try {
    const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${endpoint}`, {
      method,
      headers: {
        'Authorization': `Bearer ${AIRTABLE_PAT}`,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000)
    });
    return await res.json();
  } catch (e) {
    console.error('[AIRTABLE] Request error:', e.message);
    return null;
  }
}

async function airtableUpsertLead(linkedinUrl, leadName, campaign, channel, status, lastMessage, enrichData = {}) {
  if (!AIRTABLE_PAT) return;
  try {
    const filter = encodeURIComponent(`{LinkedIn URL}="${linkedinUrl}"`);
    const existing = await airtableRequest('GET', `${AT_LEADS}?filterByFormula=${filter}&maxRecords=1`);
    const today = new Date().toISOString().split('T')[0];
    const fields = {
      'Lead Name': leadName || '',
      'LinkedIn URL': linkedinUrl || '',
      'Campaign': campaign || '',
      'Channel': channel || 'linkedin',
      'Status': status || 'New',
      'Last Message': (lastMessage || '').substring(0, 500),
      'Last Activity': today
    };
    if (enrichData.email) fields['Email'] = enrichData.email;
    if (enrichData.phone) fields['Phone'] = enrichData.phone;
    if (existing?.records?.length > 0) {
      await airtableRequest('PATCH', `${AT_LEADS}/${existing.records[0].id}`, { fields });
      console.log(`[AIRTABLE] Lead updated: ${leadName}`);
    } else {
      await airtableRequest('POST', AT_LEADS, { records: [{ fields }] });
      console.log(`[AIRTABLE] Lead created: ${leadName}`);
    }
  } catch (e) {
    console.error('[AIRTABLE] upsertLead error:', e.message);
  }
}

async function airtableLogMessage(leadName, linkedinUrl, direction, intent, text, draft, sent) {
  if (!AIRTABLE_PAT) return;
  try {
    const fields = {
      'Message ID': `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      'Lead Name': leadName || '',
      'LinkedIn URL': linkedinUrl || '',
      'Direction': direction || 'inbound',
      'Intent': intent || 'neutral',
      'Text': (text || '').substring(0, 5000),
      'Draft Reply': (draft || '').substring(0, 5000),
      'Sent': sent || false,
      'Timestamp': new Date().toISOString()
    };
    await airtableRequest('POST', AT_MESSAGES, { records: [{ fields }] });
    console.log(`[AIRTABLE] Message logged: ${direction} | ${leadName}`);
  } catch (e) {
    console.error('[AIRTABLE] logMessage error:', e.message);
  }
}

// ─── STORAGE ──────────────────────────────────────────────────────────────────

// ─── PENDING STORE ────────────────────────────────────────────────────────────
// Backed by Airtable "Pending" table when AIRTABLE_PAT is set (survives restarts);
// falls back to local pending.json on disk otherwise.

const AT_PENDING = process.env.AIRTABLE_PENDING_TABLE_ID || 'tblNV1AHq1VkyBcI5';
const USE_AT_PENDING = !!AIRTABLE_PAT;

// Disk helpers (fallback only)
function loadPendingDisk() {
  if (!fs.existsSync(PENDING_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8')); }
  catch { return {}; }
}
function writePendingDisk(all) {
  fs.writeFileSync(PENDING_FILE, JSON.stringify(all, null, 2));
}

// Map a pending Airtable record to the in-memory shape callers expect
function _atRecordToPending(rec) {
  if (!rec) return null;
  let data = {};
  try { data = JSON.parse(rec.fields?.Data || '{}'); } catch {}
  return {
    ...data,
    _recordId: rec.id,
    status: rec.fields?.Status || data.status || 'pending',
    sendAt: rec.fields?.['Send At'] || data.sendAt || null,
    createdAt: rec.fields?.['Created At'] || data.createdAt || null
  };
}

async function _atFindPendingRecord(id) {
  const filter = encodeURIComponent(`{ID}="${id}"`);
  const r = await airtableRequest('GET', `${AT_PENDING}?filterByFormula=${filter}&maxRecords=1`);
  return r?.records?.[0] || null;
}

async function loadPending() {
  if (!USE_AT_PENDING) return loadPendingDisk();
  const out = {};
  let offset = null;
  try {
    do {
      const url = `${AT_PENDING}?pageSize=100${offset ? `&offset=${encodeURIComponent(offset)}` : ''}`;
      const r = await airtableRequest('GET', url);
      if (!r?.records) break;
      for (const rec of r.records) {
        const id = rec.fields?.ID;
        if (!id) continue;
        out[id] = _atRecordToPending(rec);
      }
      offset = r.offset || null;
    } while (offset);
  } catch (e) {
    console.error('[PENDING] loadPending error:', e.message);
  }
  return out;
}

async function storePending(id, data) {
  if (!USE_AT_PENDING) {
    const all = loadPendingDisk();
    all[id] = { ...data, createdAt: new Date().toISOString(), status: 'pending' };
    writePendingDisk(all);
    return;
  }
  const payload = { ...data, createdAt: new Date().toISOString(), status: 'pending' };
  try {
    await airtableRequest('POST', AT_PENDING, {
      records: [{
        fields: {
          ID: id,
          Status: 'pending',
          'Send At': '',
          Data: JSON.stringify(payload).substring(0, 95000),
          'Created At': new Date().toISOString()
        }
      }]
    });
  } catch (e) {
    console.error('[PENDING] storePending error:', e.message);
  }
}

async function getPending(id) {
  if (!USE_AT_PENDING) {
    return loadPendingDisk()[id];
  }
  try {
    const rec = await _atFindPendingRecord(id);
    return _atRecordToPending(rec);
  } catch (e) {
    console.error('[PENDING] getPending error:', e.message);
    return null;
  }
}

async function deletePending(id) {
  if (!USE_AT_PENDING) {
    const all = loadPendingDisk();
    delete all[id];
    writePendingDisk(all);
    return;
  }
  try {
    const rec = await _atFindPendingRecord(id);
    if (!rec) return;
    await airtableRequest('DELETE', `${AT_PENDING}/${rec.id}`);
  } catch (e) {
    console.error('[PENDING] deletePending error:', e.message);
  }
}

// Mark item as scheduled (persists through server restart).
// pendingData fallback: if record is missing (e.g. cleaned), reconstruct from ?d= param data.
async function markScheduled(id, draft, sendAt, pendingData = null) {
  if (!USE_AT_PENDING) {
    const all = loadPendingDisk();
    if (!all[id]) {
      if (!pendingData) {
        console.error(`[QUEUE] markScheduled: ID ${id} not found and no fallback data`);
        return;
      }
      all[id] = { ...pendingData, createdAt: new Date().toISOString() };
      console.log(`[QUEUE] Restored entry for ${id} from fallback data`);
    }
    all[id].status = 'scheduled';
    all[id].draft = draft;
    all[id].sendAt = sendAt;
    writePendingDisk(all);
    return;
  }
  try {
    const rec = await _atFindPendingRecord(id);
    if (!rec) {
      if (!pendingData) {
        console.error(`[QUEUE] markScheduled: ID ${id} not found in Airtable and no fallback data`);
        return;
      }
      // Reconstruct from fallback data
      const restored = {
        ...pendingData,
        draft,
        sendAt,
        status: 'scheduled',
        createdAt: new Date().toISOString()
      };
      await airtableRequest('POST', AT_PENDING, {
        records: [{
          fields: {
            ID: id,
            Status: 'scheduled',
            'Send At': sendAt,
            Data: JSON.stringify(restored).substring(0, 95000),
            'Created At': new Date().toISOString()
          }
        }]
      });
      console.log(`[QUEUE] Restored entry for ${id} from fallback data (Airtable)`);
      return;
    }
    let existing = {};
    try { existing = JSON.parse(rec.fields?.Data || '{}'); } catch {}
    const merged = { ...existing, draft, sendAt, status: 'scheduled' };
    await airtableRequest('PATCH', `${AT_PENDING}/${rec.id}`, {
      fields: {
        Status: 'scheduled',
        'Send At': sendAt,
        Data: JSON.stringify(merged).substring(0, 95000)
      }
    });
  } catch (e) {
    console.error('[PENDING] markScheduled error:', e.message);
  }
}

// Merge arbitrary fields into a pending record's Data payload (used by /edit/email-handoff POST).
async function updatePendingData(id, patch) {
  if (!USE_AT_PENDING) {
    const all = loadPendingDisk();
    if (!all[id]) return;
    all[id] = { ...all[id], ...patch };
    writePendingDisk(all);
    return;
  }
  try {
    const rec = await _atFindPendingRecord(id);
    if (!rec) return;
    let existing = {};
    try { existing = JSON.parse(rec.fields?.Data || '{}'); } catch {}
    const merged = { ...existing, ...patch };
    await airtableRequest('PATCH', `${AT_PENDING}/${rec.id}`, {
      fields: { Data: JSON.stringify(merged).substring(0, 95000) }
    });
  } catch (e) {
    console.error('[PENDING] updatePendingData error:', e.message);
  }
}

// ─── TIMING & DELAYS ─────────────────────────────────────────────────────────
// LinkedIn send window: 16:00 - 22:00 CET
// Messages received 8-16h wait until 16:00. After 16h: sent in 2-9 min.
// Email: no business hours restriction, always 2-5 min delay.

const SEND_WINDOW_START = 16;
const SEND_WINDOW_END = 22;

function getCETHour() {
  return parseInt(
    new Date().toLocaleString('en-US', {
      timeZone: 'Europe/Ljubljana',
      hour: '2-digit',
      hour12: false
    }),
    10
  );
}

function getSendAt(channel) {
  // Email: no business hours, just 2-5 min delay
  if (channel === 'email') {
    const delayMin = 2 + Math.random() * 3;
    return new Date(Date.now() + delayMin * 60 * 1000);
  }

  // LinkedIn: respect send window
  const hour = getCETHour();

  if (hour >= SEND_WINDOW_START && hour < SEND_WINDOW_END) {
    const delayMin = 2 + Math.random() * 7;
    return new Date(Date.now() + delayMin * 60 * 1000);
  } else {
    // Wait until 16:00 CET + random 1-8 min
    const cetNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Ljubljana' }));
    const target = new Date(cetNow);
    if (hour >= SEND_WINDOW_END) target.setDate(target.getDate() + 1);
    target.setHours(SEND_WINDOW_START, Math.floor(1 + Math.random() * 8), 0, 0);
    const delayMs = Math.max(target - cetNow, 60000);
    return new Date(Date.now() + delayMs);
  }
}

function formatDelay(sendAt) {
  const ms = new Date(sendAt) - Date.now();
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)} min`;
  const h = Math.floor(ms / 3600000);
  const m = Math.round((ms % 3600000) / 60000);
  return `${h}h ${m}min`;
}

function formatSendTime(sendAt) {
  return new Date(sendAt).toLocaleTimeString('sl-SI', {
    timeZone: 'Europe/Ljubljana',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// ─── SCHEDULED SEND QUEUE ─────────────────────────────────────────────────────
// Replaces setTimeout. Items marked 'scheduled' in pending.json are picked up
// every 60s and on startup - survives server restarts/spin-down.

async function executeSend(id, item) {
  const { channel, leadData, draft } = item;
  try {
    if (channel === 'unipile') {
      await sendViaUnipile(leadData.chatId, leadData.accountId, draft);
    } else if (channel === 'linkedin') {
      await sendViaOutflo(leadData.linkedinUrl, draft, leadData.senderUrl || null);
    } else if (channel === 'vesna') {
      await sendViaOutflo(leadData.linkedinUrl, draft, VESNA_LINKEDIN_URL);
    } else {
      await sendViaInstantly(leadData.emailUuid, draft, leadData.subject);
    }
    await deletePending(id);
    console.log(`[QUEUE] Sent & removed: ${leadData.firstName} ${leadData.lastName} (${channel})`);
    // Log sent message to Airtable
    airtableLogMessage(
      `${leadData.firstName} ${leadData.lastName}`,
      leadData.linkedinUrl, 'outbound', null, null, draft, true
    ).catch(() => {});
    airtableUpsertLead(
      leadData.linkedinUrl,
      `${leadData.firstName} ${leadData.lastName}`,
      leadData.company || '', channel, 'Replied', draft
    ).catch(() => {});
  } catch (err) {
    console.error(`[QUEUE] Send failed for ${id}:`, err.message);
    // Leave in pending so we can retry or investigate
  }
}

async function processScheduledSends() {
  const all = await loadPending();
  const now = Date.now();
  const overdue = Object.entries(all).filter(
    ([, item]) => item.status === 'scheduled' && new Date(item.sendAt) <= now
  );

  if (overdue.length > 0) {
    console.log(`[QUEUE] Processing ${overdue.length} scheduled send(s)`);
  }

  for (const [id, item] of overdue) {
    await executeSend(id, item);
  }
}

// ─── TRAINING EXAMPLES ────────────────────────────────────────────────────────

function loadTrainingExamples() {
  try {
    if (fs.existsSync(TRAINING_FILE)) {
      return JSON.parse(fs.readFileSync(TRAINING_FILE, 'utf8'));
    }
  } catch {}
  return [];
}

function saveTrainingExample(original, edited, theirMessage) {
  const examples = loadTrainingExamples();
  examples.push({
    savedAt: new Date().toISOString(),
    theirMessage: theirMessage || '',
    original,
    edited
  });
  const recent = examples.slice(-20);
  fs.writeFileSync(TRAINING_FILE, JSON.stringify(recent, null, 2));
  console.log(`[TRAINING] Saved correction. Total: ${recent.length}`);
}

function buildTrainingContext() {
  const examples = loadTrainingExamples();
  if (examples.length === 0) return '';

  const lines = examples.slice(-5).map((ex, i) =>
    `Primer ${i + 1}:\nNjihovo sporočilo: "${ex.theirMessage || 'N/A'}"\nAI osnutek: "${ex.original}"\nŽan je popravil na: "${ex.edited}"`
  ).join('\n\n');

  return `\n\nUPORABNIKOVE KOREKCIJE (uči se iz teh primerov za boljše prihodnje osnutke):\n${lines}`;
}

// ─── STYLE GUIDE ──────────────────────────────────────────────────────────────

const CALENDLY_LINK = process.env.CALENDLY_LINK || '[CALENDLY LINK]';
const CALENDLY_AI_15MIN = process.env.CALENDLY_AI_15MIN || 'https://calendly.com/aiera-koledar/aiera-ai';
const VESNA_LINKEDIN_URL = process.env.VESNA_LINKEDIN_URL || 'https://www.linkedin.com/in/vesna-pevec-2110b8b4/';
const HANDOFF_FROM_EMAIL = process.env.HANDOFF_FROM_EMAIL || 'Žan Bagarič <zan@aiera.si>';

// ─── AUTO-SEND CONFIG (high-confidence positive replies) ─────────────────────
// Quiet-hold pattern: eligible drafts skip manual POŠLJI and auto-send after
// AUTO_SEND_HOLD_MIN minutes unless Žan clicks STOP. Conservative criteria below.
const AUTO_SEND_ENABLED = (process.env.AUTO_SEND_ENABLED || 'false').toLowerCase() === 'true';
const AUTO_SEND_HOLD_MIN = parseInt(process.env.AUTO_SEND_HOLD_MIN || '15', 10);
const AUTO_SEND_MAX_DRAFT_CHARS = parseInt(process.env.AUTO_SEND_MAX_DRAFT_CHARS || '600', 10);

function isAutoSendEligible({ channel, leadData, intent, hasRealMessage, draft, isHandoff }) {
  if (!AUTO_SEND_ENABLED) return false;
  if (channel !== 'linkedin') return false;          // only Žan's LinkedIn (not Vesna, not email)
  if (intent !== 'positive') return false;           // only clearly positive replies
  if (!hasRealMessage) return false;                 // need real inbound text
  if (isHandoff) return false;                       // handoff has its own approval flow
  if (!leadData?.firstName) return false;            // need at least a name
  if (leadData.accountFirstName && leadData.accountFirstName.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '') !== 'zan') return false;
  if (!draft || draft.length > AUTO_SEND_MAX_DRAFT_CHARS) return false;
  return true;
}

const STYLE_GUIDE = `
You are drafting outreach replies on behalf of Žan Bagarič, founder of B2Booster (b2booster.eu).

B2Booster automates B2B outreach using AI: finding distributors, sales partners, retailers, and international clients.
Pricing: fixed monthly retainer (900-1200 EUR/month), no commissions.
Target: B2B companies that want to expand internationally or automate their sales outreach.

WRITING RULES:
- Short, direct, professional Slovenian
- Never use dashes (pomišljaji)
- Use correct Slovenian spelling with šumniki
- Never use negative or low-energy words: problem, težava, izziv, zamudno, zapleteno
- Frame everything as opportunity, not pain
- No bullet point lists inside messages
- Sign as: Žan Bagarič
- Always include Calendly CTA as the literal placeholder: [CALENDLY LINK]
- Never include a phone number

LINKEDIN TONE:
- Very short: 2 to 4 sentences maximum
- Conversational and natural, like a real person wrote it
- No formal greeting salutations
- Get to the point immediately

EMAIL TONE:
- 4 to 6 sentences maximum
- Professional but warm
- One clear Calendly CTA at the end

GOAL: Move the lead toward booking a Calendly call. Never be pushy. Be helpful and confident.

OUTPUT: Return only the message text. No subject lines, no labels, no formatting notes.
`;

const VESNA_STYLE_GUIDE = `
You are drafting LinkedIn replies on behalf of Vesna Pevec, who handles initial outreach for B2Booster (b2booster.eu).

B2Booster automates B2B outreach using AI: finding distributors, sales partners, retailers, and international clients.
Vesna's role: she does the first contact on LinkedIn. The director (Žan Bagarič) follows up personally with a tailored offer.

WRITING RULES:
- Short, warm, professional Slovenian
- Maximum 3 sentences
- Never use dashes (pomišljaji)
- Use correct Slovenian spelling with šumniki
- Never use negative or low-energy words
- No bullet points
- Sign as: Vesna Pevec
- Never include a Calendly link or phone number
- Never promise specifics about price or timeline

TONE:
- Friendly and professional, like a capable coordinator
- Acknowledge their reply positively but briefly
- Hand off smoothly to the director without making it feel like a brush-off
- The lead should feel they are being taken care of personally

KEY MESSAGE to weave in naturally:
- "Skupaj s kolegom pripravimo ponudbo" or similar variation
- Žan (direktor) bo stopil v stik s konkretno ponudbo
- Make them feel the director is personally investing time in their case

GOAL: Keep the conversation warm, confirm interest, and set up a seamless handoff to Žan.

OUTPUT: Return only the message text. No labels, no formatting notes.
`;

// ─── OFFER PAGE: NETLIFY DEPLOY ───────────────────────────────────────────────

const NETLIFY_SITE_ID = process.env.NETLIFY_SITE_ID || 'ed777b57-cb14-4997-91f9-733fe911fc70';
const OFFER_FILES_MANIFEST = './offer-files.json';
const OFFER_BASE_URL = 'https://ai.aiera.si';

function loadOfferManifest() {
  if (!fs.existsSync(OFFER_FILES_MANIFEST)) return {};
  try { return JSON.parse(fs.readFileSync(OFFER_FILES_MANIFEST, 'utf8')); }
  catch { return {}; }
}
function saveOfferManifest(m) {
  fs.writeFileSync(OFFER_FILES_MANIFEST, JSON.stringify(m, null, 2));
}
function sha1(content) {
  return crypto.createHash('sha1').update(content).digest('hex');
}
function createOfferSlug(company) {
  return (company || 'ponudba')
    .toLowerCase()
    .replace(/[čć]/g, 'c').replace(/[šš]/g, 's').replace(/[žž]/g, 'z').replace(/[đ]/g, 'd')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .substring(0, 40);
}

const OFFER_PAGE_PROMPT = `You generate personalized HTML offer pages for AIERA / B2Booster (aiera.si, b2booster.eu).

LANGUAGE: Slovenian throughout. Use correct šumniki (š, č, ž). No em dashes. Hyphens (-) only.

ABOUT AIERA:
AI automation agency for B2B companies. CEO: Žan Bagarič, +386 40 708 327, zan@aiera.si

CORE SERVICES (choose 2-3 most relevant to the lead's industry):
1. AI Sales Machine - automated LinkedIn + email outreach, reply bots, lead nurturing
2. AI Business App - custom dashboards, CRMs, client portals built fast with Lovable AI
3. AI Workflow Engine - replace manual work: document AI, data extraction, Make.com + Claude API
4. AI Marketing Engine - personalized content at scale: email sequences, landing pages, social copy

DESIGN SYSTEM (white, clean, premium B2B proposal style):
- Fonts: Inter + JetBrains Mono from Google Fonts CDN
- White background (#FFFFFF)
- CSS variables:
  --ink:#18181B; --ink-soft:#3F3F46; --body:#52525B; --mute:#71717A;
  --paper:#FFFFFF; --paper-soft:#FAFAFA; --paper-bg:#F4F4F5;
  --border:#E4E4E7; --border-strong:#D4D4D8;
  --brand:#1E40AF; --brand-soft:#EFF4FF;
  --mint:#15803D; --amber:#92400E; --amber-soft:#FEF3C7;
- .wrap: max-width 880px, margin 0 auto, padding 0 28px
- .wrap-wide: max-width 1100px, margin 0 auto, padding 0 28px
- Mobile responsive

PAGE STRUCTURE (follow this order exactly):

1. STICKY WHITE HEADER (border-bottom:1px solid var(--border), position:sticky, top:0, z-index:50):
   Left: "AIERA" (font-weight:700, font-size:17px, color:var(--ink))
   Center: nav links (Kako deluje / Primerjava / Cena / Vprašanja)
   Right: "Naročite razgovor" button - outlined (border:1px solid var(--border-strong), padding:9px 16px, border-radius:8px) -> https://calendly.com/aiera-koledar/aiera

2. OFFER META STRIP (background:var(--ink), color white, padding:14px 0):
   5 flex items separated by rgba(255,255,255,0.12) borders:
   - "Pripravljeno za" | [FirstName LastName, Company]
   - "Pripravil" | AIERA d.o.o.
   - "Datum izdaje" | [today's date in Slovenian: e.g. "4. maj 2026"]
   - "Velja do" | [today+30 days in Slovenian]
   - "Št. ponudbe" | AIERA-[YEAR]-[3LETTERABBREV]-001 (JetBrains Mono font)
   Labels: font-size:10px, text-transform:uppercase, letter-spacing:0.08em, color:rgba(255,255,255,0.5)
   Values: font-size:14px, color:white, font-weight:500

3. STICKY SLIM META (position:fixed, top:0, background:var(--ink), hidden until 300px scroll):
   Shows recipient name + company | offer number | "Prenesi PDF" print button
   JS: document.addEventListener('scroll', ...) toggles class .slim-meta--visible

4. SUMMARY CARD section (padding:24px 0 0):
   Card has amber top accent (3px solid #92400E), warm cream background (#FDFBF6), border:1px solid var(--border-strong), border-radius:10px, padding:24px 30px
   Header row: "Povzetek ponudbe" amber eyebrow | "Prenesi kot PDF" button (onclick print)
   4-column grid:
   - Predmet: [what we implement - 1 sentence]
   - Vrednost: [e.g. "5 292 € letno"] with sub "(490 €/mes pri letni)"
   - Postavitev: [e.g. "7 dni"] with sub "(brezplačno pri letni)"
   - Garancija: "30 dni povrnitve"

5. HERO (padding:56px 0 80px, border-bottom):
   - Subtle dot grid CSS background overlay (opacity 0.35)
   - .eyebrow: "Ponudba za [Company]"
   - h1 (52px, weight:700, letter-spacing:-0.02em, max-width:720px): SPECIFIC headline about their industry pain, not generic
   - p.lead (18px, color:var(--ink-soft), max-width:720px): 2-3 sentences, concrete automation benefit with estimated time/cost numbers
   - p.lead with amber left border (border-left:3px solid #92400E, padding:12px 16px, background:#FDFBF6): company-specific ROI calculation
   - .hero-actions: "Naročite 20-minutni razgovor" (btn-primary: dark gradient button) + "Cena in pogoji" (btn-secondary: white outlined, href="#cena")
   - .hero-trust (small muted text, border-top): "Slovensko podjetje. Pogodba po slovenskem pravu, obdelava podatkov v EU, GDPR. Postavitev v 7 dneh, brezplačna ob letni naročnini, 30-dnevna garancija povrnitve."

6. HOW IT WORKS (id="kako", padding:90px 0):
   Eyebrow "Postopek dela", h2 (specific to what we build), p.lead
   3 steps in grid-template-columns: 56px 1fr, gap:28px, border-top per step:
   - Step-num: 01/02/03 (large, bold)
   - h3 (step title)
   - p: "Stranka/Prodajnik:" what human does + "Sistem:" what AI does
   After steps: aside box (border-left:3px solid var(--ink), padding:20px 24px, background:var(--paper-soft)): what stays in human hands

7. COMPARISON TABLE (id="primerjava", padding:90px 0):
   Eyebrow, h2, p.lead with a concrete example scenario
   Table: border:1px solid var(--border), border-radius:8px, overflow:hidden
   Header row: background var(--ink), white text
   3 columns: Korak | Brez AIERA | Z AIERA
   5 rows with industry-specific pain points
   "Z AIERA" column: background var(--brand-soft), border-left:2px solid var(--brand)

8. ROI STATS (padding:90px 0):
   Eyebrow "Številke za [Company]", h2, p.lead (explain we only cite provable numbers)
   3 stat cards (display:grid, grid-template-columns: repeat(3,1fr), gap:32px):
   Each card: border:1px solid var(--border), border-radius:10px, padding:28px 26px
   - stat-num (42px, bold)
   - stat-label
   - "Pri vaši ekipi:" applied calculation in branded color
   - Vir: source (small, muted)
   Use real research stats (e.g. Salesforce State of Sales 2024, McKinsey, internal b2booster.eu 2025 data)

9. TRUST/STANDARDS (padding:90px 0):
   Eyebrow "Standardi sodelovanja", h2, p.lead
   Trust box (background:var(--paper-soft), border:1px solid var(--border), border-radius:10px, padding:36px 40px):
   4 guarantees as bold-lead paragraphs:
   - 30-dnevna garancija povrnitve
   - Slovenska pogodba in EU obdelava (GDPR, DPA)
   - Zaklenjene cene za 24 mesecev
   - Lastništvo podatkov

10. PRICING (id="cena", padding:90px 0):
    Eyebrow "Cena", h2, p.lead (mention recommended tier for their size)
    2-3 tier cards (grid, gap:16px). Recommended tier gets class tier--featured with brand border:
    - Začetna: 290 €/mes, do 100 enot/mes
    - Standard: 490 €/mes, do 300 enot/mes
    - Pro: 790 €/mes, neomejeno
    Each tier: tier-name, tier-cap, price, short description, feature list with checkmarks
    Below: 2 extra info boxes (grid 1fr 1fr): Postavitev (490 €, brezplačna pri letni) | Letna naročnina (2 meseca brezplačno)
    Note: 30-day cancel, no penalties, switch anytime

11. FAQ (id="vprasanja", padding:90px 0):
    Eyebrow, h2
    5-7 <details><summary> items (border-top:1px solid var(--border), padding:22px 0)
    summary::after { content: "+" } details[open] summary::after { content: "−" }
    Questions tailored to their likely objections (implementation timeline, existing software integration, team onboarding, data security, pricing, contract flexibility)

12. CONTACT CTA (padding:90px 0):
    Dark card (background:var(--ink), border-radius:10px, padding:56px 56px 40px):
    h2 (white), p (rgba white 0.75, max-width:560px), then EMBEDDED Calendly widget (do NOT use a button/link - use the inline widget):
    <!-- Calendly inline widget begin -->
    <div class="calendly-inline-widget" data-url="https://calendly.com/aiera-koledar/aiera" style="min-width:320px;height:700px;border-radius:8px;overflow:hidden;margin-bottom:28px;"></div>
    <script type="text/javascript" src="https://assets.calendly.com/assets/external/widget.js" async></script>
    <!-- Calendly inline widget end -->
    Below widget: contact details row (zan@aiera.si | +386 40 708 327 | aiera.si)

13. FOOTER (padding:36px 0, border-top):
    Left: AIERA d.o.o. © 2026
    Right: Žan Bagarič · CEO · zan@aiera.si · +386 40 708 327

PRINT CSS: @media print - hide header/nav/buttons, A4 @page, all sections visible, no box shadows.

OUTPUT: Return ONLY the complete HTML starting with <!DOCTYPE html>. No explanation. No markdown. Pure HTML.`;

async function generateOfferHTML(leadData) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const company = leadData.company && leadData.company !== 'LinkedIn'
    ? leadData.company
    : `${leadData.firstName} ${leadData.lastName}`.trim();

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    system: OFFER_PAGE_PROMPT,
    messages: [{
      role: 'user',
      content: `Company: ${company}
Contact: ${leadData.firstName} ${leadData.lastName}
Context / their message: ${leadData.theirMessage || leadData.industryContext || 'interested in AI solutions'}
Email/domain: ${leadData.email || 'unknown'}
Today's date: ${new Date().toLocaleDateString('sl-SI', { day: 'numeric', month: 'long', year: 'numeric' })}

Generate the personalized offer page HTML now.`
    }]
  });
  let html = response.content[0].text.trim();
  // Strip markdown code fences if model wraps output
  html = html.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
  return html.trim();
}

async function deployOfferToNetlify(slug, html) {
  if (!process.env.NETLIFY_TOKEN) {
    console.warn('[OFFER] No NETLIFY_TOKEN set – skipping deploy');
    return null;
  }
  const manifest = loadOfferManifest();
  const filePath = `/${slug}/index.html`;
  const fileHash = sha1(html);
  manifest[filePath] = fileHash;

  // Create deploy
  const deployRes = await fetch(`https://api.netlify.com/api/v1/sites/${NETLIFY_SITE_ID}/deploys`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.NETLIFY_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ files: manifest, async: false })
  });
  if (!deployRes.ok) throw new Error(`Netlify create deploy: ${await deployRes.text()}`);
  const deploy = await deployRes.json();

  // Upload required files
  if (deploy.required && deploy.required.includes(fileHash)) {
    const uploadRes = await fetch(`https://api.netlify.com/api/v1/deploys/${deploy.id}/files${filePath}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${process.env.NETLIFY_TOKEN}`,
        'Content-Type': 'application/octet-stream'
      },
      body: html
    });
    if (!uploadRes.ok) throw new Error(`Netlify upload: ${await uploadRes.text()}`);
  }

  saveOfferManifest(manifest);
  const offerUrl = `${OFFER_BASE_URL}/${slug}`;
  console.log(`[OFFER] Live: ${offerUrl}`);
  return offerUrl;
}

async function createAndDeployOfferClassic(leadData) {
  try {
    const company = leadData.company && leadData.company !== 'LinkedIn'
      ? leadData.company
      : `${leadData.firstName}-${leadData.lastName}`.toLowerCase();
    const slug = createOfferSlug(company);
    console.log(`[OFFER] Generating CLASSIC pricing offer for: ${company} → /${slug}`);
    const html = await generateOfferHTML(leadData);
    return await deployOfferToNetlify(slug, html);
  } catch (err) {
    console.error('[OFFER] Classic error:', err.message);
    return null;
  }
}

// Router: chooses between new spirit-style proposal and classic pricing offer.
// Env: PROPOSAL_STYLE=spirit (default) | classic
// Per-call override: leadData.offerStyle = 'spirit' | 'classic'
async function createAndDeployOffer(leadData) {
  const style = (leadData && leadData.offerStyle) || process.env.PROPOSAL_STYLE || 'spirit';
  if (style === 'classic') return createAndDeployOfferClassic(leadData);
  // Default: new spirit-style proposal
  return createAndDeployProposalSpirit(leadData);
}

// ─── GENERATE REPLY ───────────────────────────────────────────────────────────

async function generateReply(channel, leadData, theirMessage, hasRealMessage = true) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const channelNote = channel === 'linkedin'
    ? 'LinkedIn message. Maximum 3 sentences. Natural, conversational. No formal opener.'
    : 'Email reply. Professional. End with Calendly link.';

  const trainingContext = buildTrainingContext();

  let prompt;
  const enrichmentContext = [
    leadData.title && `Title: ${leadData.title}`,
    leadData.company && `Company: ${leadData.company}`,
    leadData.industry && `Industry: ${leadData.industry}`,
    leadData.employees && `Company size: ${leadData.employees} employees`,
    leadData.seniority && `Seniority: ${leadData.seniority}`
  ].filter(Boolean).join('\n');

  if (hasRealMessage) {
    prompt = `Channel: ${channelNote}
Lead name: ${leadData.firstName} ${leadData.lastName}
${enrichmentContext}
Their message: "${theirMessage}"

Write a reply that naturally continues the conversation, references their specific context if relevant, and moves toward a Calendly booking. Include a concrete value proposition relevant to their role/industry.`;
  } else {
    prompt = `Channel: ${channelNote}
Lead name: ${leadData.firstName} ${leadData.lastName}
Context: ${theirMessage}

Write a short, natural opening message that acknowledges the connection and moves toward a Calendly booking.
Do NOT say anything went wrong or mention a technical issue.
Be direct and confident. Start the conversation naturally.`;
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    system: STYLE_GUIDE + trainingContext,
    messages: [{ role: 'user', content: prompt }]
  });

  let text = response.content[0].text.trim();
  text = text.replace(/\[CALENDLY LINK\]/g, CALENDLY_LINK);
  return text;
}

// ─── INTENT CLASSIFICATION ────────────────────────────────────────────────────

async function classifyIntent(message) {
  if (!message || message.trim().length < 3) return 'neutral';
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 10,
    messages: [{
      role: 'user',
      content: `Classify this reply intent. Return ONLY one word.

negative = clearly not interested: "ni aktualno", "ne zanima", "ne potrebujemo", "not interested", "no thanks", "nismo zainteresirani"
soft_negative = maybe later: "morda v prihodnosti", "za zdaj ne", "kdaj drugič", "maybe later", "in the future", "trenutno ne"
positive = interested, asking questions, wants to talk
neutral = just acknowledging, unclear intent, short reply like "ok", "hvala"

Message: "${message.substring(0, 300)}"

Return: negative, soft_negative, positive, or neutral`
    }]
  });
  const intent = response.content[0].text.trim().toLowerCase().replace(/[^a-z_]/g, '');
  const valid = ['negative', 'soft_negative', 'positive', 'neutral'];
  return valid.includes(intent) ? intent : 'neutral';
}

const CLOSING_REPLY_PROMPT = `You generate short, warm closing replies for LinkedIn conversations where the lead said they're not interested right now but might be in the future.

Rules:
- Maximum 2 sentences
- Warm, human, not pushy
- Leave the door open naturally
- NO Calendly link
- NO bullet points
- Sign as: Žan Bagarič
- Slovenian language, use correct šumniki
- Never use dashes (pomišljaji)`;

async function generateClosingReply(leadData, theirMessage) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 150,
    system: CLOSING_REPLY_PROMPT,
    messages: [{
      role: 'user',
      content: `Lead: ${leadData.firstName} ${leadData.lastName}
Their message: "${theirMessage}"

Generate closing reply.`
    }]
  });
  return response.content[0].text.trim();
}

// ─── SEND VIA OUTFLO (LinkedIn) ───────────────────────────────────────────────

async function sendViaOutflo(receiverLinkedInUrl, text, senderUrl = null) {
  const res = await fetch('https://live.outflo.in/api/public/conversations/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.OUTFLO_API_KEY
    },
    body: JSON.stringify({
      senderProfileUrl: senderUrl || process.env.MY_LINKEDIN_URL,
      receiverLinkedInUrl,
      text
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Outflo error: ${JSON.stringify(data)}`);
  return data;
}

// ─── SEND VIA INSTANTLY (Email) ───────────────────────────────────────────────

async function sendViaInstantly(replyToUuid, emailBody, subject) {
  const res = await fetch('https://api.instantly.ai/api/v1/unibox/emails/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.INSTANTLY_API_KEY}`
    },
    body: JSON.stringify({
      reply_to_uuid: replyToUuid,
      eaccount: process.env.SENDING_EMAIL,
      subject: subject ? `Re: ${subject}` : 'Re: B2Booster',
      body: { text: emailBody }
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Instantly error: ${JSON.stringify(data)}`);
  return data;
}

// ─── SEND APPROVAL EMAIL VIA RESEND ───────────────────────────────────────────

async function sendApprovalEmail(id, leadData, draft, channel, offerUrl = null, autoSendAt = null) {
  const base = process.env.SERVER_URL || `http://localhost:${PORT}`;
  const channelLabel = channel === 'linkedin' ? 'LinkedIn' : 'Email';
  const channelBadgeColor = channel === 'linkedin' ? '#0a66c2' : '#059669';
  const isAutoSend = !!autoSendAt;

  let actionLabel = 'sporočil';
  if (leadData.notificationType === 'accepted') actionLabel = 'sprejel povabilo';
  else if (leadData.notificationType === 'replied') actionLabel = 'odgovoril';
  else if (leadData.notificationType === 'messaged') actionLabel = 'sporočil';

  // Intent badge
  const intentColors = {
    positive: { bg: '#dcfce7', text: '#15803d', label: 'POZITIVNO' },
    negative: { bg: '#fee2e2', text: '#b91c1c', label: 'NEGATIVNO' },
    soft_negative: { bg: '#fef3c7', text: '#a16207', label: 'MEHKO NEGATIVNO' },
    question: { bg: '#dbeafe', text: '#1d4ed8', label: 'VPRAŠANJE' },
    neutral: { bg: '#f3f4f6', text: '#4b5563', label: 'NEVTRALNO' }
  };
  const intentStyle = intentColors[leadData.intent] || null;
  const intentBadge = intentStyle
    ? `<span style="background:${intentStyle.bg};color:${intentStyle.text};padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;letter-spacing:0.3px">${intentStyle.label}</span>`
    : '';

  // Source / account badge - who from our side received this
  const accountBadge = leadData.accountName
    ? `<span style="background:#eef2ff;color:#4338ca;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;letter-spacing:0.3px">→ ${leadData.accountName}</span>`
    : '';

  const channelBadge = `<span style="background:${channelBadgeColor};color:#fff;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;letter-spacing:0.3px">${channelLabel.toUpperCase()}</span>`;

  // Inbound message - always show, prominent. If empty say so.
  const messageSection = leadData.theirMessage
    ? `<div style="margin-bottom:24px">
         <p style="color:#111;margin:0 0 8px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px">Njihovo sporočilo</p>
         <div style="border-left:3px solid #111;padding:14px 18px;color:#222;background:#f9fafb;font-size:15px;line-height:1.65;border-radius:4px;white-space:pre-wrap">${leadData.theirMessage.replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')}</div>
       </div>`
    : `<div style="margin-bottom:24px">
         <p style="color:#111;margin:0 0 8px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px">Njihovo sporočilo</p>
         <div style="border-left:3px solid #d1d5db;padding:14px 18px;color:#6b7280;background:#f9fafb;font-size:13px;font-style:italic;border-radius:4px">Besedilo ni bilo v notifikaciji (LinkedIn digest). Odpri profil za polni kontekst.</div>
       </div>`;

  // Context info panel - all the metadata we have
  const infoRows = [];
  const profileLink = leadData.linkedinUrl
    ? `<a href="${leadData.linkedinUrl}" style="color:#0a66c2;text-decoration:none">${leadData.linkedinUrl.replace('https://www.','')}</a>`
    : '';

  if (leadData.email) infoRows.push(['Email', `<a href="mailto:${leadData.email}" style="color:#2563eb;text-decoration:none">${leadData.email}</a>`]);
  if (profileLink) infoRows.push(['LinkedIn', profileLink]);
  if (leadData.title) infoRows.push(['Vloga', leadData.title]);
  if (leadData.company && leadData.company !== 'LinkedIn') infoRows.push(['Podjetje', leadData.company]);
  if (leadData.industry) infoRows.push(['Industrija', leadData.industry]);
  if (leadData.employees) infoRows.push(['Velikost', `${leadData.employees} zaposlenih`]);
  if (leadData.seniority) infoRows.push(['Seniorost', leadData.seniority]);
  const location = [leadData.city, leadData.country].filter(Boolean).join(', ');
  if (location) infoRows.push(['Lokacija', location]);
  if (leadData.campaignName) infoRows.push(['Kampanja', leadData.campaignName]);
  if (leadData.notificationType) infoRows.push(['Tip dogodka', leadData.notificationType]);
  if (leadData.eventType) infoRows.push(['Outflo event', leadData.eventType]);
  if (leadData.source) infoRows.push(['Vir', leadData.source]);
  if (leadData.messageSentAt) infoRows.push(['Poslano ob', leadData.messageSentAt]);
  if (leadData.subject) infoRows.push(['Subject', leadData.subject]);
  if (leadData.conversationId) infoRows.push(['Conversation ID', `<code style="font-size:11px;color:#6b7280">${leadData.conversationId}</code>`]);

  const infoPanel = infoRows.length
    ? `<div style="background:#fafafa;border:1px solid #e5e7eb;border-radius:8px;padding:14px 18px;margin-bottom:24px">
         <p style="color:#111;margin:0 0 10px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px">Kontekst</p>
         <table style="width:100%;border-collapse:collapse;font-size:13px">
           ${infoRows.map(([k, v]) => `<tr><td style="padding:3px 12px 3px 0;color:#6b7280;vertical-align:top;width:130px;white-space:nowrap">${k}</td><td style="padding:3px 0;color:#111;word-break:break-word">${v}</td></tr>`).join('')}
         </table>
       </div>`
    : '';

  const hour = getCETHour();
  const inWindow = (channel === 'email') || (hour >= SEND_WINDOW_START && hour < SEND_WINDOW_END);
  const timingNote = isAutoSend
    ? `<p style="color:#dc2626;font-size:13px;margin:16px 0 0;font-weight:600">AUTO-SEND aktiven. Pošlje ob ${formatSendTime(autoSendAt)} ČE ne klikneš STOP.</p>`
    : (channel === 'email')
      ? `<p style="color:#059669;font-size:12px;margin:16px 0 0">Email bo poslan v 2-5 minutah po potrditvi.</p>`
      : inWindow
        ? `<p style="color:#059669;font-size:12px;margin:16px 0 0">Sporočilo bo poslano v 2-9 minutah po potrditvi.</p>`
        : `<p style="color:#d97706;font-size:12px;margin:16px 0 0">Zunaj okna (${SEND_WINDOW_START}:00-${SEND_WINDOW_END}:00). Pošlje ob ${SEND_WINDOW_START}:00 po potrditvi.</p>`;

  // Auto-send banner at the top (clearly different from manual approval)
  const autoSendBanner = isAutoSend
    ? `<div style="background:#fef2f2;border:2px solid #dc2626;border-radius:8px;padding:14px 18px;margin-bottom:20px">
         <p style="margin:0;color:#991b1b;font-weight:700;font-size:14px;text-transform:uppercase;letter-spacing:0.4px">AUTO-SEND v ${AUTO_SEND_HOLD_MIN} min</p>
         <p style="margin:6px 0 0;color:#7f1d1d;font-size:13px">Visoko zaupanje (positive intent + Žan kanal). Pošlje samodejno ob <strong>${formatSendTime(autoSendAt)}</strong>. Klikni STOP če hočeš zavrniti, UREDI če hočeš popraviti.</p>
       </div>`
    : '';

  // Action buttons - differ based on auto-send mode
  const actionButtons = isAutoSend
    ? `<div style="display:flex;gap:10px;flex-wrap:wrap">
         <a href="${base}/stop/${id}"
            style="background:#dc2626;color:#fff;padding:12px 26px;text-decoration:none;border-radius:6px;font-weight:700;font-size:15px;display:inline-block">STOP</a>
         <a href="${base}/edit/${id}?d=${Buffer.from(JSON.stringify({ channel, leadData, draft })).toString('base64url')}"
            style="background:#2563eb;color:#fff;padding:12px 26px;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;display:inline-block">UREDI</a>
       </div>`
    : `<div style="display:flex;gap:10px;flex-wrap:wrap">
         <a href="${base}/approve/${id}?d=${Buffer.from(JSON.stringify({ channel, leadData, draft })).toString('base64url')}"
            style="background:#16a34a;color:#fff;padding:12px 26px;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;display:inline-block">POŠLJI</a>
         <a href="${base}/edit/${id}?d=${Buffer.from(JSON.stringify({ channel, leadData, draft })).toString('base64url')}"
            style="background:#2563eb;color:#fff;padding:12px 26px;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;display:inline-block">UREDI</a>
         <a href="${base}/dismiss/${id}"
            style="background:#f3f4f6;color:#6b7280;padding:12px 26px;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;display:inline-block;border:1px solid #e5e7eb">ZAVRNI</a>
       </div>`;

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;margin:0 auto;padding:24px;background:#fff;color:#111">
      ${autoSendBanner}
      <div style="border-bottom:1px solid #e5e7eb;padding-bottom:16px;margin-bottom:20px">
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
          ${channelBadge}${intentBadge}${accountBadge}
        </div>
        <h2 style="margin:0;font-size:20px;color:#111;font-weight:700">${leadData.firstName} ${leadData.lastName} ${actionLabel}</h2>
      </div>
      ${messageSection}
      ${infoPanel}
      <div style="margin-bottom:24px">
        <p style="color:#111;margin:0 0 8px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px">Predlog odgovora</p>
        <div style="border-left:3px solid #2563eb;padding:14px 18px;background:#eff6ff;font-size:15px;line-height:1.7;color:#1e3a5f;white-space:pre-wrap;border-radius:4px">${draft.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
      </div>
      ${offerUrl ? `
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 18px;margin-bottom:24px">
        <p style="margin:0 0 6px;font-weight:700;color:#15803d;font-size:12px;text-transform:uppercase;letter-spacing:0.4px">Offer page generirana</p>
        <a href="${offerUrl}" style="color:#16a34a;font-size:14px;word-break:break-all;font-weight:600">${offerUrl}</a>
      </div>
      ` : ''}
      ${actionButtons}
      ${timingNote}
      <p style="color:#ccc;font-size:11px;margin-top:24px">B2Booster Reply Bot · ID ${id.substring(0,8)}</p>
    </div>
  `;

  // Subject: pack intent + account so it's scannable in inbox
  const subjectIntent = leadData.intent ? ` ${leadData.intent.toUpperCase()}` : '';
  const subjectAccount = leadData.accountFirstName ? ` →${leadData.accountFirstName}` : '';
  const channelTag = channel === 'linkedin' ? 'LI' : 'EMAIL';
  const autoTag = isAutoSend ? ' AUTO' : '';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.BOT_FROM_EMAIL || 'B2Booster Bot <bot@b2booster.eu>',
      to: process.env.MY_EMAIL,
      subject: `[${channelTag}${subjectIntent}${subjectAccount}${autoTag}] ${leadData.firstName} ${leadData.lastName} ${actionLabel}`,
      html
    })
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[RESEND] Error:', err);
    throw new Error(`Resend failed: ${err}`);
  }

  console.log(`[RESEND] Approval sent: ${leadData.firstName} ${leadData.lastName}`);
}

// ─── REPLY ENQUEUE (auto-send dispatcher) ─────────────────────────────────────
// Single entry point for all generated replies. If auto-send is enabled AND the
// reply passes the eligibility check, it goes into the scheduled queue with a
// quiet-hold window and a STOP-able approval mail. Otherwise it goes through
// the standard manual approval path.

async function enqueueReply({ channel, leadData, draft, intent, hasRealMessage = true, isHandoff = false, offerUrl = null, source = null, extraData = {} }) {
  const id = uuidv4();
  const eligible = isAutoSendEligible({ channel, leadData, intent, hasRealMessage, draft, isHandoff });
  if (eligible) {
    const minSendMs = Date.now() + AUTO_SEND_HOLD_MIN * 60 * 1000;
    const naturalSendMs = getSendAt(channel).getTime();
    const sendAtISO = new Date(Math.max(minSendMs, naturalSendMs)).toISOString();
    await storePending(id, { channel, leadData, draft, source: source || 'auto-send', ...extraData });
    await markScheduled(id, draft, sendAtISO);
    await sendApprovalEmail(id, leadData, draft, channel, offerUrl, sendAtISO);
    console.log(`[AUTO-SEND] Hold ${AUTO_SEND_HOLD_MIN}min for ${leadData.firstName} ${leadData.lastName} → ${formatSendTime(sendAtISO)}`);
  } else {
    await storePending(id, { channel, leadData, draft, source: source || 'manual-approval', ...extraData });
    await sendApprovalEmail(id, leadData, draft, channel, offerUrl);
  }
  return id;
}

// ─── EMAIL HANDOFF (LinkedIn → Email) ────────────────────────────────────────
// Flow: prospect prosi za email predstavitev → bot detektira → najde email
// (parse → Airtable → ask on LinkedIn) → pripravi handoff email body + LinkedIn
// auto-reply → pošlje approval mail Žanu z gumbom POŠLJI EMAIL.

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const ROLE_EMAIL_PREFIXES = ['noreply', 'no-reply', 'donotreply', 'do-not-reply', 'mailer-daemon', 'postmaster', 'notifications', 'notification'];

function extractEmailFromMessage(text) {
  if (!text) return null;
  const matches = text.match(EMAIL_REGEX);
  if (!matches || matches.length === 0) return null;
  // Filter junk addresses (signatures, role accounts)
  const clean = matches
    .map(e => e.toLowerCase().replace(/[.,;:)]+$/, ''))
    .filter(e => !ROLE_EMAIL_PREFIXES.some(p => e.startsWith(p + '@')))
    .filter(e => !e.includes('linkedin.com'));
  return clean[0] || null;
}

async function detectEmailHandoff(message) {
  if (!message || message.trim().length < 3) {
    return { isHandoff: false, providedEmail: null };
  }
  // Fast regex path: if message clearly contains an email, treat as handoff
  const directEmail = extractEmailFromMessage(message);
  if (directEmail) {
    return { isHandoff: true, providedEmail: directEmail };
  }
  // LLM path: detect intent to receive details via email
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{
        role: 'user',
        content: `Does this LinkedIn message ask the sender to send an offer, presentation, more info, or details to email? Or does it ask for an email contact?

Return ONLY "yes" or "no".

yes examples: "Pošljite mi ponudbo na email", "Lahko mi pošljete predstavitev na e-pošto?", "Send me details to my email", "Mi lahko pošljete več informacij?"
no examples: "Zanima me", "Pokličite me", "Hvala", "Kdaj se lahko slišimo?"

Message: "${message.substring(0, 400)}"`
      }]
    });
    const ans = response.content[0].text.trim().toLowerCase();
    return { isHandoff: ans.startsWith('yes'), providedEmail: null };
  } catch (e) {
    console.error('[HANDOFF] detect error:', e.message);
    return { isHandoff: false, providedEmail: null };
  }
}

async function airtableLookupEmailForLead(linkedinUrl) {
  if (!AIRTABLE_PAT || !linkedinUrl) return null;
  try {
    const filter = encodeURIComponent(`{LinkedIn URL}="${linkedinUrl}"`);
    const r = await airtableRequest('GET', `${AT_LEADS}?filterByFormula=${filter}&maxRecords=1`);
    if (!r?.records?.length) return null;
    const fields = r.records[0].fields || {};
    const email = fields.Email || fields.email || fields['E-mail'] || null;
    if (!email) return null;
    return { email: String(email).trim(), recordId: r.records[0].id };
  } catch (e) {
    console.error('[AIRTABLE] lookupEmail error:', e.message);
    return null;
  }
}

async function airtableMarkOfferSent(linkedinUrl, leadName, email, offerType) {
  if (!AIRTABLE_PAT || !linkedinUrl) return;
  try {
    const filter = encodeURIComponent(`{LinkedIn URL}="${linkedinUrl}"`);
    const r = await airtableRequest('GET', `${AT_LEADS}?filterByFormula=${filter}&maxRecords=1`);
    const fields = {
      'Status': 'Offer Sent (Email)',
      'Email Sent At': new Date().toISOString(),
      'Last Activity': new Date().toISOString().split('T')[0]
    };
    if (email) fields['Email'] = email;
    if (offerType) fields['Offer Type'] = offerType;
    if (r?.records?.length) {
      await airtableRequest('PATCH', `${AT_LEADS}/${r.records[0].id}`, { fields });
    } else {
      await airtableRequest('POST', AT_LEADS, { records: [{ fields: {
        'Lead Name': leadName || '',
        'LinkedIn URL': linkedinUrl,
        'Channel': 'linkedin',
        ...fields
      }}]});
    }
    console.log(`[AIRTABLE] Marked Offer Sent (Email): ${leadName}`);
  } catch (e) {
    console.error('[AIRTABLE] markOfferSent error:', e.message);
  }
}

const HANDOFF_EMAIL_PROMPT = `You draft outreach emails on behalf of Žan Bagarič, CEO of AIERA (aiera.si) / B2Booster (b2booster.eu).

CONTEXT: The lead asked on LinkedIn for details/offer/presentation via email. You write the follow-up email.

ABOUT AIERA / B2Booster:
AI automation agency for B2B companies. We build AI Sales Machines (automated LinkedIn + email outreach, reply bots), AI Workflow Engines (document AI, data extraction), AI Business Apps (custom dashboards/CRMs), and AI Marketing Engines.

WRITING RULES (strict):
- Slovenian, šumniki correct (š, č, ž)
- NEVER use dashes (pomišljaji). Use commas or periods.
- Never use negative words: problem, težava, izziv, zamudno, zapleteno
- Frame as opportunity, not pain
- Polite, professional, modern SaaS tone
- No bullet points
- 4 to 6 short sentences total
- Sign as: Žan Bagarič
- End with one clear CTA: 15-min razgovor preko Calendly link [CALENDLY_15MIN]
- Never include a phone number in the body
- First sentence references the LinkedIn conversation naturally
- Tikamo NIKOLI. Vedno vikamo (Vi, Vas, Vam)

OUTPUT FORMAT (strict):
Line 1: SUBJECT: <subject line>
Empty line
Line 3+: email body (plain text, paragraphs separated by blank lines)

DO NOT include any other labels, markdown, or commentary.`;

async function generateHandoffEmail(leadData, theirMessage) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const enrichmentContext = [
    leadData.title && `Title: ${leadData.title}`,
    leadData.company && leadData.company !== 'LinkedIn' && `Company: ${leadData.company}`,
    leadData.industry && `Industry: ${leadData.industry}`,
    leadData.employees && `Company size: ${leadData.employees}`,
    leadData.seniority && `Seniority: ${leadData.seniority}`
  ].filter(Boolean).join('\n');

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    system: HANDOFF_EMAIL_PROMPT,
    messages: [{
      role: 'user',
      content: `Lead: ${leadData.firstName} ${leadData.lastName}
${enrichmentContext}
Their LinkedIn message: "${theirMessage || '(prosil za email predstavitev)'}"

Write the handoff email.`
    }]
  });

  let raw = response.content[0].text.trim();
  raw = raw.replace(/\[CALENDLY_15MIN\]/g, CALENDLY_AI_15MIN);
  raw = raw.replace(/\[CALENDLY LINK\]/g, CALENDLY_AI_15MIN);

  // Parse SUBJECT: line
  let subject = `AI predstavitev za ${leadData.firstName}`;
  let body = raw;
  const subjMatch = raw.match(/^\s*SUBJECT:\s*(.+)$/im);
  if (subjMatch) {
    subject = subjMatch[1].trim().replace(/^["']|["']$/g, '');
    body = raw.replace(subjMatch[0], '').trim();
  }
  return { subject, body };
}

const HANDOFF_LI_REPLY_PROMPT = `You write very short Slovenian LinkedIn replies (2 sentences max).

Context: prospect asked for details/offer via email. We just sent the email. Confirm warmly.

Rules:
- 1 to 2 sentences total
- Slovenian, vikamo (Vi, Vas)
- No dashes, no negative words
- Mention that the email is on its way
- Sign as: Žan Bagarič
- No Calendly link in this LinkedIn reply (Calendly is in the email)

Return only the message text.`;

async function generateHandoffLinkedInReply(leadData, providedEmail) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 120,
    system: HANDOFF_LI_REPLY_PROMPT,
    messages: [{
      role: 'user',
      content: `Lead: ${leadData.firstName}. Email used: ${providedEmail}. Write the LinkedIn confirmation reply.`
    }]
  });
  return response.content[0].text.trim();
}

const ASK_EMAIL_LI_PROMPT = `You write very short Slovenian LinkedIn replies (1 sentence) that ask the prospect for their work email so we can send a tailored offer.

Rules:
- 1 sentence
- Slovenian, vikamo
- No dashes, no negative words
- Sign as: Žan Bagarič
- No Calendly link

Return only the message text.`;

async function generateAskForEmailReply(leadData) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 100,
    system: ASK_EMAIL_LI_PROMPT,
    messages: [{
      role: 'user',
      content: `Lead: ${leadData.firstName}. Write the LinkedIn message asking for their email.`
    }]
  });
  return response.content[0].text.trim();
}

async function sendOfferEmailViaResend({ to, subject, bodyText }) {
  const htmlBody = bodyText
    .split('\n')
    .map(line => line.trim() === '' ? '<br>' : `<p style="margin:0 0 10px 0;font-family:Arial,sans-serif;font-size:14px;color:#111827;line-height:1.6">${line}</p>`)
    .join('');
  const html = `<div style="max-width:600px;padding:24px">${htmlBody}${AIERA_SIGNATURE_HTML}</div>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: HANDOFF_FROM_EMAIL,
      to,
      subject,
      html
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Resend handoff error: ${JSON.stringify(data)}`);
  console.log(`[HANDOFF] Email sent to ${to}`);
  return data;
}

async function sendHandoffApprovalEmail(id, leadData, payload) {
  const base = process.env.SERVER_URL || `http://localhost:${PORT}`;
  const { mode, recipientEmail, subject, body, liReply } = payload;

  // Mode badge - replaces the old emoji header
  const modeBadge = mode === 'send_email'
    ? `<span style="background:#15803d;color:#fff;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;letter-spacing:0.3px">HANDOFF: POŠLJI EMAIL</span>`
    : `<span style="background:#d97706;color:#fff;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;letter-spacing:0.3px">HANDOFF: VPRAŠAJ ZA EMAIL</span>`;

  // Intent badge
  const intentColors = {
    positive: { bg: '#dcfce7', text: '#15803d', label: 'POZITIVNO' },
    negative: { bg: '#fee2e2', text: '#b91c1c', label: 'NEGATIVNO' },
    soft_negative: { bg: '#fef3c7', text: '#a16207', label: 'MEHKO NEGATIVNO' },
    question: { bg: '#dbeafe', text: '#1d4ed8', label: 'VPRAŠANJE' },
    neutral: { bg: '#f3f4f6', text: '#4b5563', label: 'NEVTRALNO' }
  };
  const intentStyle = intentColors[leadData.intent] || null;
  const intentBadge = intentStyle
    ? `<span style="background:${intentStyle.bg};color:${intentStyle.text};padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;letter-spacing:0.3px">${intentStyle.label}</span>`
    : '';
  const accountBadge = leadData.accountName
    ? `<span style="background:#eef2ff;color:#4338ca;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;letter-spacing:0.3px">→ ${leadData.accountName}</span>`
    : '';

  const messageSection = leadData.theirMessage
    ? `<div style="margin-bottom:24px">
         <p style="color:#111;margin:0 0 8px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px">Njihovo sporočilo</p>
         <div style="border-left:3px solid #111;padding:14px 18px;color:#222;background:#f9fafb;font-size:15px;line-height:1.65;border-radius:4px;white-space:pre-wrap">${leadData.theirMessage.replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')}</div>
       </div>`
    : '';

  // Context info panel - same as sendApprovalEmail
  const infoRows = [];
  if (leadData.email || recipientEmail) infoRows.push(['Email', `<a href="mailto:${leadData.email || recipientEmail}" style="color:#2563eb;text-decoration:none">${leadData.email || recipientEmail}</a>`]);
  if (leadData.linkedinUrl) infoRows.push(['LinkedIn', `<a href="${leadData.linkedinUrl}" style="color:#0a66c2;text-decoration:none">${leadData.linkedinUrl.replace('https://www.','')}</a>`]);
  if (leadData.title) infoRows.push(['Vloga', leadData.title]);
  if (leadData.company && leadData.company !== 'LinkedIn') infoRows.push(['Podjetje', leadData.company]);
  if (leadData.industry) infoRows.push(['Industrija', leadData.industry]);
  if (leadData.employees) infoRows.push(['Velikost', `${leadData.employees} zaposlenih`]);
  if (leadData.seniority) infoRows.push(['Seniorost', leadData.seniority]);
  const location = [leadData.city, leadData.country].filter(Boolean).join(', ');
  if (location) infoRows.push(['Lokacija', location]);
  if (leadData.campaignName) infoRows.push(['Kampanja', leadData.campaignName]);
  if (leadData.notificationType) infoRows.push(['Tip dogodka', leadData.notificationType]);
  if (leadData.eventType) infoRows.push(['Outflo event', leadData.eventType]);
  if (leadData.source) infoRows.push(['Vir', leadData.source]);
  if (leadData.messageSentAt) infoRows.push(['Poslano ob', leadData.messageSentAt]);
  if (leadData.conversationId) infoRows.push(['Conversation ID', `<code style="font-size:11px;color:#6b7280">${leadData.conversationId}</code>`]);

  const infoPanel = infoRows.length
    ? `<div style="background:#fafafa;border:1px solid #e5e7eb;border-radius:8px;padding:14px 18px;margin-bottom:24px">
         <p style="color:#111;margin:0 0 10px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px">Kontekst</p>
         <table style="width:100%;border-collapse:collapse;font-size:13px">
           ${infoRows.map(([k, v]) => `<tr><td style="padding:3px 12px 3px 0;color:#6b7280;vertical-align:top;width:130px;white-space:nowrap">${k}</td><td style="padding:3px 0;color:#111;word-break:break-word">${v}</td></tr>`).join('')}
         </table>
       </div>`
    : '';

  const emailDraftSection = mode === 'send_email'
    ? `
      <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:14px 18px;margin-bottom:16px">
        <p style="margin:0 0 4px;color:#065f46;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px">Pošljemo na</p>
        <p style="margin:0;color:#065f46;font-size:15px;font-weight:600">${recipientEmail}</p>
      </div>
      <div style="margin-bottom:20px">
        <p style="color:#111;margin:0 0 8px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px">Subject</p>
        <div style="padding:10px 14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:4px;font-size:14px;color:#111">${subject}</div>
      </div>
      <div style="margin-bottom:20px">
        <p style="color:#111;margin:0 0 8px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px">Email body</p>
        <div style="border-left:3px solid #15803d;padding:14px 18px;background:#f0fdf4;font-size:14px;line-height:1.7;color:#064e3b;white-space:pre-wrap;border-radius:4px">${body.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
      </div>
      <div style="margin-bottom:24px">
        <p style="color:#111;margin:0 0 8px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px">LinkedIn auto-reply (pošlje se po emailu)</p>
        <div style="border-left:3px solid #2563eb;padding:12px 16px;background:#eff6ff;font-size:14px;line-height:1.6;color:#1e3a5f;white-space:pre-wrap;border-radius:4px">${liReply.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
      </div>`
    : `
      <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin-bottom:16px">
        <p style="margin:0;color:#92400e;font-size:13px">Email v sporočilu ni najden, niti v Airtable ni shranjen. Bot bo vprašal za email na LinkedInu.</p>
      </div>
      <div style="margin-bottom:24px">
        <p style="color:#111;margin:0 0 8px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px">Predlog LinkedIn vprašanja</p>
        <div style="border-left:3px solid #d97706;padding:12px 16px;background:#fffbeb;font-size:14px;line-height:1.6;color:#7c2d12;white-space:pre-wrap;border-radius:4px">${liReply.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
      </div>`;

  const primaryButton = mode === 'send_email'
    ? `<a href="${base}/approve/email-handoff/${id}" style="background:#15803d;color:#fff;padding:12px 26px;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;display:inline-block">POŠLJI EMAIL</a>`
    : `<a href="${base}/approve/email-handoff/${id}" style="background:#d97706;color:#fff;padding:12px 26px;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;display:inline-block">POŠLJI VPRAŠANJE NA LINKEDIN</a>`;

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;margin:0 auto;padding:24px;background:#fff;color:#111">
      <div style="border-bottom:1px solid #e5e7eb;padding-bottom:16px;margin-bottom:20px">
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">${modeBadge}${intentBadge}${accountBadge}</div>
        <h2 style="margin:0;font-size:20px;color:#111;font-weight:700">${leadData.firstName} ${leadData.lastName}${leadData.company && leadData.company !== 'LinkedIn' ? ' · ' + leadData.company : ''}</h2>
      </div>
      ${messageSection}
      ${infoPanel}
      ${emailDraftSection}
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${primaryButton}
        <a href="${base}/edit/email-handoff/${id}" style="background:#2563eb;color:#fff;padding:12px 26px;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;display:inline-block">UREDI</a>
        <a href="${base}/dismiss/${id}" style="background:#f3f4f6;color:#6b7280;padding:12px 26px;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;display:inline-block;border:1px solid #e5e7eb">ZAVRNI</a>
      </div>
      <p style="color:#ccc;font-size:11px;margin-top:24px">B2Booster Reply Bot · Email Handoff · ID ${id.substring(0,8)}</p>
    </div>
  `;

  const subjectAccount = leadData.accountFirstName ? ` →${leadData.accountFirstName}` : '';
  const subj = mode === 'send_email'
    ? `[HANDOFF${subjectAccount}] ${leadData.firstName} ${leadData.lastName} prosi za ponudbo`
    : `[HANDOFF?${subjectAccount}] ${leadData.firstName} ${leadData.lastName} omenja email`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.BOT_FROM_EMAIL || 'B2Booster Bot <bot@b2booster.eu>',
      to: process.env.MY_EMAIL,
      subject: subj,
      html
    })
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('[RESEND] Handoff approval error:', err);
    throw new Error(`Resend handoff approval failed: ${err}`);
  }
  console.log(`[HANDOFF] Approval sent: ${leadData.firstName} ${leadData.lastName} (${mode})`);
}

// Main handoff orchestrator - returns true if handoff was triggered (caller should return).
// channel: 'linkedin' | 'vesna' | 'outflo'
// Returns false if no handoff intent detected (caller continues normal flow).
async function maybeHandleEmailHandoff(channel, leadData, theirMessage) {
  if (!theirMessage || theirMessage.length < 5) return false;

  const detection = await detectEmailHandoff(theirMessage);
  if (!detection.isHandoff) return false;

  console.log(`[HANDOFF] Detected on ${channel} | ${leadData.firstName} ${leadData.lastName} | providedEmail=${detection.providedEmail || 'none'}`);

  // Tier 1: email in their message
  let email = detection.providedEmail;
  let source = 'message';

  // Tier 2: lookup in Airtable
  if (!email && leadData.linkedinUrl) {
    const lookup = await airtableLookupEmailForLead(leadData.linkedinUrl);
    if (lookup?.email) {
      email = lookup.email;
      source = 'airtable';
    }
  }

  const id = uuidv4();

  if (email) {
    // We have an email - build full handoff package
    const { subject, body } = await generateHandoffEmail(leadData, theirMessage);
    const liReply = await generateHandoffLinkedInReply(leadData, email);

    await storePending(id, {
      kind: 'email_handoff',
      mode: 'send_email',
      channel,
      leadData,
      recipientEmail: email,
      emailSubject: subject,
      emailBody: body,
      liReply,
      source
    });

    await sendHandoffApprovalEmail(id, leadData, {
      mode: 'send_email',
      recipientEmail: email,
      subject,
      body,
      liReply
    });

    // Log inbound + draft
    airtableLogMessage(
      `${leadData.firstName} ${leadData.lastName}`,
      leadData.linkedinUrl,
      'inbound', 'positive', theirMessage, null, false
    ).catch(() => {});
  } else {
    // No email anywhere - draft LinkedIn message that asks for email
    const liReply = await generateAskForEmailReply(leadData);

    await storePending(id, {
      kind: 'email_handoff',
      mode: 'ask_email',
      channel,
      leadData,
      liReply
    });

    await sendHandoffApprovalEmail(id, leadData, {
      mode: 'ask_email',
      liReply
    });
  }

  return true;
}

// ─── APPROVE EMAIL HANDOFF ───────────────────────────────────────────────────

app.get('/approve/email-handoff/:id', async (req, res) => {
  const id = req.params.id;
  const pending = await getPending(id);
  if (!pending || pending.kind !== 'email_handoff') {
    return res.status(404).send(page('Ni najdeno', '<p>Handoff ne obstaja ali je že bilo obdelano.</p>'));
  }

  const { mode, channel, leadData, recipientEmail, emailSubject, emailBody, liReply } = pending;

  try {
    if (mode === 'send_email') {
      // 1. Send the offer email via Resend
      await sendOfferEmailViaResend({
        to: recipientEmail,
        subject: emailSubject,
        bodyText: emailBody
      });

      // 2. Send LinkedIn confirmation reply (via Outflo, respecting channel)
      try {
        if (channel === 'vesna') {
          await sendViaOutflo(leadData.linkedinUrl, liReply, VESNA_LINKEDIN_URL);
        } else {
          await sendViaOutflo(leadData.linkedinUrl, liReply, leadData.senderUrl || null);
        }
      } catch (e) {
        console.error('[HANDOFF] LinkedIn confirm send failed (email still sent):', e.message);
      }

      // 3. Airtable: mark Offer Sent (Email) + log messages
      await airtableMarkOfferSent(
        leadData.linkedinUrl,
        `${leadData.firstName} ${leadData.lastName}`,
        recipientEmail,
        'teaser_v1'
      );
      airtableLogMessage(
        `${leadData.firstName} ${leadData.lastName}`,
        leadData.linkedinUrl, 'outbound', 'email_handoff',
        `[EMAIL → ${recipientEmail}] ${emailSubject}`,
        emailBody, true
      ).catch(() => {});
      airtableLogMessage(
        `${leadData.firstName} ${leadData.lastName}`,
        leadData.linkedinUrl, 'outbound', 'email_handoff',
        '[LINKEDIN confirm]', liReply, true
      ).catch(() => {});

      await deletePending(id);

      return res.send(page('Email poslan', `
        <div style="text-align:center;padding:40px 0">
          <div style="font-size:48px;margin-bottom:16px">✉️</div>
          <h2 style="color:#15803d;margin:0 0 8px">Email handoff poslan</h2>
          <p style="color:#666;margin:0 0 4px">${leadData.firstName} ${leadData.lastName}</p>
          <p style="color:#16a34a;font-weight:600;font-size:16px;margin:8px 0">${recipientEmail}</p>
          <p style="color:#999;font-size:13px">LinkedIn potrditev poslana. Airtable status: Offer Sent (Email).</p>
        </div>
      `));
    } else {
      // Ask-on-LinkedIn flow: send the LinkedIn message asking for email
      const senderUrl = channel === 'vesna' ? VESNA_LINKEDIN_URL : (leadData.senderUrl || null);
      await sendViaOutflo(leadData.linkedinUrl, liReply, senderUrl);

      // Mark "Asked for Email" in Airtable so cold cron can pick it up
      (async () => {
        try {
          const filter = encodeURIComponent(`{LinkedIn URL}="${leadData.linkedinUrl}"`);
          const r = await airtableRequest('GET', `${AT_LEADS}?filterByFormula=${filter}&maxRecords=1`);
          if (r?.records?.length > 0) {
            await airtableRequest('PATCH', `${AT_LEADS}/${r.records[0].id}`, {
              fields: { 'Asked for Email': 'Yes' }
            });
          }
        } catch {}
      })();

      airtableLogMessage(
        `${leadData.firstName} ${leadData.lastName}`,
        leadData.linkedinUrl, 'outbound', 'ask_email', null, liReply, true
      ).catch(() => {});

      await deletePending(id);

      return res.send(page('Vprašanje poslano', `
        <div style="text-align:center;padding:40px 0">
          <div style="font-size:48px;margin-bottom:16px">❓</div>
          <h2 style="color:#d97706;margin:0 0 8px">LinkedIn vprašanje za email poslano</h2>
          <p style="color:#666">${leadData.firstName} ${leadData.lastName}</p>
        </div>
      `));
    }
  } catch (err) {
    console.error('[HANDOFF] Approve error:', err.message);
    return res.status(500).send(page('Napaka', `<p>Napaka pri pošiljanju: ${err.message}</p>`));
  }
});

app.get('/edit/email-handoff/:id', async (req, res) => {
  const id = req.params.id;
  const pending = await getPending(id);
  if (!pending || pending.kind !== 'email_handoff') {
    return res.status(404).send(page('Ni najdeno', '<p>Not found.</p>'));
  }

  if (pending.mode === 'send_email') {
    res.send(page('Uredi handoff', `
      <h2 style="font-size:18px;margin:0 0 12px">Uredi email handoff</h2>
      <p style="color:#555;margin:0 0 12px">
        <strong>${pending.leadData.firstName} ${pending.leadData.lastName}</strong>
      </p>
      <form method="POST" action="/edit/email-handoff/${id}">
        <label style="display:block;font-size:13px;color:#555;margin:0 0 4px">Email naslov</label>
        <input name="recipientEmail" value="${pending.recipientEmail}" style="width:100%;padding:10px;font-size:14px;border:1px solid #ddd;border-radius:6px;box-sizing:border-box;margin-bottom:12px">

        <label style="display:block;font-size:13px;color:#555;margin:0 0 4px">Subject</label>
        <input name="emailSubject" value="${pending.emailSubject.replace(/"/g, '&quot;')}" style="width:100%;padding:10px;font-size:14px;border:1px solid #ddd;border-radius:6px;box-sizing:border-box;margin-bottom:12px">

        <label style="display:block;font-size:13px;color:#555;margin:0 0 4px">Email body</label>
        <textarea name="emailBody" style="width:100%;height:240px;padding:12px;font-size:14px;border:1px solid #ddd;border-radius:6px;line-height:1.6;box-sizing:border-box;margin-bottom:12px">${pending.emailBody}</textarea>

        <label style="display:block;font-size:13px;color:#555;margin:0 0 4px">LinkedIn potrditev</label>
        <textarea name="liReply" style="width:100%;height:100px;padding:12px;font-size:14px;border:1px solid #ddd;border-radius:6px;line-height:1.6;box-sizing:border-box;margin-bottom:12px">${pending.liReply}</textarea>

        <div style="display:flex;gap:12px">
          <button type="submit" style="background:#15803d;color:#fff;padding:12px 28px;border:none;border-radius:6px;font-size:15px;font-weight:600;cursor:pointer">SHRANI IN POŠLJI</button>
          <a href="/dismiss/${id}" style="background:#f3f4f6;color:#6b7280;padding:12px 28px;text-decoration:none;border-radius:6px;font-size:15px;font-weight:600;border:1px solid #e5e7eb">ZAVRNI</a>
        </div>
      </form>
    `));
  } else {
    res.send(page('Uredi vprašanje', `
      <h2 style="font-size:18px;margin:0 0 12px">Uredi LinkedIn vprašanje za email</h2>
      <p style="color:#555;margin:0 0 12px"><strong>${pending.leadData.firstName} ${pending.leadData.lastName}</strong></p>
      <form method="POST" action="/edit/email-handoff/${id}">
        <textarea name="liReply" style="width:100%;height:140px;padding:12px;font-size:14px;border:1px solid #ddd;border-radius:6px;line-height:1.6;box-sizing:border-box;margin-bottom:12px">${pending.liReply}</textarea>
        <div style="display:flex;gap:12px">
          <button type="submit" style="background:#d97706;color:#fff;padding:12px 28px;border:none;border-radius:6px;font-size:15px;font-weight:600;cursor:pointer">SHRANI IN POŠLJI</button>
          <a href="/dismiss/${id}" style="background:#f3f4f6;color:#6b7280;padding:12px 28px;text-decoration:none;border-radius:6px;font-size:15px;font-weight:600;border:1px solid #e5e7eb">ZAVRNI</a>
        </div>
      </form>
    `));
  }
});

app.post('/edit/email-handoff/:id', async (req, res) => {
  const id = req.params.id;
  const pending = await getPending(id);
  if (!pending || pending.kind !== 'email_handoff') {
    return res.status(404).send(page('Ni najdeno', '<p>Not found.</p>'));
  }
  // Build patch with edited fields only
  const patch = {};
  if (pending.mode === 'send_email') {
    patch.recipientEmail = (req.body.recipientEmail || pending.recipientEmail).trim();
    patch.emailSubject = (req.body.emailSubject || pending.emailSubject).trim();
    patch.emailBody = req.body.emailBody || pending.emailBody;
    patch.liReply = req.body.liReply || pending.liReply;
  } else {
    patch.liReply = req.body.liReply || pending.liReply;
  }
  await updatePendingData(id, patch);
  // Redirect to approve which performs the send
  res.redirect(`/approve/email-handoff/${id}`);
});

// ─── FOLLOW-UP CRON (3-touch sequence after Offer Sent (Email)) ──────────────
// Step 1: gentle nudge (Day +3 after Email Sent At)
// Step 2: value-add / curiosity hook (Day +7 after Step 1)
// Step 3: breakup mail (Day +14 after Step 2) - best conversion, closes the loop

const FOLLOWUP_STEP_1_DAYS = parseInt(process.env.FOLLOWUP_STEP_1_DAYS || process.env.FOLLOWUP_DAYS || '3', 10);
const FOLLOWUP_STEP_2_DAYS = parseInt(process.env.FOLLOWUP_STEP_2_DAYS || '7', 10);
const FOLLOWUP_STEP_3_DAYS = parseInt(process.env.FOLLOWUP_STEP_3_DAYS || '14', 10);
const FOLLOWUP_SENT_FIELD = 'Followup Sent At'; // timestamp of last followup
const FOLLOWUP_STEP_FIELD = 'Followup Step'; // 0/blank = none sent yet; 1, 2, 3 = step last sent

const FOLLOWUP_PROMPTS = {
  1: `You write very short Slovenian follow-up emails (3 sentences max) sent by Žan Bagarič.

Context: ${FOLLOWUP_STEP_1_DAYS} days ago we sent an offer/presentation email after a LinkedIn conversation. No response yet. We send a gentle nudge.

Rules:
- Slovenian, šumniki correct
- No dashes
- No negative words (problem, težava, izziv)
- Vikamo
- 3 sentences max
- End with: link to 15-min Calendly: [CALENDLY_15MIN]
- Sign: Žan Bagarič
- Format:
SUBJECT: <subject>

<body>

Return only that format. No commentary.`,

  2: `You write short Slovenian follow-up emails (4 sentences max) sent by Žan Bagarič.

Context: This is the SECOND follow-up. First nudge ${FOLLOWUP_STEP_2_DAYS} days ago got no reply. Now we bring a small value-add: one concrete insight or angle relevant to their role/industry that makes opening the original offer worth it. NOT pushy. Curiosity-driven.

Rules:
- Slovenian, šumniki correct
- No dashes
- No negative words (problem, težava, izziv)
- Vikamo
- 4 sentences max
- Open with a concrete observation about their industry or role (NOT "še vedno aktualno"; that was step 1)
- Reference the earlier email briefly: "v predlogu ki sem ga poslal pred časom"
- One soft CTA: link to 15-min Calendly: [CALENDLY_15MIN]
- Sign: Žan Bagarič
- Format:
SUBJECT: <subject>

<body>

Return only that format. No commentary.`,

  3: `You write a Slovenian breakup follow-up email (3 sentences max) sent by Žan Bagarič.

Context: This is the THIRD and FINAL follow-up. Two earlier touches got no reply. This is the classic "closing the loop" mail: polite, low-pressure, gives them an easy out, but leaves the door open. Counterintuitively, this style has the highest conversion of the sequence because it removes pressure.

Rules:
- Slovenian, šumniki correct
- No dashes
- No negative words (problem, težava, izziv)
- Vikamo
- 3 sentences max
- Tone: warm, professional, no guilt-tripping
- Frame: "če zdaj ni pravi čas, samo dajte vedeti in zaključim, ne bom več motil. Če pa kdaj postane aktualno, sem na voljo."
- Do NOT include a Calendly link in step 3 (we are closing the loop, not pushing CTA)
- Sign: Žan Bagarič
- Format:
SUBJECT: <subject>

<body>

Return only that format. No commentary.`
};

async function generateFollowupEmail(leadData, step = 1) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const stepNum = (step === 2 || step === 3) ? step : 1;
  const systemPrompt = FOLLOWUP_PROMPTS[stepNum];

  let userPrompt;
  if (stepNum === 1) {
    userPrompt = `Lead: ${leadData.firstName} ${leadData.lastName}${leadData.company && leadData.company !== 'LinkedIn' ? ', ' + leadData.company : ''}

Write the gentle ${FOLLOWUP_STEP_1_DAYS}-day follow-up email (step 1 of 3).`;
  } else if (stepNum === 2) {
    userPrompt = `Lead: ${leadData.firstName} ${leadData.lastName}${leadData.company && leadData.company !== 'LinkedIn' ? ', ' + leadData.company : ''}
${leadData.title ? `Role: ${leadData.title}` : ''}
${leadData.industry ? `Industry: ${leadData.industry}` : ''}

Write the value-add follow-up email (step 2 of 3). Lead with a concrete industry/role observation, NOT a "still relevant?" question.`;
  } else {
    userPrompt = `Lead: ${leadData.firstName} ${leadData.lastName}${leadData.company && leadData.company !== 'LinkedIn' ? ', ' + leadData.company : ''}

Write the breakup / loop-close follow-up email (step 3 of 3). Polite, easy out, low pressure.`;
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  });

  let raw = response.content[0].text.trim();
  raw = raw.replace(/\[CALENDLY_15MIN\]/g, CALENDLY_AI_15MIN);

  let defaultSubject = `Še aktualno, ${leadData.firstName}?`;
  if (stepNum === 2) defaultSubject = `Kratka misel za vas, ${leadData.firstName}`;
  if (stepNum === 3) defaultSubject = `${leadData.firstName}, naj zaključim?`;

  let subject = defaultSubject;
  let body = raw;
  const subjMatch = raw.match(/^\s*SUBJECT:\s*(.+)$/im);
  if (subjMatch) {
    subject = subjMatch[1].trim().replace(/^["']|["']$/g, '');
    body = raw.replace(subjMatch[0], '').trim();
  }
  return { subject, body, step: stepNum };
}

async function airtableFindLeadsForFollowup() {
  if (!AIRTABLE_PAT) return [];
  // 3-touch sequence: query each step separately, attach nextStep to each candidate.
  const cutoff1 = new Date(Date.now() - FOLLOWUP_STEP_1_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const cutoff2 = new Date(Date.now() - FOLLOWUP_STEP_2_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const cutoff3 = new Date(Date.now() - FOLLOWUP_STEP_3_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Step 1: never followed up yet + 3d since Email Sent At
  const f1 = encodeURIComponent(
    `AND({Status}="Offer Sent (Email)", IS_BEFORE({Email Sent At}, "${cutoff1}"), OR({${FOLLOWUP_STEP_FIELD}}=BLANK(), {${FOLLOWUP_STEP_FIELD}}=0), {Booked At}=BLANK())`
  );
  // Step 2: step 1 done + 7d since last followup
  const f2 = encodeURIComponent(
    `AND({Status}="Offer Sent (Email)", {${FOLLOWUP_STEP_FIELD}}=1, IS_BEFORE({${FOLLOWUP_SENT_FIELD}}, "${cutoff2}"), {Booked At}=BLANK())`
  );
  // Step 3: step 2 done + 14d since last followup
  const f3 = encodeURIComponent(
    `AND({Status}="Offer Sent (Email)", {${FOLLOWUP_STEP_FIELD}}=2, IS_BEFORE({${FOLLOWUP_SENT_FIELD}}, "${cutoff3}"), {Booked At}=BLANK())`
  );

  const out = [];
  const mapRec = (rec, nextStep) => ({
    recordId: rec.id,
    leadName: rec.fields['Lead Name'] || '',
    linkedinUrl: rec.fields['LinkedIn URL'] || '',
    email: rec.fields['Email'] || '',
    company: rec.fields['Campaign'] || '',
    title: rec.fields['Title'] || '',
    industry: rec.fields['Industry'] || '',
    emailSentAt: rec.fields['Email Sent At'] || '',
    nextStep
  });

  try {
    const r1 = await airtableRequest('GET', `${AT_LEADS}?filterByFormula=${f1}&maxRecords=20`);
    if (r1?.records) out.push(...r1.records.map(r => mapRec(r, 1)));
  } catch (e) { console.error('[FOLLOWUP] step1 find error:', e.message); }

  try {
    const r2 = await airtableRequest('GET', `${AT_LEADS}?filterByFormula=${f2}&maxRecords=20`);
    if (r2?.records) out.push(...r2.records.map(r => mapRec(r, 2)));
  } catch (e) { console.error('[FOLLOWUP] step2 find error:', e.message); }

  try {
    const r3 = await airtableRequest('GET', `${AT_LEADS}?filterByFormula=${f3}&maxRecords=20`);
    if (r3?.records) out.push(...r3.records.map(r => mapRec(r, 3)));
  } catch (e) { console.error('[FOLLOWUP] step3 find error:', e.message); }

  return out.filter(x => x.email && x.linkedinUrl);
}

async function airtableMarkFollowupQueued(recordId, newStep) {
  if (!AIRTABLE_PAT || !recordId) return;
  try {
    const fields = { [FOLLOWUP_SENT_FIELD]: new Date().toISOString() };
    if (newStep) fields[FOLLOWUP_STEP_FIELD] = newStep;
    await airtableRequest('PATCH', `${AT_LEADS}/${recordId}`, { fields });
  } catch (e) {
    console.error('[FOLLOWUP] markQueued error:', e.message);
  }
}

async function processFollowups() {
  try {
    const candidates = await airtableFindLeadsForFollowup();
    if (candidates.length === 0) return;
    console.log(`[FOLLOWUP] ${candidates.length} candidate(s) across 3-touch sequence`);

    for (const c of candidates) {
      try {
        const nameParts = c.leadName.trim().split(' ');
        const leadData = {
          firstName: nameParts[0] || 'Lead',
          lastName: nameParts.slice(1).join(' '),
          company: c.company || '',
          linkedinUrl: c.linkedinUrl,
          title: c.title || '',
          industry: c.industry || ''
        };

        const { subject, body, step } = await generateFollowupEmail(leadData, c.nextStep);
        const stepTag = `FOLLOW-UP ${step}/3`;
        const liReply = step === 3
          ? null // step 3 is a quiet loop-close; no LinkedIn nudge
          : `Sem vam ravnokar poslal kratek nadaljevalen mail, ${leadData.firstName}. Lep pozdrav, Žan Bagarič`;

        const id = uuidv4();
        await storePending(id, {
          kind: 'email_handoff',
          mode: 'send_email',
          channel: 'linkedin',
          leadData,
          recipientEmail: c.email,
          emailSubject: subject,
          emailBody: body,
          liReply,
          source: `followup-cron-step-${step}`,
          followupStep: step,
          followupRecordId: c.recordId
        });

        await sendHandoffApprovalEmail(id, leadData, {
          mode: 'send_email',
          recipientEmail: c.email,
          subject: `[${stepTag}] ${subject}`,
          body,
          liReply
        });

        await airtableMarkFollowupQueued(c.recordId, step);
        console.log(`[FOLLOWUP] Approval queued (step ${step}/3): ${c.leadName}`);
      } catch (e) {
        console.error('[FOLLOWUP] per-lead error:', e.message);
      }
    }
  } catch (err) {
    console.error('[FOLLOWUP] processFollowups error:', err.message);
  }
}

// Manual trigger
app.get('/trigger-followups', async (req, res) => {
  res.json({ status: 'running' });
  await processFollowups();
});

// ─── COLD LEAD CRON (3-day LinkedIn silence → first email outreach) ──────────

const COLD_LEAD_DAYS = parseInt(process.env.COLD_LEAD_DAYS || '3', 10);

const COLD_REACH_PROMPT = `You write very short Slovenian follow-up emails (3-4 sentences max) sent by Žan Bagarič, CEO of AIERA (aiera.si).

Context: We asked this person for their email on LinkedIn but they didn't reply. We found their email and are reaching out directly as a soft second touch. Keep it light and curious, not pushy.

Rules:
- Slovenian, šumniki correct (š, č, ž)
- NEVER use dashes. Use commas or periods.
- Never use negative words: problem, težava, izziv
- Vikamo (Vi, Vas, Vam) - never tikamo
- Mention LinkedIn briefly in first sentence
- One soft CTA: 15-min klic or simple question
- No bullet points, no hard sell, no emojis
- Sign as: Žan Bagarič, AIERA
- Max 4 sentences total`;

async function generateColdReachEmail(leadData) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt = `Lead: ${leadData.firstName} ${leadData.lastName}
Company context: ${leadData.company || 'unknown'}
Their last LinkedIn message: "${leadData.lastMessage || '(no message recorded)'}"

Write the cold follow-up email. Return JSON: { "subject": "...", "body": "..." }`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    system: COLD_REACH_PROMPT,
    messages: [{ role: 'user', content: prompt }]
  });

  try {
    const text = response.content[0].text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch {}
  return {
    subject: `${leadData.firstName}, kratko vprašanje`,
    body: `${leadData.firstName}, sem Žan iz AIERA. Kratko sva se pogovarjala na LinkedInu, a sem izgubil nit.\n\nAli bi imeli 15 minut za kratek klic ta teden?\n\nLep pozdrav,\nŽan Bagarič, AIERA`
  };
}

async function airtableFindColdLeads() {
  if (!AIRTABLE_PAT) return [];
  try {
    const cutoff = new Date(Date.now() - COLD_LEAD_DAYS * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const formula = encodeURIComponent(
      `AND({Asked for Email}="Yes", {Email}!="", IS_BEFORE({Last Activity}, "${cutoff}"), {Cold Email Sent At}=BLANK(), {Booked At}=BLANK())`
    );
    const r = await airtableRequest('GET', `${AT_LEADS}?filterByFormula=${formula}&maxRecords=10`);
    if (!r?.records) return [];
    return r.records.map(rec => ({
      recordId: rec.id,
      leadName: rec.fields['Lead Name'] || '',
      linkedinUrl: rec.fields['LinkedIn URL'] || '',
      email: rec.fields['Email'] || '',
      company: rec.fields['Campaign'] || '',
      lastMessage: rec.fields['Last Message'] || ''
    })).filter(x => x.email);
  } catch (e) {
    console.error('[COLD] find error:', e.message);
    return [];
  }
}

async function airtableMarkColdEmailQueued(recordId) {
  if (!AIRTABLE_PAT || !recordId) return;
  try {
    await airtableRequest('PATCH', `${AT_LEADS}/${recordId}`, {
      fields: { 'Cold Email Sent At': new Date().toISOString() }
    });
  } catch (e) {
    console.error('[COLD] markQueued error:', e.message);
  }
}

async function processColdLinkedInLeads() {
  try {
    const candidates = await airtableFindColdLeads();
    if (candidates.length === 0) return;
    console.log(`[COLD] ${candidates.length} cold lead(s) for email approval`);

    for (const c of candidates) {
      try {
        const nameParts = c.leadName.trim().split(' ');
        const leadData = {
          firstName: nameParts[0] || 'Lead',
          lastName: nameParts.slice(1).join(' '),
          company: c.company || '',
          linkedinUrl: c.linkedinUrl,
          lastMessage: c.lastMessage
        };

        const { subject, body } = await generateColdReachEmail(leadData);

        const id = uuidv4();
        await storePending(id, {
          kind: 'email_handoff',
          mode: 'send_email',
          channel: 'linkedin',
          leadData,
          recipientEmail: c.email,
          emailSubject: subject,
          emailBody: body,
          liReply: null,
          source: 'cold-cron'
        });

        await sendHandoffApprovalEmail(id, leadData, {
          mode: 'send_email',
          recipientEmail: c.email,
          subject: `[COLD OUTREACH] ${subject}`,
          body,
          liReply: null
        });

        await airtableMarkColdEmailQueued(c.recordId);
        console.log(`[COLD] Approval queued: ${c.leadName} → ${c.email}`);
      } catch (e) {
        console.error('[COLD] per-lead error:', e.message);
      }
    }
  } catch (err) {
    console.error('[COLD] processColdLinkedInLeads error:', err.message);
  }
}

app.get('/trigger-cold-outreach', async (req, res) => {
  res.json({ status: 'running' });
  await processColdLinkedInLeads();
});

// ─── LI FOLLOWUP CRON (3-day general silence → LinkedIn nudge) ───────────────

const LI_FOLLOWUP_PROMPT = `You write very short Slovenian LinkedIn follow-up messages (2-3 sentences max) sent by Žan Bagarič from AIERA.

Context: This person replied to a LinkedIn outreach some days ago but then went silent. You're sending a gentle nudge.

Rules:
- First name only
- Light, no pressure, no hard sell
- One simple question or CTA
- Sign off as Žan
- Max 3 sentences`;

async function generateLiFollowupMessage(leadData) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 150,
    system: LI_FOLLOWUP_PROMPT,
    messages: [{ role: 'user', content: `Lead: ${leadData.firstName} ${leadData.lastName}\nCompany: ${leadData.company || 'unknown'}\nLast message from them: "${leadData.lastMessage || '(no message)'}"\n\nWrite the LinkedIn nudge.` }]
  });
  return response.content[0].text.trim();
}

async function airtableFindSilentLeads() {
  if (!AIRTABLE_PAT) return [];
  try {
    const cutoff = new Date(Date.now() - COLD_LEAD_DAYS * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const formula = encodeURIComponent(
      `AND({Status}="Replied", IS_BEFORE({Last Activity}, "${cutoff}"), {LI Followup Sent At}=BLANK(), {Asked for Email}=BLANK(), {Booked At}=BLANK())`
    );
    const r = await airtableRequest('GET', `${AT_LEADS}?filterByFormula=${formula}&maxRecords=10`);
    if (!r?.records) return [];
    return r.records.map(rec => ({
      recordId: rec.id,
      leadName: rec.fields['Lead Name'] || '',
      linkedinUrl: rec.fields['LinkedIn URL'] || '',
      company: rec.fields['Campaign'] || '',
      lastMessage: rec.fields['Last Message'] || '',
      channel: rec.fields['Channel'] || 'linkedin'
    })).filter(x => x.linkedinUrl);
  } catch (e) {
    console.error('[LI-FOLLOWUP] find error:', e.message);
    return [];
  }
}

async function processLiFollowups() {
  try {
    const candidates = await airtableFindSilentLeads();
    if (candidates.length === 0) return;
    console.log(`[LI-FOLLOWUP] ${candidates.length} silent lead(s) for LinkedIn nudge approval`);

    for (const c of candidates) {
      try {
        const nameParts = c.leadName.trim().split(' ');
        const leadData = {
          firstName: nameParts[0] || 'Lead',
          lastName: nameParts.slice(1).join(' '),
          company: c.company || '',
          linkedinUrl: c.linkedinUrl,
          lastMessage: c.lastMessage
        };

        const nudge = await generateLiFollowupMessage(leadData);
        const id = uuidv4();

        await storePending(id, {
          kind: 'reply',
          channel: c.channel === 'vesna' ? 'vesna' : 'linkedin',
          leadData,
          draft: nudge,
          source: 'li-followup-cron'
        });

        await sendApprovalEmail(id, leadData, nudge, 'linkedin');

        // Mark to prevent re-sending
        await airtableRequest('PATCH', `${AT_LEADS}/${c.recordId}`, {
          fields: { 'LI Followup Sent At': new Date().toISOString() }
        });

        console.log(`[LI-FOLLOWUP] Queued: ${c.leadName}`);
      } catch (e) {
        console.error('[LI-FOLLOWUP] per-lead error:', e.message);
      }
    }
  } catch (err) {
    console.error('[LI-FOLLOWUP] error:', err.message);
  }
}

app.get('/trigger-li-followups', async (req, res) => {
  res.json({ status: 'running' });
  await processLiFollowups();
});

// ─── WEBHOOK: INSTANTLY ───────────────────────────────────────────────────────

app.post('/webhook/instantly', async (req, res) => {
  res.sendStatus(200);
  try {
    const { first_name, last_name, company_name, email_reply_text, email_uuid, email_subject, lead_email } = req.body;
    const leadData = {
      firstName: first_name || 'Unknown',
      lastName: last_name || '',
      company: company_name || 'Unknown',
      theirMessage: email_reply_text || '',
      emailUuid: email_uuid,
      subject: email_subject,
      email: lead_email || req.body.email || '',
      accountName: 'Žan Bagarič',
      accountFirstName: 'Žan',
      source: 'instantly-webhook'
    };
    if (!leadData.theirMessage) return;
    leadData.intent = await classifyIntent(leadData.theirMessage);
    const draft = await generateReply('email', leadData, leadData.theirMessage);
    const id = uuidv4();
    await storePending(id, { channel: 'email', leadData, draft });
    await sendApprovalEmail(id, leadData, draft, 'email');
    console.log(`[EMAIL] Queued: ${leadData.firstName} ${leadData.lastName}`);
  } catch (err) {
    console.error('[EMAIL] Error:', err.message);
  }
});

// ─── WEBHOOK: LINKEDIN (Make.com/Gmail fallback) ──────────────────────────────

function parseLinkedInEmail(subject, from, body) {
  let firstName = 'Unknown';
  let lastName = '';

  let notificationType = 'messaged';
  if (/accepted your/i.test(subject)) notificationType = 'accepted';
  else if (/connection request/i.test(subject)) notificationType = 'connection';
  else if (/replied/i.test(subject)) notificationType = 'replied';
  else if (/sent you a message|messaged you|just messaged/i.test(subject)) notificationType = 'messaged';

  const subjectPatterns = [
    /^(.+?)\s+sent you a message/i,
    /^(.+?)\s+replied to your message/i,
    /^(.+?)\s+accepted your/i,
    /^You have a new message from\s+(.+?)$/i,
    /^(.+?)\s+has sent you a message/i,
    /^(.+?)\s+just messaged you/i,
    /^(.+?)\s+messaged you/i,
  ];

  for (const pattern of subjectPatterns) {
    const m = subject && subject.match(pattern);
    if (m) {
      const parts = m[1].trim().split(' ');
      firstName = parts[0] || 'Unknown';
      lastName = parts.slice(1).join(' ');
      break;
    }
  }

  let message = '';
  const bodyPatterns = [
    /(?:sent you a message|replied|says?):\s*\n+(.+?)(?:\n\n|\n---|\nView|Reply|$)/is,
    /(?:Message|Sporočilo):\s*\n*(.+?)(?:\n\n|\n---|\nView|Reply|$)/is,
    /^.+?\n(.{10,200})(?:\n\nView|\nView|\n\n)/ms,
  ];

  for (const pattern of bodyPatterns) {
    const m = body && body.match(pattern);
    if (m && m[1].trim().length > 5) {
      const candidate = m[1].trim();
      if (!candidate.startsWith('http') && !candidate.includes('linkedin.com') && !candidate.includes('unsubscribe')) {
        message = candidate;
        break;
      }
    }
  }

  if (!message && body) {
    const lines = body.split('\n')
      .map(l => l.trim())
      .filter(l =>
        l.length > 15 && l.length < 500 &&
        !l.startsWith('http') && !l.includes('linkedin.com') &&
        !l.includes('unsubscribe') && !l.includes('©') &&
        !l.includes('@') && !/^\d/.test(l)
      );
    message = lines[0] || '';
  }

  const urlMatch = body && body.match(/https?:\/\/(?:www\.|[a-z]{2}\.)?linkedin\.com\/in\/[a-zA-Z0-9\-_%]+/);
  const linkedinUrl = urlMatch ? urlMatch[0].split('?')[0] : null;

  return { firstName, lastName, message, linkedinUrl, notificationType };
}

app.post('/webhook/linkedin', async (req, res) => {
  res.sendStatus(200);
  try {
    const { subject, from, body } = req.body;
    console.log('[LINKEDIN] Subject:', subject);

    const parsed = parseLinkedInEmail(subject || '', from || '', body || '');
    const hasRealMessage = parsed.message.length > 10;

    let notificationContext = '';
    if (parsed.notificationType === 'accepted') {
      notificationContext = `${parsed.firstName} accepted your LinkedIn connection request. Start a warm conversation.`;
    } else if (parsed.notificationType === 'messaged') {
      notificationContext = `${parsed.firstName} sent you a message on LinkedIn but the text wasn't in the notification email. Start a natural opener.`;
    } else {
      notificationContext = `LinkedIn notification from ${parsed.firstName}: "${subject}"`;
    }

    const leadData = {
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      company: 'LinkedIn',
      theirMessage: hasRealMessage ? parsed.message : '',
      linkedinUrl: parsed.linkedinUrl,
      notificationType: parsed.notificationType,
      rawSubject: subject,
      accountName: 'Žan Bagarič',
      accountFirstName: 'Žan',
      source: 'linkedin-email-notif'
    };

    if (!leadData.linkedinUrl) {
      console.warn('[LINKEDIN] No LinkedIn URL - skipping');
      return;
    }

    // Classify intent - only if there's a real message
    if (hasRealMessage) {
      const intent = await classifyIntent(parsed.message);
      leadData.intent = intent;
      console.log(`[LINKEDIN] Intent: ${intent} | ${leadData.firstName} ${leadData.lastName}`);

      if (intent === 'negative') {
        // Polite closeout - same pattern as /webhook/outflo (don't silently drop)
        const draft = `Razumem, hvala za odgovor ${leadData.firstName}. Če se kdaj situacija spremeni, sem tu. Lep pozdrav, Žan`;
        const id = uuidv4();
        await storePending(id, { channel: 'linkedin', leadData, draft, source: 'linkedin-negative' });
        await sendApprovalEmail(id, leadData, draft, 'linkedin');
        console.log(`[LINKEDIN] Negative closeout queued for ${leadData.firstName} ${leadData.lastName}`);
        return;
      }

      if (intent === 'soft_negative') {
        const closing = await generateClosingReply(leadData, parsed.message);
        const sendAt = getSendAt('linkedin');
        const id = uuidv4();
        await storePending(id, { channel: 'linkedin', leadData, draft: closing });
        await markScheduled(id, closing, sendAt);
        console.log(`[LINKEDIN] Soft negative - closing reply scheduled for ${leadData.firstName} at ${formatSendTime(sendAt)}`);
        return;
      }

      // Email handoff: prospect asks for offer/info via email
      const handoffTriggered = await maybeHandleEmailHandoff('linkedin', leadData, parsed.message);
      if (handoffTriggered) return;
    }

    const messageForAI = hasRealMessage ? parsed.message : notificationContext;
    const [draft, offerUrl] = await Promise.all([
      generateReply('linkedin', leadData, messageForAI, hasRealMessage),
      createAndDeployOffer(leadData)
    ]);
    await enqueueReply({
      channel: 'linkedin',
      leadData,
      draft,
      intent: leadData.intent,
      hasRealMessage,
      offerUrl,
      source: 'linkedin-webhook'
    });
    console.log(`[LINKEDIN] Queued: ${leadData.firstName} ${leadData.lastName}`);
  } catch (err) {
    console.error('[LINKEDIN] Error:', err.message);
  }
});

// ─── WEBHOOK: VESNA (LinkedIn cold outreach replies) ─────────────────────────
// Vesna sends cold outreach, leads reply, bot responds in her name with handoff to Žan.
// Make.com scenario: Vesna's Gmail LinkedIn notifications → POST /webhook/vesna

app.post('/webhook/vesna', async (req, res) => {
  res.sendStatus(200);
  try {
    const { subject, from, body } = req.body;
    console.log('[VESNA] Subject:', subject);

    const parsed = parseLinkedInEmail(subject || '', from || '', body || '');
    const hasRealMessage = parsed.message.length > 10;

    if (!parsed.linkedinUrl) {
      console.warn('[VESNA] No LinkedIn URL - skipping');
      return;
    }

    const leadData = {
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      company: 'LinkedIn',
      theirMessage: hasRealMessage ? parsed.message : '',
      linkedinUrl: parsed.linkedinUrl,
      notificationType: parsed.notificationType,
      rawSubject: subject,
      accountName: 'Vesna Pevec',
      accountFirstName: 'Vesna',
      source: 'vesna-email-notif'
    };

    let notificationContext = '';
    if (parsed.notificationType === 'accepted') {
      notificationContext = `${parsed.firstName} accepted Vesna's LinkedIn connection request. Start a warm, brief opener.`;
    } else {
      notificationContext = `${parsed.firstName} sent a message to Vesna on LinkedIn but text wasn't in the email.`;
    }

    // Classify intent - only if there's a real message
    if (hasRealMessage) {
      const intent = await classifyIntent(parsed.message);
      leadData.intent = intent;
      console.log(`[VESNA] Intent: ${intent} | ${leadData.firstName} ${leadData.lastName}`);

      if (intent === 'negative') {
        console.log(`[VESNA] Skipping - negative response from ${leadData.firstName}`);
        return;
      }

      if (intent === 'soft_negative') {
        const closing = await generateClosingReply(leadData, parsed.message);
        const sendAt = getSendAt('linkedin');
        const id = uuidv4();
        await storePending(id, { channel: 'vesna', leadData, draft: closing });
        await markScheduled(id, closing, sendAt);
        console.log(`[VESNA] Soft negative - closing reply scheduled for ${leadData.firstName} at ${formatSendTime(sendAt)}`);
        return;
      }

      // Email handoff (Vesna campaign too - "Žan se javi z emailom")
      const handoffTriggered = await maybeHandleEmailHandoff('vesna', leadData, parsed.message);
      if (handoffTriggered) return;
    }

    const messageForAI = hasRealMessage ? parsed.message : notificationContext;

    // Generate reply in Vesna's style
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 200,
      system: VESNA_STYLE_GUIDE,
      messages: [{
        role: 'user',
        content: `Lead name: ${leadData.firstName} ${leadData.lastName}
${hasRealMessage ? `Their message: "${messageForAI}"` : `Context: ${messageForAI}`}

Write a short LinkedIn reply in Vesna's name that warmly acknowledges their interest and smoothly sets up the director (Žan) reaching out with a tailored offer.`
      }]
    });

    const draft = response.content[0].text.trim();
    const offerUrl = await createAndDeployOffer(leadData);
    const id = uuidv4();
    await storePending(id, { channel: 'vesna', leadData, draft });
    await sendApprovalEmail(id, leadData, draft, 'linkedin', offerUrl);
    console.log(`[VESNA] Queued reply for: ${leadData.firstName} ${leadData.lastName}`);
  } catch (err) {
    console.error('[VESNA] Error:', err.message);
  }
});

// ─── APPROVE ──────────────────────────────────────────────────────────────────

app.get('/approve/:id', async (req, res) => {
  let pending = await getPending(req.params.id);
  if (!pending && req.query.d) {
    try { pending = JSON.parse(Buffer.from(req.query.d, 'base64url').toString()); }
    catch (e) { console.warn('[APPROVE] Bad d param:', e.message); }
  }
  if (!pending) {
    return res.status(404).send(page('Ni najdeno', '<p>Approval ne obstaja ali je že bilo obdelano.</p>'));
  }
  if (pending.status === 'scheduled') {
    return res.send(page('Že načrtovano', `
      <div style="text-align:center;padding:40px 0">
        <div style="font-size:48px;margin-bottom:16px">⏰</div>
        <h2 style="color:#2563eb">Že v vrsti</h2>
        <p style="color:#666">Pošlje ob: ${formatSendTime(pending.sendAt)}</p>
      </div>
    `));
  }

  const { channel, leadData, draft } = pending;
  const sendAt = getSendAt(channel);

  await markScheduled(req.params.id, draft, sendAt.toISOString(), pending);

  const hour = getCETHour();
  const inWindow = (channel === 'email') || (hour >= SEND_WINDOW_START && hour < SEND_WINDOW_END);
  const delayLabel = inWindow
    ? `v ${formatDelay(sendAt)}`
    : `ob ${formatSendTime(sendAt)} (zunaj okna ${SEND_WINDOW_START}:00-${SEND_WINDOW_END}:00)`;

  res.send(page('Načrtovano!', `
    <div style="text-align:center;padding:40px 0">
      <div style="font-size:48px;margin-bottom:16px">⏰</div>
      <h2 style="color:#2563eb;margin:0 0 8px">Sporočilo načrtovano</h2>
      <p style="color:#666;margin:0 0 4px">${leadData.firstName} ${leadData.lastName}</p>
      <p style="color:#16a34a;font-weight:600;font-size:18px;margin:12px 0 4px">Pošlje ${delayLabel}</p>
      <p style="color:#999;font-size:13px">Kanal: ${channel}</p>
    </div>
  `));
});

// ─── EDIT ─────────────────────────────────────────────────────────────────────

app.get('/edit/:id', async (req, res) => {
  let pending = await getPending(req.params.id);
  if (!pending && req.query.d) {
    try { pending = JSON.parse(Buffer.from(req.query.d, 'base64url').toString()); }
    catch (e) { console.warn('[EDIT] Bad d param:', e.message); }
  }
  if (!pending) return res.status(404).send(page('Ni najdeno', '<p>Not found.</p>'));

  const dParam = req.query.d ? `?d=${req.query.d}` : '';
  const ld = pending.leadData || {};
  const channel = pending.channel || '';

  const intentColors = {
    positive: { bg: '#dcfce7', text: '#15803d', label: 'POZITIVNO' },
    negative: { bg: '#fee2e2', text: '#b91c1c', label: 'NEGATIVNO' },
    soft_negative: { bg: '#fef3c7', text: '#a16207', label: 'MEHKO NEGATIVNO' },
    question: { bg: '#dbeafe', text: '#1d4ed8', label: 'VPRAŠANJE' },
    neutral: { bg: '#f3f4f6', text: '#4b5563', label: 'NEVTRALNO' }
  };
  const intentStyle = intentColors[ld.intent] || null;
  const intentBadge = intentStyle
    ? `<span style="background:${intentStyle.bg};color:${intentStyle.text};padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700">${intentStyle.label}</span>`
    : '';
  const channelBadge = channel
    ? `<span style="background:${channel === 'linkedin' || channel === 'vesna' ? '#0a66c2' : '#059669'};color:#fff;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700">${(channel === 'vesna' ? 'LINKEDIN' : channel.toUpperCase())}</span>`
    : '';
  const accountBadge = ld.accountName
    ? `<span style="background:#eef2ff;color:#4338ca;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700">→ ${ld.accountName}</span>`
    : '';

  const infoRows = [];
  if (ld.email) infoRows.push(['Email', `<a href="mailto:${ld.email}" style="color:#2563eb">${ld.email}</a>`]);
  if (ld.linkedinUrl) infoRows.push(['LinkedIn', `<a href="${ld.linkedinUrl}" target="_blank" style="color:#0a66c2">${ld.linkedinUrl.replace('https://www.','')}</a>`]);
  if (ld.title) infoRows.push(['Vloga', ld.title]);
  if (ld.company && ld.company !== 'LinkedIn') infoRows.push(['Podjetje', ld.company]);
  if (ld.industry) infoRows.push(['Industrija', ld.industry]);
  if (ld.employees) infoRows.push(['Velikost', `${ld.employees} zaposlenih`]);
  if (ld.seniority) infoRows.push(['Seniorost', ld.seniority]);
  const loc = [ld.city, ld.country].filter(Boolean).join(', ');
  if (loc) infoRows.push(['Lokacija', loc]);
  if (ld.campaignName) infoRows.push(['Kampanja', ld.campaignName]);
  if (ld.notificationType) infoRows.push(['Tip dogodka', ld.notificationType]);
  if (ld.eventType) infoRows.push(['Outflo event', ld.eventType]);
  if (ld.source) infoRows.push(['Vir', ld.source]);
  if (ld.messageSentAt) infoRows.push(['Poslano ob', ld.messageSentAt]);
  if (ld.subject) infoRows.push(['Subject', ld.subject]);

  const infoPanel = infoRows.length
    ? `<div style="background:#fafafa;border:1px solid #e5e7eb;border-radius:8px;padding:14px 18px;margin-bottom:20px">
         <p style="color:#111;margin:0 0 10px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px">Kontekst</p>
         <table style="width:100%;border-collapse:collapse;font-size:13px">
           ${infoRows.map(([k,v]) => `<tr><td style="padding:3px 12px 3px 0;color:#6b7280;vertical-align:top;width:130px;white-space:nowrap">${k}</td><td style="padding:3px 0;color:#111;word-break:break-word">${v}</td></tr>`).join('')}
         </table>
       </div>`
    : '';

  res.send(page('Uredi odgovor', `
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">${channelBadge}${intentBadge}${accountBadge}</div>
    <h2 style="font-size:20px;margin:0 0 16px">${ld.firstName} ${ld.lastName}</h2>
    <p style="color:#111;margin:0 0 8px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px">Njihovo sporočilo</p>
    <div style="border-left:3px solid #111;padding:12px 16px;color:#222;margin-bottom:20px;background:#f9fafb;font-size:14px;line-height:1.6;border-radius:4px;white-space:pre-wrap">${ld.theirMessage ? ld.theirMessage.replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>') : '<em style="color:#999">Besedilo ni bilo v emailu.</em>'}</div>
    ${infoPanel}
    <p style="color:#111;margin:0 0 8px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px">Predlog odgovora</p>
    <form method="POST" action="/edit/${req.params.id}${dParam}">
      <textarea name="draft" style="width:100%;height:200px;padding:12px;font-size:15px;border:1px solid #ddd;border-radius:6px;line-height:1.6;box-sizing:border-box;font-family:inherit">${pending.draft}</textarea>
      <div style="display:flex;gap:12px;margin-top:12px">
        <button type="submit" style="background:#16a34a;color:#fff;padding:12px 28px;border:none;border-radius:6px;font-size:15px;font-weight:600;cursor:pointer">POŠLJI</button>
        <a href="/dismiss/${req.params.id}${dParam}" style="background:#f3f4f6;color:#6b7280;padding:12px 28px;text-decoration:none;border-radius:6px;font-size:15px;font-weight:600;border:1px solid #e5e7eb">ZAVRNI</a>
      </div>
    </form>
    <p style="color:#888;font-size:12px;margin-top:12px">Če popraviš besedilo, bot shrani primer in se nauči za naslednjič.</p>
  `));
});

app.post('/edit/:id', async (req, res) => {
  let pending = await getPending(req.params.id);
  if (!pending && req.query.d) {
    try { pending = JSON.parse(Buffer.from(req.query.d, 'base64url').toString()); }
    catch (e) { console.warn('[EDIT POST] Bad d param:', e.message); }
  }
  if (!pending) return res.status(404).send(page('Ni najdeno', '<p>Not found.</p>'));

  const updatedDraft = req.body.draft;
  const { channel, leadData, draft: originalDraft } = pending;

  // Save training example if meaningfully changed
  if (updatedDraft.trim() !== originalDraft.trim()) {
    saveTrainingExample(originalDraft, updatedDraft, leadData.theirMessage || '');
  }

  const sendAt = getSendAt(channel);
  await markScheduled(req.params.id, updatedDraft, sendAt.toISOString(), pending);

  const hour = getCETHour();
  const inWindow = (channel === 'email') || (hour >= SEND_WINDOW_START && hour < SEND_WINDOW_END);
  const delayLabel = inWindow
    ? `v ${formatDelay(sendAt)}`
    : `ob ${formatSendTime(sendAt)} (zunaj okna ${SEND_WINDOW_START}:00-${SEND_WINDOW_END}:00)`;

  const wasEdited = updatedDraft.trim() !== originalDraft.trim();

  res.send(page('Načrtovano!', `
    <div style="text-align:center;padding:40px 0">
      <div style="font-size:48px;margin-bottom:16px">⏰</div>
      <h2 style="color:#2563eb;margin:0 0 8px">Sporočilo načrtovano</h2>
      <p style="color:#666;margin:0 0 4px">${leadData.firstName} ${leadData.lastName}</p>
      <p style="color:#16a34a;font-weight:600;font-size:18px;margin:12px 0 4px">Pošlje ${delayLabel}</p>
      ${wasEdited ? '<p style="color:#7c3aed;font-size:13px;margin:8px 0 0">✏️ Korekcija shranjena. Bot se bo naučil za naslednjič.</p>' : ''}
    </div>
  `));
});

// ─── DISMISS ──────────────────────────────────────────────────────────────────

// /stop is the auto-send equivalent of /dismiss - clearer wording for the auto-send mail
app.get('/stop/:id', async (req, res) => {
  const pending = await getPending(req.params.id);
  if (!pending) {
    return res.send(page('Ustavljeno', `
      <div style="text-align:center;padding:40px 0">
        <div style="font-size:48px;margin-bottom:16px">🛑</div>
        <h2 style="color:#6b7280;margin:0 0 8px">Že obdelano</h2>
        <p style="color:#999">Auto-send je bil že izveden ali pa zavrnjen.</p>
      </div>
    `));
  }
  await deletePending(req.params.id);
  res.send(page('Auto-send STOP', `
    <div style="text-align:center;padding:40px 0">
      <div style="font-size:48px;margin-bottom:16px">🛑</div>
      <h2 style="color:#dc2626;margin:0 0 8px">Auto-send ustavljen</h2>
      <p style="color:#666">${pending.leadData?.firstName || ''} ${pending.leadData?.lastName || ''}</p>
      <p style="color:#999;font-size:13px;margin-top:8px">Sporočilo ni bilo poslano.</p>
    </div>
  `));
});

app.get('/dismiss/:id', async (req, res) => {
  let pending = await getPending(req.params.id);
  if (!pending && req.query.d) {
    try { pending = JSON.parse(Buffer.from(req.query.d, 'base64url').toString()); }
    catch (e) { console.warn('[DISMISS] Bad d param:', e.message); }
  }
  if (!pending) {
    // Already dismissed or server restarted - treat as success
    return res.send(page('Zavrnjeno', `
      <div style="text-align:center;padding:40px 0">
        <div style="font-size:48px;margin-bottom:16px">🗑️</div>
        <h2 style="color:#6b7280;margin:0 0 8px">Sporočilo zavrnjeno</h2>
        <p style="color:#999">Že obdelano.</p>
      </div>
    `));
  }
  await deletePending(req.params.id);
  res.send(page('Zavrnjeno', `
    <div style="text-align:center;padding:40px 0">
      <div style="font-size:48px;margin-bottom:16px">🗑️</div>
      <h2 style="color:#6b7280;margin:0 0 8px">Sporočilo zavrnjeno</h2>
      <p style="color:#999">${pending.leadData.firstName} ${pending.leadData.lastName}</p>
    </div>
  `));
});

// ─── FORCE SEND (bypass send window for testing) ──────────────────────────────

app.get('/force-send/:id', async (req, res) => {
  let pending = await getPending(req.params.id);
  if (!pending && req.query.d) {
    try { pending = JSON.parse(Buffer.from(req.query.d, 'base64url').toString()); }
    catch (e) { console.warn('[FORCE-SEND] Bad d param:', e.message); }
  }
  if (!pending) return res.status(404).send(page('Ni najdeno', '<p>Approval ne obstaja.</p>'));

  try {
    await executeSend(req.params.id, pending);
    res.send(page('Poslano!', `
      <div style="text-align:center;padding:40px 0">
        <div style="font-size:48px;margin-bottom:16px">✅</div>
        <h2 style="color:#16a34a;margin:0 0 8px">Sporočilo poslano takoj</h2>
        <p style="color:#666;margin:0 0 4px">${pending.leadData.firstName} ${pending.leadData.lastName}</p>
        <p style="color:#999;font-size:13px">Kanal: ${pending.channel}</p>
      </div>
    `));
  } catch (err) {
    console.error('[FORCE-SEND] Failed:', err.message);
    res.status(500).send(page('Napaka', `<p>Send failed: ${err.message}</p>`));
  }
});

// ─── PING (keep-alive for UptimeRobot) ───────────────────────────────────────

app.get('/ping', (req, res) => res.send('pong'));

// ─── PROPOSAL TRACKING (Airtable Proposals table) ────────────────────────────

async function airtableProposalUpsert(slug, fields) {
  if (!AIRTABLE_PAT) return null;
  try {
    const filter = encodeURIComponent(`{Slug}="${slug}"`);
    const existing = await airtableRequest('GET', `${AT_PROPOSALS}?filterByFormula=${filter}&maxRecords=1`);
    if (existing?.records?.length > 0) {
      const id = existing.records[0].id;
      await airtableRequest('PATCH', `${AT_PROPOSALS}/${id}`, { fields });
      return { id, created: false, current: existing.records[0].fields };
    }
    const created = await airtableRequest('POST', AT_PROPOSALS, { records: [{ fields: { Slug: slug, ...fields } }] });
    return { id: created?.records?.[0]?.id, created: true, current: {} };
  } catch (e) {
    console.error('[PROPOSAL-AT] upsert error:', e.message);
    return null;
  }
}

async function airtableProposalGet(slug) {
  if (!AIRTABLE_PAT) return null;
  const filter = encodeURIComponent(`{Slug}="${slug}"`);
  const res = await airtableRequest('GET', `${AT_PROPOSALS}?filterByFormula=${filter}&maxRecords=1`);
  return res?.records?.[0] || null;
}

async function airtableProposalLogEvent(slug, event, value, ua, ip) {
  if (!AIRTABLE_PAT) return null;
  const rec = await airtableProposalGet(slug);
  if (!rec) {
    // Create stub so events still get captured even if generation insert failed
    await airtableProposalUpsert(slug, {});
  }
  const current = rec?.fields || {};
  const now = new Date().toISOString();
  const fields = {};

  // Append to events log
  const existingLog = current['Events Log'] || '';
  const logLine = JSON.stringify({ t: now, e: event, v: value, ua: (ua || '').slice(0, 120), ip: (ip || '').slice(0, 45) });
  const newLog = (existingLog ? existingLog + '\n' : '') + logLine;
  // Airtable multilineText cap ~100k chars - trim oldest if huge
  fields['Events Log'] = newLog.length > 90000 ? newLog.slice(-90000) : newLog;

  // Counters
  if (event === 'page_view') {
    fields['Opens'] = (current['Opens'] || 0) + 1;
    fields['Last Open At'] = now;
    if (!current['First Open At']) fields['First Open At'] = now;
  }
  if (event === 'cta_click') {
    fields['CTA Clicks'] = (current['CTA Clicks'] || 0) + 1;
  }
  if (event === 'calendly_click') {
    fields['Calendly Clicks'] = (current['Calendly Clicks'] || 0) + 1;
  }
  if (event && event.indexOf('scroll_') === 0 && typeof value === 'number') {
    if (!current['Max Scroll'] || value > current['Max Scroll']) fields['Max Scroll'] = value;
  }
  if (event === 'heartbeat' || event === 'unload') {
    const secs = (value && typeof value === 'object') ? value.secs : null;
    const maxScrollIn = (value && typeof value === 'object') ? value.maxScroll : null;
    if (typeof secs === 'number') {
      if (!current['Time On Page (s)'] || secs > current['Time On Page (s)']) fields['Time On Page (s)'] = secs;
    }
    if (typeof maxScrollIn === 'number') {
      if (!current['Max Scroll'] || maxScrollIn > current['Max Scroll']) fields['Max Scroll'] = maxScrollIn;
    }
    fields['Last Open At'] = now;
  }

  await airtableProposalUpsert(slug, fields);
  return true;
}

// Pixel endpoint - accepts beacons from generated proposal pages
app.post('/pixel/:slug', express.json({ limit: '8kb' }), async (req, res) => {
  try {
    const slug = (req.params.slug || '').slice(0, 80);
    const { event, value } = req.body || {};
    if (!slug || !event) return res.status(200).end();
    const ua = req.headers['user-agent'] || '';
    const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString().split(',')[0].trim();
    // Skip bot crawlers (Slackbot, LinkedInBot, etc.) - they fetch link previews and shouldn't count as opens
    if (/bot|crawler|spider|preview|facebookexternalhit|linkedinbot|slackbot|whatsapp|telegrambot/i.test(ua)) {
      return res.status(200).end();
    }
    await airtableProposalLogEvent(slug, event, value, ua, ip);
  } catch (e) {
    console.error('[PIXEL] Error:', e.message);
  }
  // Always 204 - never leak errors to the browser
  res.status(204).end();
});

// GET fallback for older browsers (image beacon style)
app.get('/pixel/:slug.gif', async (req, res) => {
  try {
    const slug = (req.params.slug || '').slice(0, 80);
    const event = (req.query.e || 'page_view').toString().slice(0, 40);
    const ua = req.headers['user-agent'] || '';
    if (slug && !/bot|crawler|spider|preview/i.test(ua)) {
      await airtableProposalLogEvent(slug, event, null, ua, '');
    }
  } catch (e) {}
  // 1x1 transparent GIF
  const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  res.set('Content-Type', 'image/gif');
  res.set('Cache-Control', 'no-store, max-age=0');
  res.send(gif);
});

// Per-proposal stats JSON (for dashboard)
app.get('/proposal-stats/:slug', async (req, res) => {
  const slug = (req.params.slug || '').slice(0, 80);
  const rec = await airtableProposalGet(slug);
  if (!rec) return res.status(404).json({ error: 'not found' });
  res.json({ slug, fields: rec.fields });
});

// Register hook so every generated proposal creates a Proposals row
setOnProposalGenerated(async ({ slug, persona, theme, url, leadData }) => {
  const fullName = `${leadData.firstName || ''} ${leadData.lastName || ''}`.trim();
  const company = leadData.company && leadData.company !== 'LinkedIn' ? leadData.company : fullName;
  await airtableProposalUpsert(slug, {
    'Lead Name': fullName || company,
    'LinkedIn URL': leadData.linkedinUrl || leadData.LinkedInUrl || '',
    'Company': company,
    'Title': leadData.title || leadData.role || '',
    'Persona': persona,
    'Theme': theme,
    'URL': url,
    'Generated At': new Date().toISOString(),
    'Opens': 0,
    'CTA Clicks': 0,
    'Calendly Clicks': 0,
    'Max Scroll': 0,
  });
  console.log(`[PROPOSAL-AT] Tracked in Proposals table: ${slug}`);
});

// ─── PROPOSAL PREVIEW (no deploy, returns HTML inline) ───────────────────────
// Usage: GET /preview-proposal?company=KRKA&firstName=Marko&lastName=Novak&title=Head%20of%20IT&industry=farmacija
// Or:    POST /preview-proposal with JSON body of leadData
// Renders the proposal in the browser without uploading to Netlify - useful for testing copy/design.
app.all('/preview-proposal', async (req, res) => {
  try {
    const leadData = req.method === 'POST'
      ? req.body
      : {
          firstName: req.query.firstName || '',
          lastName: req.query.lastName || '',
          company: req.query.company || '',
          title: req.query.title || req.query.role || '',
          industry: req.query.industry || '',
          theirMessage: req.query.context || req.query.theirMessage || '',
          gender: req.query.gender || undefined,
          personaOverride: req.query.persona || undefined,
          themeOverride: req.query.theme || undefined,
        };
    if (!leadData.company && !(leadData.firstName || leadData.lastName)) {
      return res.status(400).send('Missing company or firstName/lastName');
    }
    const { buildProposalHTML } = require('./proposal');
    const { html, persona, theme, slug } = await buildProposalHTML(leadData);
    console.log(`[PROPOSAL-PREVIEW] ${leadData.company || leadData.firstName} | persona=${persona} | theme=${theme} | slug=${slug}`);
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('[PROPOSAL-PREVIEW] Error:', err.message);
    res.status(500).send(`<pre>Error: ${err.message}\n\n${err.stack}</pre>`);
  }
});

// ─── PROPOSAL DEPLOY (full pipeline, returns URL) ─────────────────────────────
app.post('/generate-proposal', async (req, res) => {
  try {
    const leadData = req.body || {};
    if (!leadData.company && !(leadData.firstName || leadData.lastName)) {
      return res.status(400).json({ error: 'Missing company or firstName/lastName' });
    }
    const url = await createAndDeployProposalSpirit(leadData);
    if (!url) return res.status(500).json({ error: 'Generation failed - check logs' });
    res.json({ ok: true, url });
  } catch (err) {
    console.error('[PROPOSAL-DEPLOY] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── HEALTHCHECK (all-in-one server-side test) ────────────────────────────────

app.get('/healthcheck', async (req, res) => {
  const report = { timestamp: new Date().toISOString(), checks: {} };

  // 1. Claude API
  try {
    const intent = await classifyIntent('Zanima me vaša ponudba');
    report.checks.claude = { ok: true, detail: `Intent: ${intent}` };
  } catch(e) {
    report.checks.claude = { ok: false, detail: e.message };
  }

  // 2. Queue
  try {
    const all = await loadPending();
    const entries = Object.values(all);
    const scheduled = entries.filter(v => v.status === 'scheduled').length;
    report.checks.queue = { ok: true, detail: `${entries.length} total, ${scheduled} scheduled` };
  } catch(e) {
    report.checks.queue = { ok: false, detail: e.message };
  }

  // 3. Env vars
  const envKeys = { anthropic: 'ANTHROPIC_API_KEY', apollo: 'APOLLO_API_KEY', airtable: 'AIRTABLE_PAT', outflo: 'OUTFLO_API_KEY', calendly: 'CALENDLY_LINK' };
  report.checks.env = { ok: true, detail: {} };
  for (const [name, key] of Object.entries(envKeys)) {
    report.checks.env.detail[name] = !!process.env[key];
    if (!process.env[key] && ['anthropic', 'outflo'].includes(name)) report.checks.env.ok = false;
  }

  // 4. Airtable connectivity
  if (process.env.AIRTABLE_PAT) {
    try {
      const r = await airtableRequest('GET', `${AT_LEADS}?maxRecords=1`);
      report.checks.airtable = { ok: !r?.error, detail: r?.error ? r.error : `Connected, ${r?.records?.length ?? 0} records fetched` };
    } catch(e) {
      report.checks.airtable = { ok: false, detail: e.message };
    }
  } else {
    report.checks.airtable = { ok: false, detail: 'AIRTABLE_PAT not set' };
  }

  const allOk = Object.values(report.checks).every(c => c.ok);
  report.ok = allOk;
  res.json(report);
});

// Debug: test full reply pipeline without scheduling
app.post('/test-reply', async (req, res) => {
  const { message, name, linkedinUrl } = req.body;
  if (!message) return res.json({ error: 'message required' });
  try {
    const intent = await classifyIntent(message);
    const leadData = {
      firstName: (name || 'Test').split(' ')[0],
      lastName: (name || '').split(' ').slice(1).join(' '),
      company: '', linkedinUrl: linkedinUrl || '', title: '',
      industry: '', employees: '', seniority: ''
    };
    let draft;
    if (intent === 'negative') {
      draft = `Razumem, hvala za odgovor ${leadData.firstName}. Če se kdaj situacija spremeni, sem tu. Lep pozdrav, Žan`;
    } else {
      draft = await generateReply('linkedin', leadData, message, true);
    }
    res.json({ ok: true, intent, draft, anthropicKeySet: !!process.env.ANTHROPIC_API_KEY });
  } catch(e) {
    res.json({ ok: false, error: e.message, anthropicKeySet: !!process.env.ANTHROPIC_API_KEY });
  }
});

// ─── STATUS ───────────────────────────────────────────────────────────────────

app.get('/status', async (req, res) => {
  const all = await loadPending();
  const items = Object.entries(all).map(([id, item]) => ({
    id,
    name: `${item.leadData?.firstName} ${item.leadData?.lastName}`,
    channel: item.channel,
    status: item.status,
    sendAt: item.sendAt ? formatSendTime(item.sendAt) : '-',
    createdAt: item.createdAt
  }));

  const examples = loadTrainingExamples();

  res.send(page('Status', `
    <h2 style="font-size:18px;margin:0 0 20px">Bot Status</h2>
    <p style="color:#555;margin:0 0 4px">CET ura: <strong>${getCETHour()}:xx</strong> | Okno: ${SEND_WINDOW_START}:00-${SEND_WINDOW_END}:00</p>
    <p style="color:#555;margin:0 0 20px">Training primerov: <strong>${examples.length}</strong></p>

    <h3 style="font-size:15px;margin:0 0 12px">V vrsti (${items.length})</h3>
    ${items.length === 0
      ? '<p style="color:#999">Nič v vrsti.</p>'
      : items.map(i => `
        <div style="border:1px solid #e5e7eb;border-radius:6px;padding:12px;margin-bottom:8px">
          <strong>${i.name}</strong> &mdash; ${i.channel}
          <span style="float:right;color:${i.status === 'scheduled' ? '#16a34a' : '#d97706'}">${i.status}</span>
          <br><span style="color:#999;font-size:12px">
            ${i.status === 'scheduled' ? `Pošlje ob: ${i.sendAt}` : 'Čaka potrditev'}
            &nbsp;|&nbsp; Ustvarjeno: ${new Date(i.createdAt).toLocaleString('sl-SI', { timeZone: 'Europe/Ljubljana' })}
          </span>
        </div>
      `).join('')
    }
    <p style="margin-top:20px">
      <a href="/poll-now" style="color:#2563eb;font-size:13px">Ročni poll Instantly</a>
      &nbsp;|&nbsp;
      <a href="/dashboard" style="color:#2563eb;font-size:13px">Dashboard</a>
    </p>
  `));
});

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
// Wide-layout HTML overview: weekly KPIs, pipeline funnel, queue, system health.

async function dashboardCountLeads(formula) {
  if (!AIRTABLE_PAT) return 0;
  try {
    let total = 0;
    let offset = null;
    do {
      const url = `${AT_LEADS}?filterByFormula=${encodeURIComponent(formula)}&fields[]=Lead%20Name&pageSize=100${offset ? `&offset=${encodeURIComponent(offset)}` : ''}`;
      const r = await airtableRequest('GET', url);
      if (!r?.records) break;
      total += r.records.length;
      offset = r.offset || null;
      if (total > 5000) break; // safety cap
    } while (offset);
    return total;
  } catch (e) {
    console.error('[DASHBOARD] count error:', e.message);
    return 0;
  }
}

async function dashboardLatestMessages(limit = 10) {
  if (!AIRTABLE_PAT) return [];
  try {
    const r = await airtableRequest('GET', `${AT_MESSAGES}?pageSize=${limit}&sort[0][field]=Message%20ID&sort[0][direction]=desc`);
    if (!r?.records) return [];
    return r.records.map(rec => ({
      id: rec.id,
      leadName: rec.fields['Lead Name'] || '',
      direction: rec.fields['Direction'] || '',
      intent: rec.fields['Intent'] || '',
      text: (rec.fields['Text'] || '').substring(0, 280),
      draftReply: rec.fields['Draft Reply'] || '',
      messageId: rec.fields['Message ID'] || '',
      timestamp: rec.fields['Timestamp'] || '',
      sent: !!rec.fields['Sent'],
      feedbackRating: rec.fields['Feedback Rating'] || '',
      feedbackTags: rec.fields['Feedback Tags'] || [],
      feedbackComment: rec.fields['Feedback Comment'] || '',
      feedbackAt: rec.fields['Feedback At'] || ''
    }));
  } catch (e) {
    console.error('[DASHBOARD] messages error:', e.message);
    return [];
  }
}

// Feedback save endpoint - patches the Messages record with rating/tags/comment
app.post('/api/feedback', async (req, res) => {
  try {
    if (!AIRTABLE_PAT) return res.status(503).json({ error: 'Airtable not configured' });
    const { recordId, rating, tags, comment } = req.body || {};
    if (!recordId || typeof recordId !== 'string') {
      return res.status(400).json({ error: 'recordId required' });
    }
    const ALLOWED_RATINGS = ['good', 'needs_edit', 'bad', ''];
    const ALLOWED_TAGS = new Set(['ton ni ok', 'pregenerično', 'napačen angle', 'predolgo', 'prekratko', 'manjka context', 'wrong offer', 'opening weak', 'CTA weak', 'slovnica', 'preveč sales']);
    const fields = {};
    if (rating !== undefined) {
      if (!ALLOWED_RATINGS.includes(rating)) return res.status(400).json({ error: 'invalid rating' });
      fields['Feedback Rating'] = rating || null;
    }
    if (Array.isArray(tags)) {
      const clean = tags.filter(t => typeof t === 'string' && ALLOWED_TAGS.has(t));
      fields['Feedback Tags'] = clean;
    }
    if (comment !== undefined) {
      fields['Feedback Comment'] = (typeof comment === 'string' ? comment : '').substring(0, 5000);
    }
    fields['Feedback At'] = new Date().toISOString();
    const result = await airtableRequest('PATCH', `${AT_MESSAGES}/${recordId}`, { fields });
    if (!result || result.error) {
      console.error('[FEEDBACK] Airtable error:', result?.error || 'unknown');
      return res.status(500).json({ error: result?.error?.message || 'Airtable save failed' });
    }
    console.log(`[FEEDBACK] Saved ${recordId} rating=${rating || '-'} tags=${(tags || []).length} comment=${(comment || '').length}ch`);
    res.json({ ok: true, fields: result.fields });
  } catch (e) {
    console.error('[FEEDBACK] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/dashboard', async (req, res) => {
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Run all aggregations in parallel
  const [
    pendingAll,
    repliesThisWeek,
    offersSent7d,
    meetingsBooked7d,
    noShows7d,
    meetingsBooked30d,
    statusReplied,
    statusOfferSent,
    statusMeetingBooked,
    statusNoShow,
    latestMessages
  ] = await Promise.all([
    loadPending(),
    dashboardCountLeads(`AND({Last Activity}!=BLANK(), IS_AFTER({Last Activity}, "${since7d.split('T')[0]}"))`),
    dashboardCountLeads(`AND({Email Sent At}!=BLANK(), IS_AFTER({Email Sent At}, "${since7d}"))`),
    dashboardCountLeads(`AND({Booked At}!=BLANK(), IS_AFTER({Booked At}, "${since7d}"))`),
    dashboardCountLeads(`AND({No Show Recovered At}!=BLANK(), IS_AFTER({No Show Recovered At}, "${since7d}"))`),
    dashboardCountLeads(`AND({Booked At}!=BLANK(), IS_AFTER({Booked At}, "${since30d}"))`),
    dashboardCountLeads(`{Status}="Replied"`),
    dashboardCountLeads(`{Status}="Offer Sent (Email)"`),
    dashboardCountLeads(`{Status}="Meeting Booked"`),
    dashboardCountLeads(`{Status}="No Show"`),
    dashboardLatestMessages(30)
  ]);

  // Feedback filter via query string: ?filter=needs_feedback | flagged | all (default)
  const feedbackFilter = (req.query.filter || 'all').toString();
  const filteredMessages = latestMessages.filter(m => {
    if (feedbackFilter === 'needs_feedback') return !m.feedbackRating;
    if (feedbackFilter === 'flagged') return m.feedbackRating === 'bad' || m.feedbackRating === 'needs_edit';
    return true;
  });

  const pendingItems = Object.entries(pendingAll).map(([id, item]) => ({
    id,
    name: `${item.leadData?.firstName || ''} ${item.leadData?.lastName || ''}`.trim(),
    channel: item.channel,
    status: item.status,
    source: item.source || '',
    sendAt: item.sendAt ? formatSendTime(item.sendAt) : null,
    isAuto: (item.source || '').includes('auto-send')
  }));
  const pendingCount = pendingItems.filter(i => i.status === 'pending').length;
  const scheduledCount = pendingItems.filter(i => i.status === 'scheduled').length;
  const autoSendCount = pendingItems.filter(i => i.isAuto).length;

  const intentCounts = latestMessages.reduce((acc, m) => {
    const k = m.intent || 'unknown';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  // KPI card
  const kpiCard = (label, value, sub = '', color = '#111') => `
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:18px 20px;flex:1;min-width:160px">
      <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;font-weight:600">${label}</div>
      <div style="font-size:32px;font-weight:700;color:${color};margin:4px 0 2px;line-height:1.1">${value}</div>
      ${sub ? `<div style="font-size:11px;color:#9ca3af">${sub}</div>` : ''}
    </div>`;

  // Funnel bar
  const funnelTotal = Math.max(statusReplied + statusOfferSent + statusMeetingBooked, 1);
  const funnelBar = (label, count, color) => {
    const pct = Math.round((count / funnelTotal) * 100);
    return `
    <div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
        <span style="color:#374151;font-weight:600">${label}</span>
        <span style="color:#6b7280">${count}</span>
      </div>
      <div style="background:#f3f4f6;border-radius:4px;height:8px;overflow:hidden">
        <div style="background:${color};height:100%;width:${Math.max(pct, count > 0 ? 4 : 0)}%"></div>
      </div>
    </div>`;
  };

  const intentBadge = (intent) => {
    const colors = {
      positive: { bg: '#dcfce7', text: '#15803d' },
      negative: { bg: '#fee2e2', text: '#b91c1c' },
      soft_negative: { bg: '#fef3c7', text: '#a16207' },
      neutral: { bg: '#f3f4f6', text: '#4b5563' },
      email_handoff: { bg: '#dbeafe', text: '#1d4ed8' },
      no_show_recovery: { bg: '#fce7f3', text: '#9d174d' }
    };
    const c = colors[intent] || { bg: '#f3f4f6', text: '#6b7280' };
    return `<span style="background:${c.bg};color:${c.text};padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">${(intent || 'n/a').toUpperCase()}</span>`;
  };

  const queueRows = pendingItems.length === 0
    ? '<tr><td colspan="5" style="padding:12px;color:#9ca3af;text-align:center">Vrsta je prazna.</td></tr>'
    : pendingItems.map(i => `
        <tr style="border-top:1px solid #f3f4f6">
          <td style="padding:8px 10px;font-size:13px;font-weight:600">${i.name || '<em style="color:#9ca3af">unknown</em>'}</td>
          <td style="padding:8px 10px;font-size:12px;color:#6b7280">${i.channel}</td>
          <td style="padding:8px 10px;font-size:12px;color:${i.isAuto ? '#dc2626' : (i.status === 'scheduled' ? '#16a34a' : '#d97706')};font-weight:600">${i.isAuto ? 'AUTO-SEND' : i.status}</td>
          <td style="padding:8px 10px;font-size:12px;color:#6b7280">${i.sendAt || '-'}</td>
          <td style="padding:8px 10px;font-size:11px;color:#9ca3af">${i.source}</td>
        </tr>`).join('');

  // Feedback aggregate stats (for the filter bar at top of section)
  const totalMessages = latestMessages.length;
  const ratedCount = latestMessages.filter(m => m.feedbackRating).length;
  const flaggedCount = latestMessages.filter(m => m.feedbackRating === 'bad' || m.feedbackRating === 'needs_edit').length;
  const needsFeedbackCount = totalMessages - ratedCount;

  const TAG_OPTIONS = ['ton ni ok', 'pregenerično', 'napačen angle', 'predolgo', 'prekratko', 'manjka context', 'wrong offer', 'opening weak', 'CTA weak', 'slovnica', 'preveč sales'];

  const escapeHtml = (s) => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const ratingBadge = (r) => {
    if (r === 'good') return '<span style="background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">👍 GOOD</span>';
    if (r === 'needs_edit') return '<span style="background:#fef3c7;color:#a16207;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">⚠️ NEEDS EDIT</span>';
    if (r === 'bad') return '<span style="background:#fee2e2;color:#b91c1c;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">👎 BAD</span>';
    return '';
  };

  const timeAgo = (iso) => {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    return `${d}d`;
  };

  const messageCard = (m) => {
    const tagsSet = new Set(m.feedbackTags || []);
    const tagChips = TAG_OPTIONS.map(t => {
      const active = tagsSet.has(t);
      return `<button type="button" class="tag-chip" data-tag="${escapeHtml(t)}" data-active="${active ? '1' : '0'}" style="cursor:pointer;border:1px solid ${active ? '#2563eb' : '#e5e7eb'};background:${active ? '#dbeafe' : '#fff'};color:${active ? '#1d4ed8' : '#6b7280'};padding:3px 9px;border-radius:12px;font-size:11px;font-weight:600;margin:2px">${escapeHtml(t)}</button>`;
    }).join('');

    const ratingBtn = (val, emoji, label, color) => {
      const active = m.feedbackRating === val;
      return `<button type="button" class="rating-btn" data-rating="${val}" data-color="${color}" data-active="${active ? '1' : '0'}" style="cursor:pointer;border:2px solid ${active ? color : '#e5e7eb'};background:${active ? color : '#fff'};color:${active ? '#fff' : '#374151'};padding:6px 12px;border-radius:8px;font-size:12px;font-weight:700;margin-right:6px">${emoji} ${label}</button>`;
    };

    const hasInbound = m.text && m.direction === 'inbound';
    const hasDraft = m.draftReply;

    return `
      <div class="msg-card" data-record-id="${m.id}" style="background:#fff;border:1px solid ${m.feedbackRating ? (m.feedbackRating === 'good' ? '#bbf7d0' : (m.feedbackRating === 'bad' ? '#fecaca' : '#fde68a')) : '#e5e7eb'};border-radius:10px;padding:16px 18px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:6px">
          <div>
            <strong style="font-size:13px">${escapeHtml(m.leadName) || '<em style="color:#9ca3af">unknown</em>'}</strong>
            <span style="font-size:11px;color:#9ca3af;margin-left:8px">${m.direction}</span>
            <span style="margin-left:8px">${intentBadge(m.intent)}</span>
            ${m.sent ? '<span style="background:#e0e7ff;color:#3730a3;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;margin-left:6px">SENT</span>' : ''}
            ${m.feedbackRating ? `<span style="margin-left:6px">${ratingBadge(m.feedbackRating)}</span>` : ''}
          </div>
          <span style="font-size:11px;color:#9ca3af">${timeAgo(m.timestamp)}</span>
        </div>

        ${hasInbound ? `
          <div style="background:#f9fafb;border-left:3px solid #cbd5e1;padding:8px 12px;font-size:12px;color:#374151;border-radius:4px;margin-bottom:8px;white-space:pre-wrap">${escapeHtml(m.text)}</div>
        ` : ''}

        ${hasDraft ? `
          <div style="background:#eff6ff;border-left:3px solid #2563eb;padding:8px 12px;font-size:12px;color:#1e3a8a;border-radius:4px;margin-bottom:10px;white-space:pre-wrap"><strong style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#2563eb;display:block;margin-bottom:4px">Draft reply</strong>${escapeHtml(m.draftReply)}</div>
        ` : ''}

        <details class="feedback-details" ${m.feedbackRating ? 'open' : ''} style="border-top:1px dashed #e5e7eb;padding-top:10px;margin-top:10px">
          <summary style="cursor:pointer;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;list-style:none">💬 Feedback ${m.feedbackComment ? '(has comment)' : ''}</summary>
          <div style="margin-top:10px">
            <div style="margin-bottom:8px">
              ${ratingBtn('good', '👍', 'Good', '#16a34a')}
              ${ratingBtn('needs_edit', '⚠️', 'Needs edit', '#d97706')}
              ${ratingBtn('bad', '👎', 'Bad', '#dc2626')}
            </div>
            <div style="margin-bottom:8px">${tagChips}</div>
            <textarea class="feedback-comment" placeholder="Komentar za Claude (kaj izboljšati...)" style="width:100%;box-sizing:border-box;border:1px solid #e5e7eb;border-radius:6px;padding:8px 10px;font-size:12px;font-family:inherit;min-height:50px;resize:vertical">${escapeHtml(m.feedbackComment)}</textarea>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
              <span class="feedback-status" style="font-size:11px;color:#9ca3af">${m.feedbackAt ? 'Saved ' + timeAgo(m.feedbackAt) + ' ago' : ''}</span>
              <button type="button" class="save-feedback-btn" style="cursor:pointer;background:#2563eb;color:#fff;border:none;border-radius:6px;padding:6px 14px;font-size:12px;font-weight:700">Save</button>
            </div>
          </div>
        </details>
      </div>`;
  };

  const messageCards = filteredMessages.length === 0
    ? `<div style="padding:24px;color:#9ca3af;text-align:center;font-size:13px">Ni sporočil za ta filter.</div>`
    : filteredMessages.map(messageCard).join('');

  const filterPill = (val, label, count) => {
    const active = feedbackFilter === val;
    return `<a href="?filter=${val}" style="text-decoration:none;display:inline-block;padding:5px 12px;border-radius:14px;font-size:12px;font-weight:600;margin-right:6px;background:${active ? '#111' : '#fff'};color:${active ? '#fff' : '#374151'};border:1px solid ${active ? '#111' : '#e5e7eb'}">${label} <span style="opacity:0.6;margin-left:4px">${count}</span></a>`;
  };

  const envChecks = {
    Anthropic: !!process.env.ANTHROPIC_API_KEY,
    Outflo: !!process.env.OUTFLO_API_KEY,
    Resend: !!process.env.RESEND_API_KEY,
    Instantly: !!process.env.INSTANTLY_API_KEY,
    Apollo: !!process.env.APOLLO_API_KEY,
    Airtable: !!process.env.AIRTABLE_PAT,
    Calendly: !!process.env.CALENDLY_PAT,
    Netlify: !!process.env.NETLIFY_TOKEN
  };
  const envRow = Object.entries(envChecks).map(([name, ok]) =>
    `<span style="display:inline-block;padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600;margin:2px;background:${ok ? '#dcfce7' : '#fee2e2'};color:${ok ? '#15803d' : '#b91c1c'}">${name} ${ok ? 'OK' : 'MISSING'}</span>`
  ).join('');

  const html = `<!DOCTYPE html><html><head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Dashboard | B2Booster Bot</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#f9fafb; color:#111; margin:0; padding:24px; }
      .wrap { max-width:1100px; margin:0 auto; }
      h1 { font-size:22px; margin:0 0 4px; }
      h2 { font-size:14px; margin:24px 0 12px; text-transform:uppercase; letter-spacing:0.5px; color:#6b7280; }
      .card { background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:20px; }
      .row { display:flex; gap:12px; flex-wrap:wrap; }
      table { width:100%; border-collapse:collapse; }
      a.link { color:#2563eb; text-decoration:none; font-size:13px; }
    </style>
  </head><body>
    <div class="wrap">
      <h1>B2Booster Dashboard</h1>
      <p style="color:#6b7280;margin:0 0 4px;font-size:13px">${new Date().toLocaleString('sl-SI', { timeZone: 'Europe/Ljubljana' })} CET | Okno: ${SEND_WINDOW_START}:00-${SEND_WINDOW_END}:00 | Auto-send: <strong style="color:${AUTO_SEND_ENABLED ? '#16a34a' : '#9ca3af'}">${AUTO_SEND_ENABLED ? 'ON' : 'OFF'}</strong>${AUTO_SEND_ENABLED ? ` (hold ${AUTO_SEND_HOLD_MIN}min)` : ''}</p>

      <h2>Zadnjih 7 dni</h2>
      <div class="row">
        ${kpiCard('Aktivnost (Last Activity)', repliesThisWeek, 'leadi z zadnjo aktivnostjo', '#2563eb')}
        ${kpiCard('Offers Sent', offersSent7d, 'email predstavitev poslan', '#7c3aed')}
        ${kpiCard('Meetings Booked', meetingsBooked7d, '7d | 30d: ' + meetingsBooked30d, '#16a34a')}
        ${kpiCard('No Shows', noShows7d, 'in recovery flow', '#dc2626')}
      </div>

      <h2>Pipeline funnel (vsi leadi)</h2>
      <div class="card">
        ${funnelBar('Replied', statusReplied, '#0a66c2')}
        ${funnelBar('Offer Sent (Email)', statusOfferSent, '#7c3aed')}
        ${funnelBar('Meeting Booked', statusMeetingBooked, '#16a34a')}
        ${funnelBar('No Show', statusNoShow, '#dc2626')}
      </div>

      <h2>Approval queue (${pendingItems.length})</h2>
      <div class="card" style="padding:0;overflow:hidden">
        <div style="padding:10px 16px;background:#fafafa;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280">
          Pending: <strong>${pendingCount}</strong> | Scheduled: <strong>${scheduledCount}</strong> | Auto-send hold: <strong style="color:${autoSendCount > 0 ? '#dc2626' : '#6b7280'}">${autoSendCount}</strong>
        </div>
        <table>
          <thead><tr style="background:#fafafa">
            <th style="text-align:left;padding:8px 10px;font-size:11px;color:#6b7280;text-transform:uppercase">Lead</th>
            <th style="text-align:left;padding:8px 10px;font-size:11px;color:#6b7280;text-transform:uppercase">Kanal</th>
            <th style="text-align:left;padding:8px 10px;font-size:11px;color:#6b7280;text-transform:uppercase">Status</th>
            <th style="text-align:left;padding:8px 10px;font-size:11px;color:#6b7280;text-transform:uppercase">Send At</th>
            <th style="text-align:left;padding:8px 10px;font-size:11px;color:#6b7280;text-transform:uppercase">Vir</th>
          </tr></thead>
          <tbody>${queueRows}</tbody>
        </table>
      </div>

      <h2>Zadnja sporočila & feedback <span style="text-transform:none;font-weight:400;color:#9ca3af">(${filteredMessages.length}/${totalMessages})</span></h2>
      <div style="margin-bottom:10px">
        ${filterPill('all', 'Vsa', totalMessages)}
        ${filterPill('needs_feedback', 'Brez feedbacka', needsFeedbackCount)}
        ${filterPill('flagged', 'Flagged 👎⚠️', flaggedCount)}
      </div>
      <div id="messages-list">${messageCards}</div>

      <h2>System health</h2>
      <div class="card">
        <div style="margin-bottom:8px">${envRow}</div>
        <div style="font-size:12px;color:#6b7280;border-top:1px solid #f3f4f6;padding-top:12px;margin-top:8px">
          <a class="link" href="/healthcheck">healthcheck JSON</a> &nbsp;|&nbsp;
          <a class="link" href="/status">simple status</a> &nbsp;|&nbsp;
          <a class="link" href="/poll-now">manual Instantly poll</a> &nbsp;|&nbsp;
          <a class="link" href="/trigger-followups">trigger followups</a> &nbsp;|&nbsp;
          <a class="link" href="/trigger-cold-outreach">trigger cold</a> &nbsp;|&nbsp;
          <a class="link" href="/trigger-li-followups">trigger LI followups</a>
        </div>
      </div>

      <p style="text-align:center;color:#9ca3af;font-size:11px;margin-top:32px">B2Booster Reply Bot · Dashboard</p>
    </div>
    <script>
      // Feedback interactivity: rating buttons, tag chips, save button
      function styleRating(btn) {
        const active = btn.dataset.active === '1';
        const color = btn.dataset.color;
        btn.style.border = '2px solid ' + (active ? color : '#e5e7eb');
        btn.style.background = active ? color : '#fff';
        btn.style.color = active ? '#fff' : '#374151';
      }
      function styleChip(chip) {
        const active = chip.dataset.active === '1';
        chip.style.border = '1px solid ' + (active ? '#2563eb' : '#e5e7eb');
        chip.style.background = active ? '#dbeafe' : '#fff';
        chip.style.color = active ? '#1d4ed8' : '#6b7280';
      }
      document.querySelectorAll('.msg-card').forEach(card => {
        const recordId = card.dataset.recordId;
        card.querySelectorAll('.rating-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const wasActive = btn.dataset.active === '1';
            card.querySelectorAll('.rating-btn').forEach(b => { b.dataset.active = '0'; styleRating(b); });
            if (!wasActive) { btn.dataset.active = '1'; styleRating(btn); }
          });
        });
        card.querySelectorAll('.tag-chip').forEach(chip => {
          chip.addEventListener('click', () => {
            chip.dataset.active = chip.dataset.active === '1' ? '0' : '1';
            styleChip(chip);
          });
        });
        card.querySelector('.save-feedback-btn').addEventListener('click', async () => {
          const btn = card.querySelector('.save-feedback-btn');
          const status = card.querySelector('.feedback-status');
          const activeRating = card.querySelector('.rating-btn[data-active="1"]');
          const rating = activeRating ? activeRating.dataset.rating : '';
          const tags = Array.from(card.querySelectorAll('.tag-chip[data-active="1"]')).map(c => c.dataset.tag);
          const comment = card.querySelector('.feedback-comment').value;
          btn.textContent = 'Saving...';
          btn.disabled = true;
          status.style.color = '#9ca3af';
          status.textContent = '';
          try {
            const r = await fetch('/api/feedback', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ recordId, rating, tags, comment })
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Save failed');
            status.style.color = '#16a34a';
            status.textContent = '✓ Saved';
            btn.textContent = 'Save';
            btn.disabled = false;
            setTimeout(() => { status.textContent = 'Saved just now'; status.style.color = '#9ca3af'; }, 2500);
          } catch (err) {
            status.style.color = '#dc2626';
            status.textContent = '✗ ' + err.message;
            btn.textContent = 'Save';
            btn.disabled = false;
          }
        });
      });
    </script>
  </body></html>`;
  res.send(html);
});

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function page(title, content) {
  return `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${title} | B2Booster Bot</title>
    <style>
      body { font-family: -apple-system, sans-serif; max-width: 600px; margin: 40px auto; padding: 0 20px; color: #111; }
    </style>
  </head>
  <body>${content}</body>
  </html>`;
}

// ─── POLLING: INSTANTLY REPLIES ──────────────────────────────────────────────

const LAST_POLL_FILE = './lastpoll.json';

function getLastPollTime() {
  try {
    if (fs.existsSync(LAST_POLL_FILE)) {
      return JSON.parse(fs.readFileSync(LAST_POLL_FILE, 'utf8')).timestamp;
    }
  } catch {}
  return new Date(Date.now() - 15 * 60 * 1000).toISOString();
}

function saveLastPollTime(ts) {
  fs.writeFileSync(LAST_POLL_FILE, JSON.stringify({ timestamp: ts }));
}

async function pollInstantlyReplies() {
  try {
    const since = getLastPollTime();
    const now = new Date().toISOString();

    const params = new URLSearchParams({
      limit: '20',
      'filter[timestamp_email][gte]': since,
      'filter[type]': 'received'
    });
    const res = await fetch(`https://api.instantly.ai/api/v2/emails?${params}`, {
      headers: { 'Authorization': `Bearer ${process.env.INSTANTLY_API_KEY}` }
    });

    if (!res.ok) {
      console.error('[POLL] Instantly error:', res.status, await res.text());
      return;
    }

    const data = await res.json();
    const items = data.items || data.data || (Array.isArray(data) ? data : []);
    console.log(`[POLL] ${items.length} new replies since ${since}`);

    for (const item of items) {
      const leadData = {
        firstName: item.from_address_name?.split(' ')[0] || item.from_address_email?.split('@')[0] || 'Unknown',
        lastName: item.from_address_name?.split(' ').slice(1).join(' ') || '',
        company: item.from_address_email?.split('@')[1] || 'Unknown',
        theirMessage: item.body?.text || item.body?.html?.replace(/<[^>]+>/g, '') || item.preview || '',
        emailUuid: item.id || item.message_id,
        subject: item.subject || '',
        email: item.from_address_email || '',
        accountName: 'Žan Bagarič',
        accountFirstName: 'Žan',
        source: 'instantly-poll'
      };
      if (!leadData.theirMessage) continue;
      leadData.intent = await classifyIntent(leadData.theirMessage);
      const draft = await generateReply('email', leadData, leadData.theirMessage);
      const id = uuidv4();
      await storePending(id, { channel: 'email', leadData, draft });
      await sendApprovalEmail(id, leadData, draft, 'email');
      console.log(`[POLL] Queued: ${leadData.firstName} ${leadData.lastName}`);
    }

    saveLastPollTime(now);
  } catch (err) {
    console.error('[POLL] Error:', err.message);
  }
}

app.get('/poll-now', async (req, res) => {
  res.json({ status: 'polling...' });
  await pollInstantlyReplies();
});

// ─── SEND COLD EMAIL ──────────────────────────────────────────────────────────

const AIERA_SIGNATURE_HTML = `
  <table style="margin-top:20px;border-top:1px solid #e5e7eb;padding-top:16px;font-family:Arial,sans-serif;font-size:13px;color:#374151">
    <tr><td style="padding-bottom:2px"><strong style="font-size:14px">Žan Bagarič</strong></td></tr>
    <tr><td style="color:#6b7280">CEO | AIERA</td></tr>
    <tr><td style="padding-top:6px">
      <a href="tel:+38640708327" style="color:#374151;text-decoration:none">040 708 327</a> &nbsp;·&nbsp;
      <a href="mailto:zan@aiera.si" style="color:#374151;text-decoration:none">zan@aiera.si</a> &nbsp;·&nbsp;
      <a href="https://aiera.si" style="color:#1d4ed8;text-decoration:none">aiera.si</a>
    </td></tr>
  </table>
`;

async function sendColdEmail({ to, subject, bodyText }) {
  const htmlBody = bodyText
    .split('\n')
    .map(line => line.trim() === '' ? '<br>' : `<p style="margin:0 0 8px 0;font-family:Arial,sans-serif;font-size:14px;color:#111827">${line}</p>`)
    .join('');

  const html = `<div style="max-width:600px;padding:24px">${htmlBody}${AIERA_SIGNATURE_HTML}</div>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Žan Bagarič <zan@aiera.si>',
      to,
      subject,
      html
    })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Resend error: ${JSON.stringify(data)}`);
  console.log(`[EMAIL] Cold email sent to ${to}`);
  return data;
}

// POST /send-email  { to, subject, body }
app.post('/send-email', async (req, res) => {
  const { to, subject, body } = req.body;
  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'Missing: to, subject, body' });
  }
  try {
    const result = await sendColdEmail({ to, subject, bodyText: body });
    res.json({ ok: true, id: result.id });
  } catch (err) {
    console.error('[EMAIL] Cold send error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── LINKEDIN VOYAGER POLLER ──────────────────────────────────────────────────

const SEEN_FILE = './seen_conversations.json';

function loadSeen() {
  try { return JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8')); } catch { return {}; }
}
function markSeen(convId) {
  const seen = loadSeen();
  seen[convId] = new Date().toISOString();
  // Keep only last 500 entries
  const keys = Object.keys(seen);
  if (keys.length > 500) keys.slice(0, keys.length - 500).forEach(k => delete seen[k]);
  fs.writeFileSync(SEEN_FILE, JSON.stringify(seen, null, 2));
}

async function pollLinkedInInbox() {
  const liAt = process.env.LI_AT;
  const jsessionId = process.env.LI_JSESSIONID;
  if (!liAt || !jsessionId) {
    console.warn('[POLL] LI_AT or LI_JSESSIONID not set - skipping');
    return { skipped: true };
  }

  const res = await fetch('https://www.linkedin.com/voyager/api/messaging/conversations?q=inbox&count=20&start=0', {
    headers: {
      'Cookie': `li_at=${liAt}; JSESSIONID="${jsessionId}"`,
      'csrf-token': jsessionId,
      'x-restli-protocol-version': '2.0.0',
      'x-li-lang': 'en_US',
      'x-li-track': '{"clientVersion":"1.13.9","osName":"web","timezoneOffset":2,"timezone":"Europe/Ljubljana","deviceFormFactor":"DESKTOP"}',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'accept': 'application/vnd.linkedin.normalized+json+2.1',
    }
  });

  if (!res.ok) {
    console.error('[POLL] LinkedIn API error:', res.status, res.statusText);
    return { error: res.status };
  }

  const data = await res.json();
  const convs = data.elements || [];
  const seen = loadSeen();
  let processed = 0;

  for (const conv of convs) {
    try {
      const convId = conv.entityUrn || conv['*events'];
      if (!convId) continue;

      // Get last event (most recent message)
      const events = conv['*events'] ? (data.included || []).filter(i =>
        i['$type'] === 'com.linkedin.voyager.messaging.Event' &&
        conv.entityUrn && i.entityUrn && i.entityUrn.includes(conv.entityUrn.split(':').pop())
      ) : [];

      // Try direct events structure
      const directEvents = conv.events && conv.events.elements ? conv.events.elements : events;
      if (!directEvents.length) continue;

      const lastEvent = directEvents[0];
      const eventId = lastEvent.entityUrn || lastEvent['dashEntityUrn'] || convId + '_last';

      // Skip if already seen
      if (seen[eventId]) continue;

      // Extract message body
      const msgEvent = lastEvent.eventContent &&
        (lastEvent.eventContent['com.linkedin.voyager.messaging.event.MessageEvent'] ||
         lastEvent.eventContent['*com.linkedin.voyager.messaging.event.MessageEvent']);
      if (!msgEvent) continue;

      const body = msgEvent.body || msgEvent.attributedBody?.text || '';
      if (!body || body.length < 3) continue;

      // Extract sender - skip if it's ourselves
      const fromMember = lastEvent.from &&
        (lastEvent.from['com.linkedin.voyager.messaging.MessagingMember'] ||
         lastEvent.from['*com.linkedin.voyager.messaging.MessagingMember']);
      if (!fromMember) continue;

      const miniProfile = fromMember.miniProfile || {};
      const firstName = miniProfile.firstName || 'Unknown';
      const lastName = miniProfile.lastName || '';
      const publicId = miniProfile.publicIdentifier || '';
      const linkedinUrl = publicId ? `https://www.linkedin.com/in/${publicId}` : null;

      // Skip our own messages
      if (publicId === 'zan-bagaric' || publicId === 'zbagaric') continue;
      if (!linkedinUrl) continue;

      console.log(`[POLL] New message from ${firstName} ${lastName}: "${body.substring(0, 80)}"`);

      markSeen(eventId);
      processed++;

      const leadData = {
        firstName, lastName,
        company: 'LinkedIn',
        theirMessage: body,
        linkedinUrl,
        notificationType: 'replied',
        rawSubject: `${firstName} sent a message (polled)`,
        accountName: 'Žan Bagarič',
        accountFirstName: 'Žan',
        source: 'linkedin-poll'
      };

      // Classify intent
      const intent = await classifyIntent(body);
      leadData.intent = intent;
      console.log(`[POLL] Intent: ${intent} | ${firstName} ${lastName}`);
      if (intent === 'negative') continue;

      if (intent === 'soft_negative') {
        const closing = await generateClosingReply(leadData, body);
        const id = uuidv4();
        await storePending(id, { channel: 'linkedin', leadData, draft: closing });
        await markScheduled(id, closing, getSendAt('linkedin'));
        continue;
      }

      // Email handoff check
      const handoffTriggered = await maybeHandleEmailHandoff('linkedin', leadData, body);
      if (handoffTriggered) continue;

      const [draft, offerUrl] = await Promise.all([
        generateReply('linkedin', leadData, body, true),
        createAndDeployOffer(leadData)
      ]);
      await enqueueReply({
        channel: 'linkedin',
        leadData,
        draft,
        intent: leadData.intent || intent,
        hasRealMessage: true,
        offerUrl,
        source: 'linkedin-poll'
      });
    } catch (err) {
      console.error('[POLL] Error processing conv:', err.message);
    }
  }

  return { checked: convs.length, processed };
}

app.post('/poll-linkedin', async (req, res) => {
  // Simple auth - same secret as webhook
  const secret = req.headers['x-poll-secret'] || req.query.secret;
  if (process.env.POLL_SECRET && secret !== process.env.POLL_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const result = await pollLinkedInInbox();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[POLL] Fatal error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── APOLLO ENRICHMENT ───────────────────────────────────────────────────────

async function enrichLeadWithApollo(linkedinUrl) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) { console.log('[APOLLO] No API key set'); return null; }
  try {
    const res = await fetch('https://api.apollo.io/api/v1/people/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
      body: JSON.stringify({ linkedin_url: linkedinUrl, reveal_personal_emails: true, reveal_phone_number: true })
    });
    const data = await res.json();
    if (!res.ok) {
      console.log(`[APOLLO] API error ${res.status}:`, JSON.stringify(data).substring(0, 200));
      return null;
    }
    const p = data.person;
    if (!p) {
      console.log('[APOLLO] No person returned for:', linkedinUrl, '| error:', data.error_code || data.message || 'none');
      return null;
    }
    const email = p.email || p.personal_emails?.[0] || '';
    const phone = p.phone_numbers?.[0]?.sanitized_number || '';
    return {
      title: p.title || '',
      seniority: p.seniority || '',
      companyName: p.organization?.name || '',
      industry: p.organization?.industry || '',
      employees: p.organization?.estimated_num_employees || '',
      city: p.city || '',
      country: p.country || '',
      email,
      phone
    };
  } catch (e) {
    console.log('[APOLLO] Enrichment failed:', e.message);
    return null;
  }
}

// Debug endpoint - test Apollo enrichment directly
app.get('/test-apollo', async (req, res) => {
  const url = req.query.url || 'https://www.linkedin.com/in/zan-bagaric';
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) return res.json({ error: 'APOLLO_API_KEY not set' });
  try {
    const r = await fetch('https://api.apollo.io/api/v1/people/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
      body: JSON.stringify({ linkedin_url: url, reveal_personal_emails: false })
    });
    const raw = await r.json();
    res.json({
      url,
      status: r.status,
      hasKey: !!apiKey,
      error_code: raw.error_code || null,
      message: raw.message || null,
      person: raw.person ? {
        name: raw.person.name,
        title: raw.person.title,
        seniority: raw.person.seniority,
        company: raw.person.organization?.name,
        industry: raw.person.organization?.industry,
        employees: raw.person.organization?.estimated_num_employees
      } : null
    });
  } catch(e) {
    res.json({ error: e.message });
  }
});

// ─── OUTFLO WEBHOOK ───────────────────────────────────────────────────────────

app.post('/webhook/outflo', async (req, res) => {
  res.json({ ok: true }); // Acknowledge immediately

  try {
    const payload = req.body;
    const eventType = payload.event_type;

    const SUPPORTED = [
      'FIRST_REPLY_FROM_A_LEAD_IN_OUTFLO_CAMPAIGN',
      'EVERY_MESSAGE_OR_INMAIL_RECEIVED'
    ];
    if (!SUPPORTED.includes(eventType)) {
      console.log(`[WEBHOOK] Unsupported event type: ${eventType}`);
      return;
    }

    // Real Outflo schema (confirmed 2026-05-15):
    //   payload.account = OUR Outflo account (Žan/Vesna/Mojca)
    //   payload.message.text = body
    //   payload.message.sender_* = the LEAD (the person who replied to us)
    //   payload.conversation_id = conversation id

    const msg = payload.message || {};
    const acct = payload.account || {};

    const messageText = msg.text || msg.body || msg.content || payload.text || '';
    const leadProfileUrl = msg.sender_profile_url || msg.sender_url || payload.lead?.profile_url || payload.lead?.linkedin_url || '';
    const leadFirstNameFromPayload = msg.sender_first_name || payload.lead?.first_name || '';
    const leadLastNameFromPayload = msg.sender_last_name || payload.lead?.last_name || '';
    const leadFullName = [leadFirstNameFromPayload, leadLastNameFromPayload].filter(Boolean).join(' ') || payload.lead?.full_name || payload.lead?.name || 'Lead';

    // Safety: skip if "sender" is actually one of our own accounts (e.g. echo of an outbound message)
    if (leadProfileUrl && acct.profile_url && leadProfileUrl === acct.profile_url) {
      console.log('[OUTFLO] Skipping - sender is our own account (echo)');
      return;
    }

    if (!messageText) {
      console.log('[OUTFLO] Missing message text - payload keys:', Object.keys(payload).join(','));
      return;
    }
    if (!leadProfileUrl) {
      console.log('[OUTFLO] Missing lead profile URL - message obj:', JSON.stringify(msg).substring(0, 500));
      return;
    }

    // Detect which OUR account received the reply. Only Žan and Vesna are wired to the bot.
    // Mojca (and any other account) is handled manually - skip.
    const campaignName = payload.campaign?.name || acct.full_name || '';
    const acctFirst = (acct.first_name || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    const acctName = (acct.full_name || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    const isVesna = acctFirst === 'vesna' || acctName.includes('vesna') || campaignName.toLowerCase().includes('vesna');
    const isZan = acctFirst === 'zan' || acctName.includes('zan bagaric') || campaignName.toLowerCase().includes('zan');
    if (!isVesna && !isZan) {
      console.log(`[OUTFLO] Skipping - account "${acct.full_name || acctFirst}" is not Žan or Vesna (bot handles only those two)`);
      return;
    }
    const senderLabel = isVesna ? 'VESNA' : 'WEBHOOK';

    console.log(`[${senderLabel}] ${eventType} | Campaign: "${campaignName}" | From: ${leadFullName}: "${messageText.substring(0, 80)}"`);

    // Classify intent
    const intent = await classifyIntent(messageText);
    console.log(`[${senderLabel}] Intent: ${intent}`);

    // Parse name
    const nameParts = leadFullName.trim().split(' ');
    const firstName = nameParts[0] || 'Lead';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Apollo enrichment - only for interested leads (skip negatives to save credits)
    const apolloData = (intent !== 'negative')
      ? await enrichLeadWithApollo(leadProfileUrl)
      : null;
    if (apolloData) {
      console.log(`[APOLLO] ${apolloData.companyName} | ${apolloData.employees} emp | ${apolloData.industry}`);
    } else if (intent === 'negative') {
      console.log(`[APOLLO] Skipped - negative intent`);
    }

    const leadData = {
      firstName,
      lastName,
      company: apolloData?.companyName || campaignName || '',
      linkedinUrl: leadProfileUrl,
      title: apolloData?.title || '',
      industry: apolloData?.industry || '',
      employees: apolloData?.employees || '',
      seniority: apolloData?.seniority || '',
      city: apolloData?.city || '',
      country: apolloData?.country || '',
      theirMessage: messageText,
      intent,
      campaignName,
      accountName: acct.full_name || (isVesna ? 'Vesna Pevec' : 'Žan Bagarič'),
      accountFirstName: acct.first_name || (isVesna ? 'Vesna' : 'Žan'),
      eventType,
      conversationId: payload.conversation_id || '',
      messageSentAt: msg.sent_at || '',
      source: isVesna ? 'outflo-vesna' : 'outflo-zan'
    };

    let draft;
    const channel = isVesna ? 'vesna' : 'linkedin';

    if (intent === 'negative') {
      const signoff = isVesna ? 'Vesna Pevec' : 'Žan';
      draft = `Razumem, hvala za odgovor ${firstName}. Če se kdaj situacija spremeni, sem tu. Lep pozdrav, ${signoff}`;
    } else {
      // Check for email handoff before drafting normal reply
      const handoffTriggered = await maybeHandleEmailHandoff(channel, leadData, messageText);
      if (handoffTriggered) return;

      if (isVesna) {
        // Vesna style: warm, hands off to Žan, no Calendly, no email
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 150,
          system: VESNA_STYLE_GUIDE,
          messages: [{
            role: 'user',
            content: `Lead name: ${firstName} ${lastName}\nTheir message: "${messageText}"\n\nWrite a short LinkedIn reply in Vesna's name.`
          }]
        });
        draft = response.content[0].text.trim();
      } else {
        draft = await generateReply('linkedin', leadData, messageText, true);
      }
    }

    console.log(`[${senderLabel}] Generated reply: "${draft}"`);

    // Route through enqueueReply: positive Žan replies may auto-send (15-min hold),
    // everything else (Vesna, negative, neutral) still goes to manual approval.
    if (intent === 'negative') {
      // Negative closeouts always go to manual approval (no auto-send, no scheduling)
      const id = uuidv4();
      await storePending(id, { channel, leadData, draft, source: 'outflo-negative' });
      await sendApprovalEmail(id, leadData, draft, 'linkedin');
    } else {
      await enqueueReply({
        channel,
        leadData,
        draft,
        intent,
        hasRealMessage: true,
        source: 'outflo-webhook'
      });
    }

    console.log(`[${senderLabel}] Approval email sent for ${leadFullName}`);

    // Log to Airtable (non-blocking)
    airtableUpsertLead(leadProfileUrl, leadFullName, campaignName, channel, 'Replied', messageText, apolloData || {}).catch(() => {});
    airtableLogMessage(leadFullName, leadProfileUrl, 'inbound', intent, messageText, null, false).catch(() => {});
    airtableLogMessage(leadFullName, leadProfileUrl, 'outbound', intent, null, draft, false).catch(() => {});

  } catch (err) {
    console.error('[WEBHOOK] Error:', err.message);
  }
});

// ─── CALENDLY WEBHOOK ─────────────────────────────────────────────────────────
// When a lead books a Calendly call we flip Airtable Status to "Meeting Booked"
// and store Booked At + Meeting Time. The followup cron then skips them.
// Setup: set env vars CALENDLY_PAT, CALENDLY_WEBHOOK_SIGNING_KEY (optional but recommended).
// The server auto-creates the webhook subscription on startup if missing.

const CALENDLY_API = 'https://api.calendly.com';
const CALENDLY_PAT = process.env.CALENDLY_PAT;
const CALENDLY_WEBHOOK_SIGNING_KEY = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;

function verifyCalendlySignature(rawBody, signatureHeader) {
  if (!CALENDLY_WEBHOOK_SIGNING_KEY) return true; // skip verification if no key configured
  if (!signatureHeader) return false;
  try {
    const parts = Object.fromEntries(
      signatureHeader.split(',').map(kv => kv.split('=').map(s => s.trim()))
    );
    const t = parts.t;
    const v1 = parts.v1;
    if (!t || !v1) return false;
    const expected = crypto
      .createHmac('sha256', CALENDLY_WEBHOOK_SIGNING_KEY)
      .update(`${t}.${rawBody}`)
      .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(v1, 'hex'));
  } catch (e) {
    console.error('[CALENDLY] Signature verify error:', e.message);
    return false;
  }
}

async function airtableFindLeadByEmail(email) {
  if (!AIRTABLE_PAT || !email) return null;
  try {
    const filter = encodeURIComponent(`LOWER({Email})="${email.toLowerCase()}"`);
    const r = await airtableRequest('GET', `${AT_LEADS}?filterByFormula=${filter}&maxRecords=1`);
    if (!r?.records?.length) return null;
    return { id: r.records[0].id, fields: r.records[0].fields };
  } catch (e) {
    console.error('[AIRTABLE] findByEmail error:', e.message);
    return null;
  }
}

async function airtableFindLeadByEventUri(uri) {
  if (!AIRTABLE_PAT || !uri) return null;
  try {
    const filter = encodeURIComponent(`{Calendly Event URI}="${uri}"`);
    const r = await airtableRequest('GET', `${AT_LEADS}?filterByFormula=${filter}&maxRecords=1`);
    if (!r?.records?.length) return null;
    return { id: r.records[0].id, fields: r.records[0].fields };
  } catch (e) {
    console.error('[AIRTABLE] findByEventUri error:', e.message);
    return null;
  }
}

async function airtableMarkMeetingBooked({ email, leadName, eventUri, startTime }) {
  if (!AIRTABLE_PAT) return null;
  try {
    let lead = email ? await airtableFindLeadByEmail(email) : null;

    const fields = {
      'Status': 'Meeting Booked',
      'Booked At': new Date().toISOString(),
      'Meeting Time': startTime || null,
      'Calendly Event URI': eventUri || '',
      'Last Activity': new Date().toISOString().split('T')[0]
    };
    if (email) fields['Email'] = email;

    if (lead) {
      await airtableRequest('PATCH', `${AT_LEADS}/${lead.id}`, { fields });
      console.log(`[CALENDLY] Marked Meeting Booked: ${lead.fields['Lead Name'] || email}`);
      return lead.id;
    }
    // No matching lead found - create a fresh record so the booking is still tracked
    const created = await airtableRequest('POST', AT_LEADS, {
      records: [{ fields: { 'Lead Name': leadName || email, 'Channel': 'calendly', ...fields } }]
    });
    console.log(`[CALENDLY] Created new lead from booking: ${leadName || email}`);
    return created?.records?.[0]?.id || null;
  } catch (e) {
    console.error('[CALENDLY] markMeetingBooked error:', e.message);
    return null;
  }
}

async function airtableMarkMeetingCanceled({ eventUri, email }) {
  if (!AIRTABLE_PAT) return;
  try {
    let lead = eventUri ? await airtableFindLeadByEventUri(eventUri) : null;
    if (!lead && email) lead = await airtableFindLeadByEmail(email);
    if (!lead) {
      console.log(`[CALENDLY] Cancel: no lead matched for ${eventUri || email}`);
      return;
    }
    // Revert to Offer Sent (Email) so followup can re-engage them
    const fields = {
      'Status': 'Offer Sent (Email)',
      'Booked At': null,
      'Meeting Time': null,
      'Last Activity': new Date().toISOString().split('T')[0]
    };
    await airtableRequest('PATCH', `${AT_LEADS}/${lead.id}`, { fields });
    console.log(`[CALENDLY] Reverted (canceled): ${lead.fields['Lead Name'] || email}`);
  } catch (e) {
    console.error('[CALENDLY] markMeetingCanceled error:', e.message);
  }
}

// ─── NO-SHOW RECOVERY ────────────────────────────────────────────────────────
// Triggered by Calendly invitee_no_show.created webhook. Generates a warm,
// low-pressure recovery email offering a fresh reschedule slot (same 15-min link).

const NO_SHOW_RECOVERY_PROMPT = `You write a short Slovenian no-show recovery email sent by Žan Bagarič, CEO of AIERA.

Context: This person booked a 15-min Calendly meeting with us but did not show up. We send a warm follow-up that gives them a clean, no-guilt way to reschedule. We assume something came up on their side.

Rules:
- Slovenian, šumniki correct (š, č, ž)
- NEVER use dashes (pomišljaji). Use commas or periods.
- Never use negative words (problem, težava, izziv, zamudili, zgrešili)
- Vikamo (Vi, Vas, Vam) - never tikamo
- 3 to 4 short sentences total
- Tone: warm, professional, no judgment, no apology fishing
- Frame: assume scheduling clash, offer one fresh slot link, leave the door wide open
- One soft CTA: link to the same 15-min Calendly: [CALENDLY_15MIN]
- Sign: Žan Bagarič, AIERA
- Format:
SUBJECT: <subject>

<body>

Return only that format. No commentary.`;

async function generateNoShowRecoveryEmail(leadData) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    system: NO_SHOW_RECOVERY_PROMPT,
    messages: [{
      role: 'user',
      content: `Lead: ${leadData.firstName} ${leadData.lastName}${leadData.company && leadData.company !== 'LinkedIn' ? ', ' + leadData.company : ''}
${leadData.title ? `Role: ${leadData.title}` : ''}

Write the no-show recovery email.`
    }]
  });

  let raw = response.content[0].text.trim();
  raw = raw.replace(/\[CALENDLY_15MIN\]/g, CALENDLY_AI_15MIN);
  let subject = `${leadData.firstName}, nov termin?`;
  let body = raw;
  const subjMatch = raw.match(/^\s*SUBJECT:\s*(.+)$/im);
  if (subjMatch) {
    subject = subjMatch[1].trim().replace(/^["']|["']$/g, '');
    body = raw.replace(subjMatch[0], '').trim();
  }
  return { subject, body };
}

async function fetchCalendlyInvitee(inviteeUri) {
  if (!CALENDLY_PAT || !inviteeUri) return null;
  try {
    const res = await fetch(inviteeUri, {
      headers: { 'Authorization': `Bearer ${CALENDLY_PAT}` },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.resource || null;
  } catch (e) {
    console.error('[CALENDLY] fetchInvitee error:', e.message);
    return null;
  }
}

async function handleNoShowRecovery({ email, name, eventUri }) {
  if (!AIRTABLE_PAT) return;
  try {
    let lead = eventUri ? await airtableFindLeadByEventUri(eventUri) : null;
    if (!lead && email) lead = await airtableFindLeadByEmail(email);
    if (!lead) {
      console.log(`[NO-SHOW] No matching lead for ${email || eventUri}`);
      return;
    }
    const fields = lead.fields || {};
    if (fields['No Show Recovered At']) {
      console.log(`[NO-SHOW] Already recovered: ${fields['Lead Name'] || email}`);
      return;
    }
    const leadNameFull = fields['Lead Name'] || name || '';
    const recipientEmail = fields['Email'] || email || '';
    if (!recipientEmail) {
      console.log(`[NO-SHOW] No email on record for ${leadNameFull} - cannot send recovery`);
      return;
    }
    const nameParts = leadNameFull.trim().split(' ');
    const leadData = {
      firstName: nameParts[0] || 'Lead',
      lastName: nameParts.slice(1).join(' '),
      company: fields['Campaign'] || '',
      linkedinUrl: fields['LinkedIn URL'] || '',
      title: fields['Title'] || '',
      industry: fields['Industry'] || ''
    };

    const { subject, body } = await generateNoShowRecoveryEmail(leadData);

    const id = uuidv4();
    await storePending(id, {
      kind: 'email_handoff',
      mode: 'send_email',
      channel: 'linkedin',
      leadData,
      recipientEmail,
      emailSubject: subject,
      emailBody: body,
      liReply: null,
      source: 'no-show-recovery'
    });

    await sendHandoffApprovalEmail(id, leadData, {
      mode: 'send_email',
      recipientEmail,
      subject: `[NO-SHOW RECOVERY] ${subject}`,
      body,
      liReply: null
    });

    // Mark as recovered + flip status so followup cron skips
    try {
      await airtableRequest('PATCH', `${AT_LEADS}/${lead.id}`, {
        fields: {
          'Status': 'No Show',
          'No Show Recovered At': new Date().toISOString(),
          'Last Activity': new Date().toISOString().split('T')[0]
        }
      });
    } catch (e) {
      console.error('[NO-SHOW] Airtable mark error:', e.message);
    }

    airtableLogMessage(
      leadNameFull,
      leadData.linkedinUrl,
      'outbound',
      'no_show_recovery',
      `[NO-SHOW RECOVERY → ${recipientEmail}] ${subject}`,
      body,
      false
    ).catch(() => {});

    console.log(`[NO-SHOW] Recovery approval queued: ${leadNameFull} → ${recipientEmail}`);
  } catch (e) {
    console.error('[NO-SHOW] handleNoShowRecovery error:', e.message);
  }
}

// Calendly sends JSON. We need the raw body for signature verification, so we
// register an isolated express.raw handler ONLY on this route.
app.post('/webhook/calendly', express.raw({ type: '*/*' }), async (req, res) => {
  res.json({ ok: true }); // Acknowledge fast

  try {
    const raw = req.body?.toString('utf8') || '';
    const sigHeader = req.headers['calendly-webhook-signature'];

    if (!verifyCalendlySignature(raw, sigHeader)) {
      console.error('[CALENDLY] Invalid signature - ignoring webhook');
      return;
    }

    const body = JSON.parse(raw);
    const event = body.event;
    const p = body.payload || {};

    const email = (p.email || '').trim();
    const name = p.name || [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
    const eventUri = p.scheduled_event?.uri || '';
    const startTime = p.scheduled_event?.start_time || null;

    console.log(`[CALENDLY] event=${event} email=${email} name=${name} start=${startTime}`);

    if (event === 'invitee.created') {
      await airtableMarkMeetingBooked({ email, leadName: name, eventUri, startTime });
      // Log to Messages for full timeline (use safe existing intent 'positive')
      try {
        const lead = email ? await airtableFindLeadByEmail(email) : null;
        const li = lead?.fields?.['LinkedIn URL'] || '';
        await airtableLogMessage(
          name || email,
          li,
          'inbound',
          'positive',
          `[CALENDLY BOOKED] ${startTime || 'unknown time'} | ${eventUri || ''}`,
          null,
          true
        );
      } catch (e) { /* non-fatal */ }
    } else if (event === 'invitee.canceled') {
      await airtableMarkMeetingCanceled({ eventUri, email });
      try {
        const lead = eventUri ? await airtableFindLeadByEventUri(eventUri) : (email ? await airtableFindLeadByEmail(email) : null);
        const li = lead?.fields?.['LinkedIn URL'] || '';
        await airtableLogMessage(
          name || email,
          li,
          'inbound',
          'negative',
          `[CALENDLY CANCELED] ${eventUri || ''}`,
          null,
          true
        );
      } catch (e) { /* non-fatal */ }
    } else if (event === 'invitee_no_show.created') {
      // No-show recovery: Calendly invitee URI points to the resource we need
      const inviteeUri = p.invitee || p.uri || '';
      let noShowEmail = email;
      let noShowName = name;
      let noShowEventUri = eventUri;
      if (inviteeUri) {
        const invitee = await fetchCalendlyInvitee(inviteeUri);
        if (invitee) {
          noShowEmail = invitee.email || noShowEmail;
          noShowName = invitee.name || noShowName;
          noShowEventUri = invitee.scheduled_event?.uri || invitee.event || noShowEventUri;
        }
      }
      console.log(`[CALENDLY] No-show: ${noShowName || noShowEmail} (${noShowEventUri || 'unknown event'})`);
      await handleNoShowRecovery({ email: noShowEmail, name: noShowName, eventUri: noShowEventUri });
    } else {
      console.log(`[CALENDLY] Ignored event: ${event}`);
    }
  } catch (err) {
    console.error('[CALENDLY] Webhook error:', err.message);
  }
});

// One-time bootstrap on startup: ensure a Calendly webhook subscription exists.
async function ensureCalendlySubscription() {
  if (!CALENDLY_PAT) {
    console.log('[CALENDLY] CALENDLY_PAT not set - skipping subscription bootstrap');
    return;
  }
  const base = process.env.SERVER_URL || process.env.RENDER_EXTERNAL_URL;
  if (!base) {
    console.log('[CALENDLY] No SERVER_URL/RENDER_EXTERNAL_URL - cannot register webhook');
    return;
  }
  const targetUrl = `${base.replace(/\/$/, '')}/webhook/calendly`;

  try {
    // Resolve user + organization URIs
    const meRes = await fetch(`${CALENDLY_API}/users/me`, {
      headers: { 'Authorization': `Bearer ${CALENDLY_PAT}` }
    });
    if (!meRes.ok) {
      console.error('[CALENDLY] /users/me failed:', meRes.status, await meRes.text());
      return;
    }
    const me = await meRes.json();
    const userUri = me.resource?.uri;
    const orgUri = me.resource?.current_organization;
    if (!userUri || !orgUri) {
      console.error('[CALENDLY] Could not resolve user/org URIs');
      return;
    }

    // List existing subscriptions
    const listRes = await fetch(
      `${CALENDLY_API}/webhook_subscriptions?organization=${encodeURIComponent(orgUri)}&user=${encodeURIComponent(userUri)}&scope=user`,
      { headers: { 'Authorization': `Bearer ${CALENDLY_PAT}` } }
    );
    const list = listRes.ok ? await listRes.json() : { collection: [] };
    const REQUIRED_EVENTS = ['invitee.created', 'invitee.canceled', 'invitee_no_show.created'];
    const existing = (list.collection || []).find(s => s.callback_url === targetUrl);

    if (existing) {
      const has = new Set(existing.events || []);
      const missing = REQUIRED_EVENTS.filter(e => !has.has(e));
      if (missing.length === 0) {
        console.log(`[CALENDLY] Webhook already subscribed with all events: ${targetUrl} (state=${existing.state})`);
        return;
      }
      // Calendly API does not allow PATCH on events. Delete + recreate.
      console.log(`[CALENDLY] Existing subscription missing events: ${missing.join(', ')}. Recreating...`);
      try {
        await fetch(existing.uri, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${CALENDLY_PAT}` }
        });
      } catch (e) {
        console.error('[CALENDLY] Old subscription delete failed:', e.message);
      }
    }

    // Create new subscription
    const createRes = await fetch(`${CALENDLY_API}/webhook_subscriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CALENDLY_PAT}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: targetUrl,
        events: REQUIRED_EVENTS,
        organization: orgUri,
        user: userUri,
        scope: 'user',
        ...(CALENDLY_WEBHOOK_SIGNING_KEY ? { signing_key: CALENDLY_WEBHOOK_SIGNING_KEY } : {})
      })
    });
    if (!createRes.ok) {
      console.error('[CALENDLY] Subscription create failed:', createRes.status, await createRes.text());
      return;
    }
    const created = await createRes.json();
    console.log(`[CALENDLY] Webhook subscribed: ${targetUrl} (uri=${created.resource?.uri})`);
  } catch (e) {
    console.error('[CALENDLY] Subscription bootstrap error:', e.message);
  }
}

// ─── START ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`B2Booster Reply Bot on port ${PORT}`);
  console.log(`Send window: ${SEND_WINDOW_START}:00-${SEND_WINDOW_END}:00 CET`);

  // Recover scheduled sends on startup (survives server restart/spin-up)
  setTimeout(processScheduledSends, 10 * 1000);

  // Check queue every 60s
  setInterval(processScheduledSends, 60 * 1000);

  // Poll Instantly after warmup, then every 15 min
  setTimeout(pollInstantlyReplies, 30 * 1000);
  setInterval(pollInstantlyReplies, 15 * 60 * 1000);

  // Email handoff follow-ups: check Airtable for 3-day overdue leads, once after warmup + every 6h
  setTimeout(processFollowups, 60 * 1000);
  setInterval(processFollowups, 6 * 60 * 60 * 1000);

  // Cron A: LinkedIn silent 3+ days (no email discussed) → LinkedIn nudge approval
  setTimeout(processLiFollowups, 75 * 1000);
  setInterval(processLiFollowups, 6 * 60 * 60 * 1000);

  // Cron B: Asked for email on LinkedIn, went silent 3+ days + has Apollo email → email outreach
  setTimeout(processColdLinkedInLeads, 90 * 1000);
  setInterval(processColdLinkedInLeads, 6 * 60 * 60 * 1000);

  // Calendly webhook auto-subscribe (idempotent - only creates if missing)
  setTimeout(ensureCalendlySubscription, 20 * 1000);

  // Self-ping every 14 min to prevent Render free tier spin-down
  const SELF_URL = process.env.RENDER_EXTERNAL_URL || 'https://b2booster-reply-bot.onrender.com';
  setInterval(async () => {
    try {
      await fetch(`${SELF_URL}/ping`, { signal: AbortSignal.timeout(10000) });
      console.log('[KEEPALIVE] Self-ping OK');
    } catch(e) {
      console.error('[KEEPALIVE] Self-ping failed:', e.message);
    }
  }, 14 * 60 * 1000);
});
