require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const fetch = require('node-fetch');
const fs = require('fs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const PENDING_FILE = './pending.json';
const TRAINING_FILE = './training_examples.json';

// ─── STORAGE ──────────────────────────────────────────────────────────────────

function loadPending() {
  if (!fs.existsSync(PENDING_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8')); }
  catch { return {}; }
}

function storePending(id, data) {
  const all = loadPending();
  all[id] = { ...data, createdAt: new Date().toISOString(), status: 'pending' };
  fs.writeFileSync(PENDING_FILE, JSON.stringify(all, null, 2));
}

function getPending(id) {
  return loadPending()[id];
}

function deletePending(id) {
  const all = loadPending();
  delete all[id];
  fs.writeFileSync(PENDING_FILE, JSON.stringify(all, null, 2));
}

// Mark item as scheduled (persists through server restart)
// pendingData fallback: if server restarted and file is empty, reconstruct from ?d= param data
function markScheduled(id, draft, sendAt, pendingData = null) {
  const all = loadPending();
  if (!all[id]) {
    if (!pendingData) {
      console.error(`[QUEUE] markScheduled: ID ${id} not found and no fallback data`);
      return;
    }
    // Reconstruct entry from ?d= fallback data (server restarted, file was lost)
    all[id] = { ...pendingData, createdAt: new Date().toISOString() };
    console.log(`[QUEUE] Restored entry for ${id} from fallback data`);
  }
  all[id].status = 'scheduled';
  all[id].draft = draft;
  all[id].sendAt = sendAt;
  fs.writeFileSync(PENDING_FILE, JSON.stringify(all, null, 2));
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
    deletePending(id);
    console.log(`[QUEUE] Sent & removed: ${leadData.firstName} ${leadData.lastName} (${channel})`);
  } catch (err) {
    console.error(`[QUEUE] Send failed for ${id}:`, err.message);
    // Leave in pending so we can retry or investigate
  }
}

async function processScheduledSends() {
  const all = loadPending();
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
const UNIPILE_API_KEY = process.env.UNIPILE_API_KEY || '';
const UNIPILE_API_URL = process.env.UNIPILE_API_URL || 'https://api33.unipile.com:16331';
const VESNA_LINKEDIN_URL = process.env.VESNA_LINKEDIN_URL || 'https://www.linkedin.com/in/vesna-pevec-2110b8b4/';

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
Clients: Toyota Slovenija, Hidria, SavingsBlue

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

async function createAndDeployOffer(leadData) {
  try {
    const company = leadData.company && leadData.company !== 'LinkedIn'
      ? leadData.company
      : `${leadData.firstName}-${leadData.lastName}`.toLowerCase();
    const slug = createOfferSlug(company);
    console.log(`[OFFER] Generating for: ${company} → /${slug}`);
    const html = await generateOfferHTML(leadData);
    return await deployOfferToNetlify(slug, html);
  } catch (err) {
    console.error('[OFFER] Error:', err.message);
    return null;
  }
}

// ─── GENERATE REPLY ───────────────────────────────────────────────────────────

async function generateReply(channel, leadData, theirMessage, hasRealMessage = true) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const channelNote = channel === 'linkedin'
    ? 'LinkedIn message. Maximum 3 sentences. Natural, conversational. No formal opener.'
    : 'Email reply. Professional. End with Calendly link.';

  const trainingContext = buildTrainingContext();

  let prompt;
  if (hasRealMessage) {
    prompt = `Channel: ${channelNote}
Lead name: ${leadData.firstName} ${leadData.lastName}
Company: ${leadData.company}
Their message: "${theirMessage}"

Write a reply that naturally continues the conversation and moves toward a Calendly booking.`;
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

// ─── SEND VIA UNIPILE (LinkedIn) ─────────────────────────────────────────────

async function sendViaUnipile(chatId, accountId, text) {
  const res = await fetch(`${UNIPILE_API_URL}/api/v1/chats/${chatId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': UNIPILE_API_KEY,
      'accept': 'application/json'
    },
    body: JSON.stringify({ text, account_id: accountId })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Unipile error: ${JSON.stringify(data)}`);
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

async function sendApprovalEmail(id, leadData, draft, channel, offerUrl = null) {
  const base = process.env.SERVER_URL || `http://localhost:${PORT}`;
  const channelLabel = channel === 'linkedin' ? '🔵 LinkedIn' : '📧 Email';

  let actionLabel = 'sporočil';
  if (leadData.notificationType === 'accepted') actionLabel = 'sprejel povabilo';
  else if (leadData.notificationType === 'replied') actionLabel = 'odgovoril';
  else if (leadData.notificationType === 'messaged') actionLabel = 'sporočil';

  const messageSection = leadData.theirMessage
    ? `<p style="color:#555;margin:0 0 8px"><strong>Njihovo sporočilo:</strong></p>
       <div style="border-left:3px solid #d1d5db;padding:10px 16px;color:#444;margin-bottom:24px;background:#f9fafb;font-size:14px;line-height:1.6">
         ${leadData.theirMessage.replace(/\n/g, '<br>')}
       </div>`
    : `<p style="color:#999;font-size:13px;margin:0 0 20px;font-style:italic">
         Besedilo sporočila ni bilo v notifikacijskem emailu (LinkedIn digest format).
       </p>`;

  const profileLink = leadData.linkedinUrl
    ? `<a href="${leadData.linkedinUrl}" style="color:#2563eb;font-size:13px;text-decoration:none">Odpri LinkedIn profil</a>`
    : '';

  const hour = getCETHour();
  const inWindow = (channel === 'email') || (hour >= SEND_WINDOW_START && hour < SEND_WINDOW_END);
  const timingNote = (channel === 'email')
    ? `<p style="color:#059669;font-size:12px;margin:16px 0 0">⏰ Email bo poslan v 2-5 minutah po potrditvi.</p>`
    : inWindow
      ? `<p style="color:#059669;font-size:12px;margin:16px 0 0">⏰ Sporočilo bo poslano v 2-9 minutah po potrditvi.</p>`
      : `<p style="color:#d97706;font-size:12px;margin:16px 0 0">⏰ Zunaj okna (${SEND_WINDOW_START}:00-${SEND_WINDOW_END}:00). Pošlje ob ${SEND_WINDOW_START}:00 po potrditvi.</p>`;

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fff">
      <div style="border-bottom:1px solid #e5e7eb;padding-bottom:16px;margin-bottom:20px">
        <h2 style="margin:0 0 6px;font-size:18px;color:#111">
          ${channelLabel} &mdash; ${leadData.firstName} ${leadData.lastName}
        </h2>
        ${profileLink}
      </div>
      ${messageSection}
      <p style="color:#555;margin:0 0 8px;font-size:14px"><strong>Predlog odgovora:</strong></p>
      <div style="border-left:3px solid #2563eb;padding:12px 16px;background:#eff6ff;margin-bottom:28px;font-size:15px;line-height:1.7;color:#1e3a5f;white-space:pre-wrap">
${draft}
      </div>
      ${offerUrl ? `
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;margin-bottom:20px">
        <p style="margin:0 0 6px;font-weight:700;color:#15803d;font-size:13px">🎯 OFFER PAGE GENERIRANA</p>
        <a href="${offerUrl}" style="color:#16a34a;font-size:14px;word-break:break-all;font-weight:600">${offerUrl}</a>
        <p style="margin:6px 0 0;color:#6b7280;font-size:11px">Vključi link v email ali ga pošlji ločeno kot follow-up.</p>
      </div>
      ` : ''}
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <a href="${base}/approve/${id}?d=${Buffer.from(JSON.stringify({ channel, leadData, draft })).toString('base64url')}"
           style="background:#16a34a;color:#fff;padding:12px 28px;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;display:inline-block">
          POŠLJI
        </a>
        <a href="${base}/edit/${id}?d=${Buffer.from(JSON.stringify({ channel, leadData, draft })).toString('base64url')}"
           style="background:#2563eb;color:#fff;padding:12px 28px;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;display:inline-block">
          UREDI
        </a>
        <a href="${base}/dismiss/${id}"
           style="background:#f3f4f6;color:#6b7280;padding:12px 28px;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;display:inline-block;border:1px solid #e5e7eb">
          ZAVRNI
        </a>
      </div>
      ${timingNote}
      <p style="color:#ccc;font-size:11px;margin-top:24px">B2Booster Reply Bot</p>
    </div>
  `;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.BOT_FROM_EMAIL || 'B2Booster Bot <bot@b2booster.eu>',
      to: process.env.MY_EMAIL,
      subject: `[${channel === 'linkedin' ? 'LI' : 'EMAIL'}] ${leadData.firstName} ${leadData.lastName} ${actionLabel}`,
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

// ─── WEBHOOK: INSTANTLY ───────────────────────────────────────────────────────

app.post('/webhook/instantly', async (req, res) => {
  res.sendStatus(200);
  try {
    const { first_name, last_name, company_name, email_reply_text, email_uuid, email_subject } = req.body;
    const leadData = {
      firstName: first_name || 'Unknown',
      lastName: last_name || '',
      company: company_name || 'Unknown',
      theirMessage: email_reply_text || '',
      emailUuid: email_uuid,
      subject: email_subject
    };
    if (!leadData.theirMessage) return;
    const draft = await generateReply('email', leadData, leadData.theirMessage);
    const id = uuidv4();
    storePending(id, { channel: 'email', leadData, draft });
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
    };

    if (!leadData.linkedinUrl) {
      console.warn('[LINKEDIN] No LinkedIn URL - skipping');
      return;
    }

    // Classify intent - only if there's a real message
    if (hasRealMessage) {
      const intent = await classifyIntent(parsed.message);
      console.log(`[LINKEDIN] Intent: ${intent} | ${leadData.firstName} ${leadData.lastName}`);

      if (intent === 'negative') {
        console.log(`[LINKEDIN] Skipping - negative response from ${leadData.firstName}`);
        return;
      }

      if (intent === 'soft_negative') {
        const closing = await generateClosingReply(leadData, parsed.message);
        const sendAt = getSendAt('linkedin');
        const id = uuidv4();
        storePending(id, { channel: 'linkedin', leadData, draft: closing });
        markScheduled(id, closing, sendAt);
        console.log(`[LINKEDIN] Soft negative - closing reply scheduled for ${leadData.firstName} at ${formatSendTime(sendAt)}`);
        return;
      }
    }

    const messageForAI = hasRealMessage ? parsed.message : notificationContext;
    const [draft, offerUrl] = await Promise.all([
      generateReply('linkedin', leadData, messageForAI, hasRealMessage),
      createAndDeployOffer(leadData)
    ]);
    const id = uuidv4();
    storePending(id, { channel: 'linkedin', leadData, draft });
    await sendApprovalEmail(id, leadData, draft, 'linkedin', offerUrl);
    console.log(`[LINKEDIN] Queued: ${leadData.firstName} ${leadData.lastName}`);
  } catch (err) {
    console.error('[LINKEDIN] Error:', err.message);
  }
});

// ─── WEBHOOK: UNIPILE (LinkedIn real-time) ────────────────────────────────────

// Dedup: track recently seen message IDs to prevent double-processing on retries
const recentlyProcessed = new Set();

app.post('/webhook/unipile', async (req, res) => {
  res.sendStatus(200);
  try {
    const payload = req.body;
    console.log('[UNIPILE] Received:', JSON.stringify(payload).substring(0, 300));

    const data = payload.data || payload;
    const event = payload.event || data.event || '';

    if (event && !['message_created', 'new_message', 'MESSAGE_CREATED'].includes(event)) {
      console.log('[UNIPILE] Skipping event:', event);
      return;
    }

    // Skip outbound messages (bot-sent replies trigger this webhook too)
    if (data.from_me === true || data.is_sender === true) {
      console.log('[UNIPILE] Skipping outbound message');
      return;
    }

    const message = data.text || data.body || data.content || '';
    const chatId = data.chat_id;
    const accountId = data.account_id;
    const messageId = data.id || data.message_id || '';

    if (!chatId || !accountId) {
      console.warn('[UNIPILE] Missing chatId or accountId - skipping');
      return;
    }

    if (!message || message.trim().length < 2) {
      console.log('[UNIPILE] Empty message - skipping');
      return;
    }

    // Dedup: skip if we already processed this message ID (Unipile retry protection)
    const dedupKey = messageId || `${chatId}:${message.substring(0, 50)}`;
    if (recentlyProcessed.has(dedupKey)) {
      console.log('[UNIPILE] Duplicate - skipping:', dedupKey);
      return;
    }
    recentlyProcessed.add(dedupKey);
    setTimeout(() => recentlyProcessed.delete(dedupKey), 10 * 60 * 1000); // forget after 10 min

    const sender = data.sender || data.attendee || {};
    const senderName = sender.name || sender.display_name || data.sender_name || 'Unknown';
    const nameParts = senderName.trim().split(' ');
    const firstName = nameParts[0] || 'Unknown';
    const lastName = nameParts.slice(1).join(' ');

    const leadData = {
      firstName,
      lastName,
      company: 'LinkedIn',
      theirMessage: message,
      chatId,
      accountId,
      notificationType: 'messaged'
    };

    console.log(`[UNIPILE] From: ${firstName} ${lastName} | hour: ${getCETHour()}h CET`);

    const draft = await generateReply('linkedin', leadData, message, true);
    const id = uuidv4();
    storePending(id, { channel: 'unipile', leadData, draft });
    await sendApprovalEmail(id, leadData, draft, 'linkedin');
    console.log(`[UNIPILE] Queued: ${firstName} ${lastName}`);
  } catch (err) {
    console.error('[UNIPILE] Error:', err.message);
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
      console.log(`[VESNA] Intent: ${intent} | ${leadData.firstName} ${leadData.lastName}`);

      if (intent === 'negative') {
        console.log(`[VESNA] Skipping - negative response from ${leadData.firstName}`);
        return;
      }

      if (intent === 'soft_negative') {
        const closing = await generateClosingReply(leadData, parsed.message);
        const sendAt = getSendAt('linkedin');
        const id = uuidv4();
        storePending(id, { channel: 'vesna', leadData, draft: closing });
        markScheduled(id, closing, sendAt);
        console.log(`[VESNA] Soft negative - closing reply scheduled for ${leadData.firstName} at ${formatSendTime(sendAt)}`);
        return;
      }
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
    storePending(id, { channel: 'vesna', leadData, draft });
    await sendApprovalEmail(id, leadData, draft, 'linkedin', offerUrl);
    console.log(`[VESNA] Queued reply for: ${leadData.firstName} ${leadData.lastName}`);
  } catch (err) {
    console.error('[VESNA] Error:', err.message);
  }
});

// ─── APPROVE ──────────────────────────────────────────────────────────────────

app.get('/approve/:id', async (req, res) => {
  let pending = getPending(req.params.id);
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

  markScheduled(req.params.id, draft, sendAt.toISOString(), pending);

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

app.get('/edit/:id', (req, res) => {
  let pending = getPending(req.params.id);
  if (!pending && req.query.d) {
    try { pending = JSON.parse(Buffer.from(req.query.d, 'base64url').toString()); }
    catch (e) { console.warn('[EDIT] Bad d param:', e.message); }
  }
  if (!pending) return res.status(404).send(page('Ni najdeno', '<p>Not found.</p>'));

  const dParam = req.query.d ? `?d=${req.query.d}` : '';
  res.send(page('Uredi odgovor', `
    <h2 style="font-size:18px;margin:0 0 16px">Uredi odgovor</h2>
    <p style="color:#555;margin:0 0 4px">
      <strong>${pending.leadData.firstName} ${pending.leadData.lastName}</strong>
      &mdash; ${pending.leadData.company}
    </p>
    <p style="color:#888;font-size:13px;margin:0 0 12px">Njihovo sporočilo:</p>
    <div style="border-left:3px solid #d1d5db;padding:8px 14px;color:#555;margin-bottom:20px;background:#f9fafb;font-size:14px">
      ${pending.leadData.theirMessage ? pending.leadData.theirMessage.replace(/\n/g, '<br>') : '<em style="color:#999">Besedilo ni bilo v emailu.</em>'}
    </div>
    <form method="POST" action="/edit/${req.params.id}${dParam}">
      <textarea name="draft" style="width:100%;height:180px;padding:12px;font-size:15px;border:1px solid #ddd;border-radius:6px;line-height:1.6;box-sizing:border-box">${pending.draft}</textarea>
      <div style="display:flex;gap:12px;margin-top:12px">
        <button type="submit" style="background:#16a34a;color:#fff;padding:12px 28px;border:none;border-radius:6px;font-size:15px;font-weight:600;cursor:pointer">
          POŠLJI
        </button>
        <a href="/dismiss/${req.params.id}${dParam}" style="background:#f3f4f6;color:#6b7280;padding:12px 28px;text-decoration:none;border-radius:6px;font-size:15px;font-weight:600;border:1px solid #e5e7eb">
          ZAVRNI
        </a>
      </div>
    </form>
    <p style="color:#888;font-size:12px;margin-top:12px">Če popraviš besedilo, bot shrani primer in se nauči za naslednjič.</p>
  `));
});

app.post('/edit/:id', async (req, res) => {
  let pending = getPending(req.params.id);
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
  markScheduled(req.params.id, updatedDraft, sendAt.toISOString(), pending);

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

app.get('/dismiss/:id', (req, res) => {
  let pending = getPending(req.params.id);
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
  deletePending(req.params.id);
  res.send(page('Zavrnjeno', `
    <div style="text-align:center;padding:40px 0">
      <div style="font-size:48px;margin-bottom:16px">🗑️</div>
      <h2 style="color:#6b7280;margin:0 0 8px">Sporočilo zavrnjeno</h2>
      <p style="color:#999">${pending.leadData.firstName} ${pending.leadData.lastName}</p>
    </div>
  `));
});

// ─── PING (keep-alive for UptimeRobot) ───────────────────────────────────────

app.get('/ping', (req, res) => res.send('pong'));

// ─── STATUS ───────────────────────────────────────────────────────────────────

app.get('/status', (req, res) => {
  const all = loadPending();
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
    </p>
  `));
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
        subject: item.subject || ''
      };
      if (!leadData.theirMessage) continue;
      const draft = await generateReply('email', leadData, leadData.theirMessage);
      const id = uuidv4();
      storePending(id, { channel: 'email', leadData, draft });
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
        rawSubject: `${firstName} sent a message (polled)`
      };

      // Classify intent
      const intent = await classifyIntent(body);
      console.log(`[POLL] Intent: ${intent} | ${firstName} ${lastName}`);
      if (intent === 'negative') continue;

      if (intent === 'soft_negative') {
        const closing = await generateClosingReply(leadData, body);
        const id = uuidv4();
        storePending(id, { channel: 'linkedin', leadData, draft: closing });
        markScheduled(id, closing, getSendAt('linkedin'));
        continue;
      }

      const [draft, offerUrl] = await Promise.all([
        generateReply('linkedin', leadData, body, true),
        createAndDeployOffer(leadData)
      ]);
      const id = uuidv4();
      storePending(id, { channel: 'linkedin', leadData, draft });
      await sendApprovalEmail(id, leadData, draft, 'linkedin', offerUrl);
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

    const messageText = payload.message?.text;
    const leadProfileUrl = payload.lead?.profile_url;
    const leadFullName = payload.lead?.full_name || 'Lead';

    if (!messageText || !leadProfileUrl) {
      console.log('[WEBHOOK] Missing message text or lead profile URL, skipping');
      return;
    }

    console.log(`[WEBHOOK] ${eventType} from ${leadFullName}: "${messageText.substring(0, 80)}"`);

    // Classify intent
    const intent = await classifyIntent(messageText);
    console.log(`[WEBHOOK] Intent: ${intent}`);

    // Parse name
    const nameParts = leadFullName.trim().split(' ');
    const firstName = nameParts[0] || 'Lead';
    const lastName = nameParts.slice(1).join(' ') || '';

    const leadData = {
      firstName,
      lastName,
      company: payload.campaign?.name || '',
      linkedinUrl: leadProfileUrl
    };

    let draft;
    if (intent === 'negative') {
      // Short polite closing for rejections
      draft = `Razumem, hvala za odgovor ${firstName}. Če se kdaj situacija spremeni, sem tu. Lep pozdrav, Žan`;
    } else {
      draft = await generateReply('linkedin', leadData, messageText, true);
    }

    console.log(`[WEBHOOK] Generated reply: "${draft}"`);

    // Schedule send via existing queue
    const id = uuidv4();
    const sendAt = getSendAt('linkedin');
    storePending(id, {
      channel: 'linkedin',
      leadData,
      draft,
      source: 'outflo-webhook'
    });
    markScheduled(id, draft, sendAt);

    console.log(`[WEBHOOK] Scheduled reply to ${leadFullName} at ${formatSendTime(sendAt)}`);
  } catch (err) {
    console.error('[WEBHOOK] Error:', err.message);
  }
});

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
});
