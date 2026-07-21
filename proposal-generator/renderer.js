// Generator ponudb renderer.
// Renders two templates:
//   - template.html (landing page = product/sales page with 3 style-chooser CTAs)
//   - template-offer.html (the actual demo offer page, rendered once per theme: minimal/modern/premium)

const fs = require('fs');
const path = require('path');

const LANDING_TEMPLATE_PATH = path.join(__dirname, 'template.html');
const OFFER_TEMPLATE_PATH = path.join(__dirname, 'template-offer.html');

function loadLandingTemplate() { return fs.readFileSync(LANDING_TEMPLATE_PATH, 'utf8'); }
function loadOfferTemplate() { return fs.readFileSync(OFFER_TEMPLATE_PATH, 'utf8'); }

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Allow controlled <strong>...</strong> inside paragraphs (greeting). Other tags are escaped.
function escapeHtmlAllowStrong(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/<(?!\/?(strong|em|br)\b)/gi, '&lt;')
    .replace(/>/g, function (m) { return m; }); // keep > since <strong> uses it
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

function initialsFromName(name) {
  if (!name) return 'XX';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'XX';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function upperCompany(company) {
  if (!company) return '';
  return String(company).toUpperCase();
}

// ─── LANDING ────────────────────────────────────────────────────────────────
function renderLanding(leadData, slots, options = {}) {
  let tpl = loadLandingTemplate();

  const landing = (slots && slots.landing) ? slots.landing : (slots || {});

  const now = new Date();
  const validUntil = formatSlovenianDate(addDays(now, 21));
  const preparedDate = formatSlovenianDate(now);

  // NEVER the person's name as company.
  const leadCompany = leadData.company && leadData.company !== 'LinkedIn'
    ? leadData.company
    : 'vaše podjetje';

  const trackBase = options.trackBase || process.env.PUBLIC_BASE_URL || 'https://b2booster-reply-bot.onrender.com';
  const slug = options.slug || '';
  const calendlyUrl = options.calendlyUrl || process.env.CALENDLY_AI_15MIN || 'https://calendly.com/aiera-koledar';

  const replacements = {
    '{{LEAD_COMPANY}}': escapeHtml(leadCompany),
    '{{LEAD_COMPANY_UPPER}}': escapeHtml(upperCompany(leadCompany)),
    '{{CALENDLY_URL}}': escapeHtml(calendlyUrl),
    '{{HERO_HEADLINE}}': escapeHtml(landing.hero_headline || `Ponudbe ki jih ${leadCompany} pošilja kupcem,`),
    '{{HERO_HEADLINE_ACCENT}}': escapeHtml(landing.hero_headline_accent || 'zdaj v 30 sekundah.'),
    '{{HERO_LEAD}}': escapeHtml(landing.hero_lead || ''),

    '{{STYLE_MINIMAL_TITLE}}': escapeHtml(landing.style_minimal_title || 'Minimalist'),
    '{{STYLE_MINIMAL_SUB}}': escapeHtml(landing.style_minimal_sub || 'Čisto in profesionalno, brez odvečnih detajlov.'),
    '{{STYLE_MODERN_TITLE}}': escapeHtml(landing.style_modern_title || 'Modern'),
    '{{STYLE_MODERN_SUB}}': escapeHtml(landing.style_modern_sub || 'Topel in sodoben videz, primeren za premium blagovne znamke.'),
    '{{STYLE_PREMIUM_TITLE}}': escapeHtml(landing.style_premium_title || 'Premium dark'),
    '{{STYLE_PREMIUM_SUB}}': escapeHtml(landing.style_premium_sub || 'Temen in luksuzen, za visoke B2B transakcije.'),

    '{{WHY_LEAD_PARAGRAPH}}': escapeHtml(landing.why_lead_paragraph || ''),
    '{{WHY_1_TITLE}}': escapeHtml(landing.why_1_title || 'V vaši grafični podobi'),
    '{{WHY_1_TEXT}}': escapeHtml(landing.why_1_text || ''),
    '{{WHY_2_TITLE}}': escapeHtml(landing.why_2_title || 'Sledenje odzivu'),
    '{{WHY_2_TEXT}}': escapeHtml(landing.why_2_text || ''),
    '{{WHY_3_TITLE}}': escapeHtml(landing.why_3_title || 'Personalizacija za kupca'),
    '{{WHY_3_TEXT}}': escapeHtml(landing.why_3_text || ''),
    '{{WHY_4_TITLE}}': escapeHtml(landing.why_4_title || '30-krat hitreje'),
    '{{WHY_4_TEXT}}': escapeHtml(landing.why_4_text || ''),

    '{{PROOF_1_NUM}}': escapeHtml(landing.proof_1_num || '287'),
    '{{PROOF_1_LABEL}}': escapeHtml(landing.proof_1_label || 'Pripravljenih ponudb'),
    '{{PROOF_2_NUM}}': escapeHtml(landing.proof_2_num || '531k EUR'),
    '{{PROOF_2_LABEL}}': escapeHtml(landing.proof_2_label || 'V pipeline-u'),
    '{{PROOF_3_NUM}}': escapeHtml(landing.proof_3_num || '22 %'),
    '{{PROOF_3_LABEL}}': escapeHtml(landing.proof_3_label || 'Delež zaključkov'),

    '{{PREPARED_DATE}}': escapeHtml(preparedDate),
    '{{VALID_UNTIL}}': escapeHtml(validUntil),
    '{{SLUG}}': escapeHtml(slug),
    '{{TRACK_BASE}}': escapeHtml(trackBase),
  };

  for (const [k, v] of Object.entries(replacements)) tpl = tpl.split(k).join(v);

  if (slug) {
    const pixel = `<img src="${escapeHtml(trackBase)}/g-pixel/${escapeHtml(slug)}.gif" width="1" height="1" style="position:absolute;left:-9999px;" alt="">`;
    tpl = tpl.replace('<body>', `<body>\n${pixel}`);
  }

  return tpl;
}

// ─── OFFER ──────────────────────────────────────────────────────────────────
// Builds inner HTML helpers for the offer template.

function buildGreetingHtml(paragraphs) {
  if (!Array.isArray(paragraphs) || paragraphs.length === 0) return '<p>&nbsp;</p>';
  return paragraphs
    .filter(p => p && String(p).trim())
    .map(p => `<p>${escapeHtmlAllowStrong(String(p))}</p>`)
    .join('\n');
}

function buildCategoriesHtml(categories) {
  if (!Array.isArray(categories) || categories.length === 0) return '';
  return categories.map(cat => {
    const num = escapeHtml(cat.num || '');
    const title = escapeHtml(cat.title || '');
    const items = Array.isArray(cat.items) ? cat.items.map(it => {
      const why = it.why_this_choice
        ? `<div class="item-why"><div class="item-why-label">Zakaj ta izbira?</div><div class="item-why-text">${escapeHtmlAllowStrong(it.why_this_choice)}</div></div>`
        : '';
      const orig = it.orig_price ? `<div class="item-orig">${escapeHtml(it.orig_price)} EUR</div>` : '';
      const discount = it.discount_pct ? `<div class="item-discount">Partnerska cena (${escapeHtml(it.discount_pct)})</div>` : '';
      return `
        <div class="item">
          <div class="item-img" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
          </div>
          <div class="item-body">
            <div class="item-name">${escapeHtml(it.name || '')} <span class="arrow">↗</span></div>
            <div class="item-sku">Šifra: ${escapeHtml(it.sku || '')}</div>
            <div class="item-desc">${escapeHtml(it.desc || '')}</div>
            ${why}
          </div>
          <div class="item-price">
            ${orig}
            <div class="item-final">${escapeHtml(it.final_price || '')} EUR</div>
            ${discount}
            <div class="item-qty">Količina: ${escapeHtml(it.quantity || '')}</div>
            <div class="item-sum">Skupaj: ${escapeHtml(it.sum || '')}</div>
          </div>
        </div>`;
    }).join('\n') : '';
    return `
      <div class="cat">
        <div class="cat-head">
          <div class="cat-num">${num}</div>
          <div class="cat-title">${title}</div>
        </div>
        ${items}
      </div>`;
  }).join('\n');
}

function buildRecapLinesHtml(categories) {
  if (!Array.isArray(categories)) return '';
  const lines = [];
  categories.forEach(cat => {
    if (!Array.isArray(cat.items)) return;
    cat.items.forEach(it => {
      lines.push(`<div class="recap-row"><span class="recap-sub">${escapeHtml(it.name || '')}</span><span class="item-value">${escapeHtml(it.quantity || '')} ${escapeHtml(it.final_price || '')} EUR = ${escapeHtml(it.sum || '')}</span></div>`);
    });
  });
  return lines.join('\n');
}

function buildTermsHtml(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return '';
  return arr.map(t => `<li>${escapeHtml(t)}</li>`).join('\n');
}

function buildProgressHtml(steps) {
  // Default fallback if AI didn't provide
  const defaults = [
    { num: '1', label: 'Ponudba poslana', done: true },
    { num: '2', label: 'Stranka pregleda ponudbo', done: true },
    { num: '3', label: 'Dogovor o podrobnostih', done: false },
    { num: '4', label: 'Predračun', done: false },
    { num: '5', label: 'Dostava in namestitev', done: false },
  ];
  const src = (Array.isArray(steps) && steps.length > 0) ? steps : defaults;
  return src.map(s => {
    const cls = s.done ? ' class="done"' : '';
    const mark = s.done
      ? '<span class="step-mark"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span>'
      : `<span class="step-mark">${escapeHtml(s.num || '')}</span>`;
    return `<li${cls}>${mark}<span>${escapeHtml(s.label || '')}</span></li>`;
  }).join('\n');
}

function isOfferExpired(validUntilDate, now) {
  if (!validUntilDate) return false;
  return new Date(validUntilDate).getTime() < now.getTime();
}

function buildExpiredBadgeHtml(expired) {
  return expired ? '<span class="expired">Ponudba je potekla</span>' : '';
}

function buildExpiredBlockHtml(expired, dateFrom, dateTo) {
  if (!expired) return '';
  return `
    <div class="expired-block">
      <h4>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
        Ponudba je potekla
      </h4>
      <div class="er-bar"><div></div></div>
      <div class="er-meta"><span>${escapeHtml(dateFrom)}</span><span>${escapeHtml(dateTo)}</span></div>
      <div class="er-note">Veljavnost ponudbe je potekla. Za podaljšanje ali nov predračun se obrnite na vašega skrbnika.</div>
    </div>`;
}

function renderOffer(leadData, slots, theme, options = {}) {
  let tpl = loadOfferTemplate();

  const offer = (slots && slots.offer) ? slots.offer : (slots || {});

  const now = new Date();
  const dateFrom = formatSlovenianDate(now);
  const validUntilDate = addDays(now, 14);
  const dateTo = formatSlovenianDate(validUntilDate);
  const expired = isOfferExpired(validUntilDate, now); // currently false on fresh deploys

  // NEVER the person's name as company.
  const leadCompany = leadData.company && leadData.company !== 'LinkedIn'
    ? leadData.company
    : 'vaše podjetje';

  const trackBase = options.trackBase || process.env.PUBLIC_BASE_URL || 'https://b2booster-reply-bot.onrender.com';
  const slug = options.slug || '';
  const calendlyUrl = options.calendlyUrl || process.env.CALENDLY_AI_15MIN || 'https://calendly.com/aiera-koledar';

  const sellerFullName = offer.seller_full_name || upperCompany(leadCompany);
  const managerName = offer.manager_name || 'Ime Priimek';

  const replacements = {
    '{{THEME}}': escapeHtml(theme || 'minimal'),
    '{{SLUG}}': escapeHtml(slug),
    '{{TRACK_BASE}}': escapeHtml(trackBase),
    '{{CALENDLY_URL}}': escapeHtml(calendlyUrl),

    '{{OFFER_TITLE}}': escapeHtml(offer.offer_title || 'Vzorčna ponudba'),
    '{{OFFER_SUBTITLE}}': escapeHtml(offer.offer_subtitle || ''),
    '{{OFFER_REF}}': escapeHtml(offer.offer_ref || `XX-${now.getFullYear()}-001`),
    '{{OFFER_DATE}}': escapeHtml(dateFrom),
    '{{OFFER_VALID_UNTIL}}': escapeHtml(dateTo),
    '{{EXPIRED_BADGE_HTML}}': buildExpiredBadgeHtml(expired),

    '{{SELLER_NAME}}': escapeHtml(upperCompany(leadCompany)),
    '{{SELLER_FULL_NAME}}': escapeHtml(sellerFullName),
    '{{SELLER_ADDRESS}}': escapeHtml(offer.seller_address || ''),
    '{{SELLER_MAT_ST}}': escapeHtml(offer.seller_mat_st || '1234567000'),
    '{{SELLER_DAVCNA}}': escapeHtml(offer.seller_davcna || 'SI12345678'),
    '{{SELLER_TRR}}': escapeHtml(offer.seller_trr || 'SI56 0000 0000 0000 000 (Vaša banka)'),

    '{{BUYER_NAME}}': escapeHtml(offer.buyer_name || 'Naročnik d.o.o.'),
    '{{BUYER_ADDRESS}}': escapeHtml(offer.buyer_address || ''),
    '{{BUYER_CONTACT_NAME}}': escapeHtml(offer.buyer_contact_name || 'Janez Novak'),
    '{{BUYER_CONTACT_ROLE}}': escapeHtml(offer.buyer_contact_role || 'Vodja nabave'),
    '{{BUYER_CONTACT_EMAIL}}': escapeHtml(offer.buyer_contact_email || 'janez.novak@narocnik.si'),

    '{{GREETING_HTML}}': buildGreetingHtml(offer.greeting_paragraphs || (offer.greeting ? [offer.greeting] : [])),
    '{{CATEGORIES_HTML}}': buildCategoriesHtml(offer.categories),
    '{{RECAP_LINES_HTML}}': buildRecapLinesHtml(offer.categories),

    '{{SUBTOTAL}}': escapeHtml(offer.subtotal || ''),
    '{{VAT}}': escapeHtml(offer.vat || ''),
    '{{TOTAL}}': escapeHtml(offer.total || ''),
    '{{SAVINGS}}': escapeHtml(offer.savings || '0 EUR'),

    '{{DELIVERY_TERMS_HTML}}': buildTermsHtml(offer.delivery_terms),
    '{{PAYMENT_TERMS_HTML}}': buildTermsHtml(offer.payment_terms),
    '{{PROGRESS_HTML}}': buildProgressHtml(offer.progress_steps),

    '{{MANAGER_INITIALS}}': escapeHtml(initialsFromName(managerName)),
    '{{MANAGER_NAME}}': escapeHtml(managerName),
    '{{MANAGER_ROLE}}': escapeHtml(offer.manager_role || 'Skrbnik ključnih kupcev'),
    '{{MANAGER_PHONE}}': escapeHtml(offer.manager_phone || '+386 XX XXX XXX'),
    '{{MANAGER_EMAIL}}': escapeHtml(offer.manager_email || `info@${leadCompany.toLowerCase().replace(/[^a-z0-9]/g, '')}.si`),
    '{{MANAGER_WEBSITE}}': escapeHtml(offer.manager_website || `www.${leadCompany.toLowerCase().replace(/[^a-z0-9]/g, '')}.si`),

    '{{EXPIRED_BLOCK_HTML}}': buildExpiredBlockHtml(expired, dateFrom, dateTo),
  };

  for (const [k, v] of Object.entries(replacements)) tpl = tpl.split(k).join(v);

  return tpl;
}

// Backward-compat alias used by some callers (e.g. preview routes that still call renderTemplate).
function renderTemplate(leadData, slots, options = {}) {
  return renderLanding(leadData, slots, options);
}

module.exports = {
  renderLanding,
  renderOffer,
  renderTemplate,
  loadLandingTemplate,
  loadOfferTemplate,
  formatSlovenianDate,
  addDays,
};
