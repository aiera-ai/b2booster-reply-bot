// Generator ponudb renderer - replaces {{placeholders}} in template.html with slot values.

const fs = require('fs');
const path = require('path');

const TEMPLATE_PATH = path.join(__dirname, 'template.html');

function loadTemplate() {
  return fs.readFileSync(TEMPLATE_PATH, 'utf8');
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatSlovenianDate(d) {
  const months = ['januar', 'februar', 'marec', 'april', 'maj', 'junij', 'julij', 'avgust', 'september', 'oktober', 'november', 'december'];
  return `${d.getDate()}. ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function buildDemoItemsHtml(items) {
  if (!Array.isArray(items) || items.length === 0) return '';
  return items.map(it => `
        <div class="dm-item">
          <span class="dm-num">${escapeHtml(it.num || '')}</span>
          <div class="dm-info">
            <h4>${escapeHtml(it.title || '')}</h4>
            <p>${escapeHtml(it.desc || '')}</p>
          </div>
          <div class="dm-price">
            ${it.orig_price ? `<div class="dm-orig">${escapeHtml(it.orig_price)} EUR</div>` : ''}
            <div class="dm-final">${escapeHtml(it.final_price || '')} EUR</div>
            <div class="dm-qty">${escapeHtml(it.quantity || '')}</div>
            <div class="dm-sum">Skupaj: ${escapeHtml(it.sum || '')}</div>
          </div>
        </div>`).join('\n');
}

function renderTemplate(leadData, slots, options = {}) {
  let tpl = loadTemplate();

  const now = new Date();
  const validUntil = formatSlovenianDate(addDays(now, 21));
  const preparedDate = formatSlovenianDate(now);

  const leadCompany = leadData.company && leadData.company !== 'LinkedIn'
    ? leadData.company
    : (leadData.firstName ? `${leadData.firstName} ${leadData.lastName || ''}`.trim() : 'vaše podjetje');

  const trackBase = options.trackBase || process.env.PUBLIC_BASE_URL || 'https://b2booster-reply-bot.onrender.com';
  const slug = options.slug || '';
  const calendlyUrl = options.calendlyUrl || process.env.CALENDLY_AI_15MIN || 'https://calendly.com/aiera-koledar';

  const replacements = {
    '{{LEAD_COMPANY}}': escapeHtml(leadCompany),
    '{{CALENDLY_URL}}': escapeHtml(calendlyUrl),
    '{{HERO_HEADLINE}}': escapeHtml(slots.hero_headline || `Ponudbe ki ${leadCompany} pošilja kupcem,`),
    '{{HERO_HEADLINE_ACCENT}}': escapeHtml(slots.hero_headline_accent || 'zdaj v 30 sekundah.'),
    '{{HERO_LEAD}}': escapeHtml(slots.hero_lead || ''),
    '{{DEMO_SELLER_NAME}}': escapeHtml(slots.demo_seller_name || leadCompany.toUpperCase()),
    '{{DEMO_SELLER_ADDRESS}}': escapeHtml(slots.demo_seller_address || ''),
    '{{DEMO_OFFER_REF}}': escapeHtml(slots.demo_offer_ref || `AI-${now.getFullYear()}-001`),
    '{{DEMO_EYEBROW}}': escapeHtml(slots.demo_eyebrow || 'PONUDBA'),
    '{{DEMO_TITLE}}': escapeHtml(slots.demo_title || ''),
    '{{DEMO_SUBTITLE}}': escapeHtml(slots.demo_subtitle || ''),
    '{{DEMO_BUYER_NAME}}': escapeHtml(slots.demo_buyer_name || ''),
    '{{DEMO_BUYER_CONTACT}}': escapeHtml(slots.demo_buyer_contact || ''),
    '{{DEMO_GREETING}}': escapeHtml(slots.demo_greeting || ''),
    '{{DEMO_ITEMS_HTML}}': buildDemoItemsHtml(slots.demo_items),
    '{{DEMO_SUBTOTAL}}': escapeHtml(slots.demo_subtotal || ''),
    '{{DEMO_VAT}}': escapeHtml(slots.demo_vat || ''),
    '{{DEMO_TOTAL}}': escapeHtml(slots.demo_total || ''),
    '{{DEMO_SAVINGS}}': escapeHtml(slots.demo_savings || ''),
    '{{DEMO_VALID_UNTIL}}': escapeHtml(slots.demo_valid_until || validUntil),
    '{{DEMO_REP_NAME}}': escapeHtml(slots.demo_rep_name || ''),
    '{{DEMO_REP_PHONE}}': escapeHtml(slots.demo_rep_phone || ''),
    '{{WHY_LEAD_PARAGRAPH}}': escapeHtml(slots.why_lead_paragraph || ''),
    '{{WHY_1_TITLE}}': escapeHtml(slots.why_1_title || 'V vaši grafični podobi'),
    '{{WHY_1_TEXT}}': escapeHtml(slots.why_1_text || ''),
    '{{WHY_2_TITLE}}': escapeHtml(slots.why_2_title || 'Sledenje odzivu'),
    '{{WHY_2_TEXT}}': escapeHtml(slots.why_2_text || ''),
    '{{WHY_3_TITLE}}': escapeHtml(slots.why_3_title || 'Personalizacija za kupca'),
    '{{WHY_3_TEXT}}': escapeHtml(slots.why_3_text || ''),
    '{{WHY_4_TITLE}}': escapeHtml(slots.why_4_title || '30-krat hitreje'),
    '{{WHY_4_TEXT}}': escapeHtml(slots.why_4_text || ''),
    '{{PROOF_1_NUM}}': escapeHtml(slots.proof_1_num || '287'),
    '{{PROOF_1_LABEL}}': escapeHtml(slots.proof_1_label || 'Pripravljenih ponudb'),
    '{{PROOF_2_NUM}}': escapeHtml(slots.proof_2_num || '531k EUR'),
    '{{PROOF_2_LABEL}}': escapeHtml(slots.proof_2_label || 'V pipeline-u'),
    '{{PROOF_3_NUM}}': escapeHtml(slots.proof_3_num || '22 %'),
    '{{PROOF_3_LABEL}}': escapeHtml(slots.proof_3_label || 'Delež zaključkov'),
    '{{PREPARED_DATE}}': escapeHtml(preparedDate),
    '{{VALID_UNTIL}}': escapeHtml(validUntil),
    '{{SLUG}}': escapeHtml(slug),
    '{{TRACK_BASE}}': escapeHtml(trackBase),
  };

  for (const [k, v] of Object.entries(replacements)) {
    tpl = tpl.split(k).join(v);
  }

  // Pixel tag (open detection without JS) - injected after <body>
  if (slug) {
    const pixel = `<img src="${escapeHtml(trackBase)}/g-pixel/${escapeHtml(slug)}.gif" width="1" height="1" style="position:absolute;left:-9999px;" alt="">`;
    tpl = tpl.replace('<body>', `<body>\n${pixel}`);
  }

  return tpl;
}

module.exports = { renderTemplate, loadTemplate, formatSlovenianDate, addDays };
