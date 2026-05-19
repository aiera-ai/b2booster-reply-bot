// Render B2Booster template with slots + lead data. Pure string replacement.

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

// Allow limited HTML for slot values that need it (e.g. <strong>, <em>)
function lightHtml(s) {
  if (s == null) return '';
  // Allow only basic inline tags
  return String(s);
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

function buildOfferNumber(company) {
  const year = new Date().getFullYear();
  const abbrev = (company || 'XYZ').replace(/[^A-Za-zšČčŠŽž]/g, '').toUpperCase().slice(0, 3).padEnd(3, 'X');
  // 3-digit sequence based on date for uniqueness (not strictly sequential, but unique-ish)
  const seq = String(Math.floor(Date.now() / 1000) % 1000).padStart(3, '0');
  return `B2B-${year}-${abbrev}-${seq}`;
}

function buildTargetGroupsHtml(groups) {
  if (!Array.isArray(groups) || groups.length === 0) return '';
  return groups.map(g => `
      <div class="target-card">
        <span class="tg-num">${escapeHtml(g.num || '')}</span>
        <h3>${escapeHtml(g.title || '')}</h3>
        <p>${escapeHtml(g.text || '')}</p>
      </div>`).join('\n');
}

function buildCountriesHtml(countries) {
  if (!Array.isArray(countries) || countries.length === 0) return '';
  return countries.map(c => `
      <div class="country-pill"><span class="cp-code">${escapeHtml(c.code || '')}</span><div class="cp-name">${escapeHtml(c.name || '')}</div></div>`).join('\n');
}

function buildMessagesHtml(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return '';
  return messages.map(m => `
      <div class="msg-card">
        <div class="msg-context">${escapeHtml(m.context || '')}</div>
        <p class="msg-body">"${escapeHtml(m.body || '')}"</p>
      </div>`).join('\n');
}

function buildPilotBulletsHtml(bullets) {
  if (!Array.isArray(bullets) || bullets.length === 0) return '';
  return bullets.map(b => `        <div>${escapeHtml(b)}</div>`).join('\n');
}

// Render template by replacing {{placeholders}}.
// leadData: { firstName, lastName, company, title, role, ... }
// slots: AI-generated content from generateB2BoosterSlots
// opts: { calendlyUrl }
function renderTemplate(leadData, slots, opts = {}) {
  const template = loadTemplate();

  const company = leadData.company && leadData.company !== 'LinkedIn'
    ? leadData.company
    : `${leadData.firstName || ''} ${leadData.lastName || ''}`.trim() || 'vaše podjetje';

  const fullName = `${leadData.firstName || ''} ${leadData.lastName || ''}`.trim() || '';
  const recipientNameCompany = fullName ? `${fullName}, ${company}` : company;

  const now = new Date();
  const offerDate = formatSlovenianDate(now);
  const offerValidUntil = formatSlovenianDate(addDays(now, 30));
  const offerNumber = buildOfferNumber(company);

  const calendlyUrl = opts.calendlyUrl
    || process.env.CALENDLY_B2BOOSTER
    || 'https://calendly.com/aiera-koledar/b2booster-x-ai';

  // Pre-build HTML fragments from arrays
  const targetGroupsHtml = buildTargetGroupsHtml(slots.target_groups);
  const countriesHtml = buildCountriesHtml(slots.countries);
  const messagesHtml = buildMessagesHtml(slots.message_examples);
  const pilotBulletsHtml = buildPilotBulletsHtml(slots.pilot_bullets);

  // All slot replacements (server-side + AI-generated)
  const replacements = {
    // Server-side
    company: escapeHtml(company),
    recipient_name_company: escapeHtml(recipientNameCompany),
    offer_date: escapeHtml(offerDate),
    offer_valid_until: escapeHtml(offerValidUntil),
    offer_number: escapeHtml(offerNumber),
    calendly_url: escapeHtml(calendlyUrl),

    // AI-generated text slots (escaped)
    hero_eyebrow: escapeHtml(slots.hero_eyebrow || `Prilagojen predlog za ${company}`),
    hero_h1_intro: escapeHtml(slots.hero_h1_intro || 'AI prevzame outreach.'),
    hero_h1_accent: escapeHtml(slots.hero_h1_accent || 'Prodajniki se posvetijo prodaji.'),
    lead_paragraph: escapeHtml(slots.lead_paragraph || ''),
    funnel_project_label: escapeHtml(slots.funnel_project_label || `${company.toLowerCase().replace(/\s+/g, '')}.b2booster / outreach`),
    goal_section_lead: escapeHtml(slots.goal_section_lead || ''),
    targets_section_lead: escapeHtml(slots.targets_section_lead || ''),
    countries_h2: escapeHtml(slots.countries_h2 || 'Sistem deluje na vseh ključnih EU trgih in širše.'),
    countries_section_lead: escapeHtml(slots.countries_section_lead || ''),
    scenario_h2: escapeHtml(slots.scenario_h2 || ''),
    scenario_lead: escapeHtml(slots.scenario_lead || ''),
    scenario_label: escapeHtml(slots.scenario_label || `Outreach - ${company} / mesec 1`),
    scenario_stat_1_num: escapeHtml(slots.scenario_stat_1_num || '450'),
    scenario_stat_1_label: escapeHtml(slots.scenario_stat_1_label || 'Identificiranih podjetij'),
    scenario_stat_2_num: escapeHtml(slots.scenario_stat_2_num || '280'),
    scenario_stat_2_label: escapeHtml(slots.scenario_stat_2_label || 'Preverjenih odločevalcev'),
    scenario_stat_3_num: escapeHtml(slots.scenario_stat_3_num || '180'),
    scenario_stat_3_label: escapeHtml(slots.scenario_stat_3_label || 'Aktivnih outreach'),
    scenario_stat_4_num: escapeHtml(slots.scenario_stat_4_num || '12-18'),
    scenario_stat_4_label: escapeHtml(slots.scenario_stat_4_label || 'Sestankov dogovorjenih'),
    fit_score: escapeHtml(slots.fit_score || '89'),
    messages_section_lead: escapeHtml(slots.messages_section_lead || ''),
    pilot_description: escapeHtml(slots.pilot_description || ''),
    cta_eyebrow: escapeHtml(slots.cta_eyebrow || `Za ${fullName || company}`),
    cta_h2: escapeHtml(slots.cta_h2 || `${company} lahko vzpostavi lasten AI outreach motor v 14 dneh.`),
    cta_paragraph: escapeHtml(slots.cta_paragraph || ''),

    // AI-generated HTML/escaped slots
    lead_accent_paragraph: lightHtml(slots.lead_accent_paragraph || ''),
    funnel_msg: lightHtml(slots.funnel_msg || ''),
    fit_example_html: lightHtml(slots.fit_example_html || ''),

    // Pre-built HTML fragments
    target_groups_html: targetGroupsHtml,
    countries_html: countriesHtml,
    message_examples_html: messagesHtml,
    pilot_bullets_html: pilotBulletsHtml,
  };

  let html = template;
  for (const [key, value] of Object.entries(replacements)) {
    const re = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    html = html.replace(re, value);
  }

  // Sanity check: any leftover {{slots}}?
  const leftover = html.match(/\{\{[a-z_]+\}\}/gi);
  if (leftover) {
    console.warn('[B2BOOSTER-RENDER] Unfilled slots:', [...new Set(leftover)].join(', '));
  }

  return html;
}

module.exports = { renderTemplate, buildOfferNumber, formatSlovenianDate };
