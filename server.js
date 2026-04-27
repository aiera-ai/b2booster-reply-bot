require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const fetch = require('node-fetch');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const PENDING_FILE = './pending.json';

// ─── STORAGE ──────────────────────────────────────────────────────────────────

function loadPending() {
  if (!fs.existsSync(PENDING_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8')); }
  catch { return {}; }
}

function storePending(id, data) {
  const all = loadPending();
  all[id] = { ...data, createdAt: new Date().toISOString() };
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

// ─── STYLE GUIDE ──────────────────────────────────────────────────────────────
// Edit this section to train the bot over time.
// Add good example replies at the bottom under EXAMPLES.

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
- Always include Calendly CTA as literal text: [CALENDLY LINK]
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

// ─── GENERATE REPLY ───────────────────────────────────────────────────────────

async function generateReply(channel, leadData, theirMessage) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const channelNote = channel === 'linkedin'
    ? 'LinkedIn message. Maximum 3 sentences. Natural, conversational. No formal opener.'
    : 'Email reply. Professional. End with Calendly link.';

  const prompt = `Channel: ${channelNote}
Lead name: ${leadData.firstName} ${leadData.lastName}
Company: ${leadData.company}
Their message: "${theirMessage}"

Write a reply that naturally continues the conversation and moves toward a Calendly booking.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    system: STYLE_GUIDE,
    messages: [{ role: 'user', content: prompt }]
  });

  return response.content[0].text.trim();
}

// ─── SEND VIA OUTFLO (LinkedIn) ───────────────────────────────────────────────

async function sendViaOutflo(receiverLinkedInUrl, text) {
  const res = await fetch('https://live.outflo.in/api/public/conversations/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.OUTFLO_API_KEY
    },
    body: JSON.stringify({
      senderProfileUrl: process.env.MY_LINKEDIN_URL,
      receiverLinkedInUrl,
      text
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Outflo error: ${JSON.stringify(data)}`);
  return data;
}

// ─── SEND VIA INSTANTLY (Email) ───────────────────────────────────────────────
// Instantly API v1 reply endpoint. Adjust if they update their API.

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

async function sendApprovalEmail(id, leadData, draft, channel) {
  const base = process.env.SERVER_URL || `http://localhost:${PORT}`;
  const channelLabel = channel === 'linkedin' ? '🔵 LinkedIn' : '📧 Email';

  const html = `
    <div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="margin:0 0 16px;font-size:18px;color:#111">
        ${channelLabel} &mdash; ${leadData.firstName} ${leadData.lastName}
      </h2>
      <p style="color:#555;margin:0 0 4px"><strong>Podjetje:</strong> ${leadData.company}</p>
      <p style="color:#555;margin:0 0 16px"><strong>Njihovo sporočilo:</strong></p>
      <div style="border-left:3px solid #d1d5db;padding:10px 16px;color:#444;margin-bottom:24px;background:#f9fafb">
        ${leadData.theirMessage.replace(/\n/g, '<br>')}
      </div>
      <p style="color:#555;margin:0 0 8px"><strong>Predlog odgovora:</strong></p>
      <div style="border-left:3px solid #2563eb;padding:10px 16px;background:#eff6ff;margin-bottom:24px;font-size:15px;line-height:1.6">
        ${draft.replace(/\n/g, '<br>')}
      </div>
      <div style="display:flex;gap:12px">
        <a href="${base}/approve/${id}"
           style="background:#16a34a;color:#fff;padding:12px 28px;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px">
          POŠLJI
        </a>
        <a href="${base}/edit/${id}"
           style="background:#2563eb;color:#fff;padding:12px 28px;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px">
          UREDI
        </a>
      </div>
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
      subject: `[${channel === 'linkedin' ? 'LI' : 'EMAIL'}] ${leadData.firstName} ${leadData.lastName} odgovoril`,
      html
    })
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[RESEND] Error:', err);
  }
}

// ─── WEBHOOK: INSTANTLY ───────────────────────────────────────────────────────
// Configure in Instantly: Settings → Webhooks → Reply Received
// Map fields: first_name, last_name, company_name, email_reply_text, email_uuid, email_subject

app.post('/webhook/instantly', async (req, res) => {
  res.sendStatus(200); // always ack immediately

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

    console.log(`[EMAIL] Approval queued: ${leadData.firstName} ${leadData.lastName}`);
  } catch (err) {
    console.error('[EMAIL] Error:', err.message);
  }
});

// ─── WEBHOOK: LINKEDIN ────────────────────────────────────────────────────────
// Zapier setup:
//   Trigger: Gmail → New Email (filter: from:notifications@linkedin.com)
//   Parse: first_name, last_name, company, message, linkedin_url from email body
//   Action: Webhooks by Zapier → POST to /webhook/linkedin
//   Fields to send: first_name, last_name, company, message, linkedin_url

app.post('/webhook/linkedin', async (req, res) => {
  res.sendStatus(200);

  try {
    const { first_name, last_name, company, message, linkedin_url } = req.body;

    const leadData = {
      firstName: first_name || 'Unknown',
      lastName: last_name || '',
      company: company || 'Unknown',
      theirMessage: message || '',
      linkedinUrl: linkedin_url
    };

    if (!leadData.theirMessage) return;

    const draft = await generateReply('linkedin', leadData, leadData.theirMessage);
    const id = uuidv4();
    storePending(id, { channel: 'linkedin', leadData, draft });
    await sendApprovalEmail(id, leadData, draft, 'linkedin');

    console.log(`[LINKEDIN] Approval queued: ${leadData.firstName} ${leadData.lastName}`);
  } catch (err) {
    console.error('[LINKEDIN] Error:', err.message);
  }
});

// ─── APPROVE ──────────────────────────────────────────────────────────────────

app.get('/approve/:id', async (req, res) => {
  const pending = getPending(req.params.id);
  if (!pending) {
    return res.status(404).send(page('Ni najdeno', '<p>Approval ne obstaja ali je že bilo obdelano.</p>'));
  }

  try {
    const { channel, leadData, draft } = pending;

    if (channel === 'linkedin') {
      await sendViaOutflo(leadData.linkedinUrl, draft);
    } else {
      await sendViaInstantly(leadData.emailUuid, draft, leadData.subject);
    }

    deletePending(req.params.id);

    res.send(page('Poslano!', `
      <div style="text-align:center;padding:40px 0">
        <div style="font-size:48px;margin-bottom:16px">✅</div>
        <h2 style="color:#16a34a;margin:0 0 8px">Sporočilo poslano</h2>
        <p style="color:#666">${leadData.firstName} ${leadData.lastName} &mdash; ${leadData.company}</p>
        <p style="color:#999;font-size:13px">Kanal: ${channel}</p>
      </div>
    `));
  } catch (err) {
    console.error('[APPROVE] Error:', err.message);
    res.status(500).send(page('Napaka', `<p style="color:red">${err.message}</p>`));
  }
});

// ─── EDIT ─────────────────────────────────────────────────────────────────────

app.get('/edit/:id', (req, res) => {
  const pending = getPending(req.params.id);
  if (!pending) return res.status(404).send(page('Ni najdeno', '<p>Not found.</p>'));

  res.send(page('Uredi odgovor', `
    <h2 style="font-size:18px;margin:0 0 16px">Uredi odgovor</h2>
    <p style="color:#555;margin:0 0 4px">
      <strong>${pending.leadData.firstName} ${pending.leadData.lastName}</strong>
      &mdash; ${pending.leadData.company}
    </p>
    <p style="color:#888;font-size:13px;margin:0 0 12px">Njihovo sporočilo:</p>
    <div style="border-left:3px solid #d1d5db;padding:8px 14px;color:#555;margin-bottom:20px;background:#f9fafb;font-size:14px">
      ${pending.leadData.theirMessage.replace(/\n/g, '<br>')}
    </div>
    <form method="POST" action="/edit/${req.params.id}">
      <textarea name="draft" style="width:100%;height:180px;padding:12px;font-size:15px;border:1px solid #ddd;border-radius:6px;line-height:1.6;box-sizing:border-box">${pending.draft}</textarea>
      <button type="submit" style="margin-top:12px;background:#16a34a;color:#fff;padding:12px 28px;border:none;border-radius:6px;font-size:15px;font-weight:600;cursor:pointer">
        POŠLJI
      </button>
    </form>
  `));
});

app.post('/edit/:id', async (req, res) => {
  const pending = getPending(req.params.id);
  if (!pending) return res.status(404).send(page('Ni najdeno', '<p>Not found.</p>'));

  const updatedDraft = req.body.draft;

  try {
    const { channel, leadData } = pending;

    if (channel === 'linkedin') {
      await sendViaOutflo(leadData.linkedinUrl, updatedDraft);
    } else {
      await sendViaInstantly(leadData.emailUuid, updatedDraft, leadData.subject);
    }

    deletePending(req.params.id);
    res.send(page('Poslano!', `
      <div style="text-align:center;padding:40px 0">
        <div style="font-size:48px;margin-bottom:16px">✅</div>
        <h2 style="color:#16a34a">Sporočilo poslano</h2>
      </div>
    `));
  } catch (err) {
    res.status(500).send(page('Napaka', `<p style="color:red">${err.message}</p>`));
  }
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

// ─── START ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`B2Booster Reply Bot listening on port ${PORT}`);
  console.log(`Webhooks:`);
  console.log(`  POST /webhook/instantly  (email replies)`);
  console.log(`  POST /webhook/linkedin   (LinkedIn replies via Zapier)`);
});
