// Deterministic HTML template for personalized AIERA proposals.
// Design is fixed. Only content slots vary. This is how we keep quality consistent.
//
// Design language: AIERA brand (aiera.si). Violet->pink->orange gradient accents,
// light lavender paper, Space Grotesk display + DM Sans body + Instrument Serif
// italic quotes, Orbitron wordmark, rounded cards. Numbered sections via CSS
// counters. No fake browser chrome, no invented data.

const { getTheme } = require('./colors');

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const today = () => {
  const d = new Date();
  const months = ['januar', 'februar', 'marec', 'april', 'maj', 'junij', 'julij', 'avgust', 'september', 'oktober', 'november', 'december'];
  return `${d.getDate()}. ${months[d.getMonth()]} ${d.getFullYear()}`;
};

const todayUpper = () => today().toUpperCase();

// ─── BASE STYLES ──────────────────────────────────────────────────────────────

function baseStyles(theme) {
  // AIERA brand system (aiera.si): violet -> pink -> orange gradient, light
  // lavender paper, Space Grotesk display + DM Sans body + Instrument Serif
  // italic accents, 1rem radius. Per-industry theme colors are intentionally
  // ignored - every proposal carries the AIERA brand image.
  return `
:root {
  --primary: #7C3BED;
  --secondary: #EE4F84;
  --accent-o: #FA9938;
  --primary-soft: #F1EBFD;
  --ink: #14121F;
  --ink-soft: #2A2738;
  --body-c: #55516B;
  --muted: #767288;
  --paper: #F6F5FA;
  --surface: #FFFFFF;
  --border: #E6E4EF;
  --border-strong: #D8D5E6;
  --grad: linear-gradient(135deg, #7C3BED, #EE4F84, #FA9938);
}
*, *::before, *::after { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
  background: var(--paper);
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  line-height: 1.6;
  counter-reset: section;
}
h1, h2, h3 {
  font-family: 'Space Grotesk', system-ui, sans-serif;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--ink);
  margin: 0;
}
h4 { font-family: 'Space Grotesk', sans-serif; color: var(--ink); margin: 0; }
p { margin: 0; }
a { color: inherit; text-decoration: none; }
.serif-accent { font-family: 'Instrument Serif', Georgia, serif; font-style: italic; font-weight: 400; letter-spacing: -0.01em; }
.grad-text {
  background: linear-gradient(135deg, #7C3BED, #EE4F84, #FA9938, #7C3BED);
  background-size: 300% 300%;
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent; color: transparent;
  animation: grad-shift 6s ease-in-out infinite;
}
@keyframes grad-shift { 0%,100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }

.wrap { max-width: 1080px; margin: 0 auto; padding: 0 28px; }

.kicker {
  font-size: 11px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase;
  color: var(--primary);
  display: block;
}
.section { padding: 104px 0 12px; }
.section .wrap { border-top: 1px solid var(--border-strong); padding-top: 34px; }
.section .kicker { counter-increment: section; }
.section .kicker::before { content: counter(section, decimal-leading-zero) " — "; color: var(--muted); font-weight: 500; }
.section h2 { font-size: 33px; line-height: 1.16; max-width: 720px; margin: 16px 0 0; }
.section-lead { color: var(--body-c); font-size: 16.5px; line-height: 1.65; max-width: 640px; margin: 16px 0 0; }
@media (max-width: 720px) { .section { padding: 68px 0 8px; } .section h2 { font-size: 26px; } }

/* TOP PERSONALIZED BANNER */
.banner { background: var(--ink); color: rgba(255,255,255,0.92); }
.banner-inner {
  max-width: 1080px; margin: 0 auto; padding: 10px 28px;
  font-size: 12.5px; letter-spacing: 0.02em;
}
.banner-inner .lab {
  color: transparent; background: var(--grad);
  -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
  margin-right: 12px; text-transform: uppercase; letter-spacing: 0.14em; font-size: 10.5px; font-weight: 700;
}

/* HEADER */
.header { border-bottom: 1px solid var(--border); background: rgba(246,245,250,0.9); backdrop-filter: blur(10px); position: sticky; top: 0; z-index: 50; }
.header-inner {
  max-width: 1080px; margin: 0 auto;
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 28px;
}
.brand-lockup {
  font-family: 'Orbitron', 'Space Grotesk', sans-serif;
  font-size: 15px; font-weight: 700; letter-spacing: 0.12em; color: var(--ink);
}
.brand-lockup .aiera {
  background: var(--grad);
  -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
}
.brand-lockup .sep { color: var(--muted); margin: 0 10px; font-weight: 400; font-family: 'DM Sans', sans-serif; }
.brand-lockup .target { font-family: 'Space Grotesk', sans-serif; letter-spacing: 0.04em; font-size: 13.5px; color: var(--ink-soft); }

/* BUTTONS */
.btn {
  display: inline-block;
  padding: 13px 28px;
  font-size: 14.5px; font-weight: 600; font-family: 'DM Sans', sans-serif;
  border-radius: 999px; border: 1px solid transparent;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
}
.btn-primary {
  background: var(--grad); background-size: 200% 200%;
  color: #fff;
  box-shadow: 0 8px 24px -10px rgba(124, 59, 237, 0.55);
}
.btn-primary:hover { transform: translateY(-1px); box-shadow: 0 12px 28px -10px rgba(238, 79, 132, 0.55); }
.header-link { font-size: 13.5px; font-weight: 700; color: var(--primary); }
.header-link:hover { color: var(--secondary); }

/* HERO */
.hero { padding: 92px 0 100px; position: relative; overflow: hidden; }
.hero::before {
  content: ''; position: absolute; top: -180px; right: -140px; width: 520px; height: 520px;
  background: radial-gradient(circle, rgba(124,59,237,0.14), transparent 65%);
  pointer-events: none;
}
.hero::after {
  content: ''; position: absolute; bottom: -220px; left: -160px; width: 560px; height: 560px;
  background: radial-gradient(circle, rgba(238,79,132,0.10), transparent 65%);
  pointer-events: none;
}
.hero-grid { position: relative; display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 56px; align-items: start; z-index: 1; }
@media (max-width: 920px) { .hero-grid { grid-template-columns: 1fr; gap: 44px; } }
.hero-kicker {
  font-size: 11px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: var(--muted);
}
.hero-kicker .accent { color: var(--primary); }
.hero h1 { font-size: 54px; line-height: 1.06; letter-spacing: -0.025em; margin-top: 22px; }
.hero h1 .brand-line {
  background: linear-gradient(135deg, #7C3BED, #EE4F84, #FA9938, #7C3BED);
  background-size: 300% 300%;
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent; color: transparent;
  animation: grad-shift 6s ease-in-out infinite;
}
@media (max-width: 720px) { .hero h1 { font-size: 36px; } }
.hero-lead { color: var(--body-c); font-size: 17.5px; line-height: 1.65; max-width: 520px; margin-top: 22px; }
.hero-cta-row { display: flex; align-items: center; gap: 26px; margin-top: 40px; flex-wrap: wrap; }
.hero-scroll { font-size: 14px; font-weight: 600; color: var(--ink-soft); }
.hero-scroll:hover { color: var(--primary); }
.hero-trust { margin-top: 38px; font-size: 13px; font-weight: 500; letter-spacing: 0.01em; color: var(--muted); }
.hero-trust .sep { margin: 0 12px; color: var(--border-strong); }

/* HERO EXAMPLE CARD (ilustrativni primer) */
.example-card {
  background: var(--surface); border: 1px solid var(--border); border-radius: 20px;
  box-shadow: 0 24px 48px -28px rgba(20, 18, 31, 0.25);
  overflow: hidden;
}
.example-head {
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px 20px; border-bottom: 1px solid var(--border);
  font-size: 10.5px; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 700; color: var(--muted);
}
.example-head .t { color: var(--ink-soft); }
.example-body { padding: 22px; }
.example-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 18px; }
.example-stat { background: var(--paper); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; }
.example-stat .lab { font-size: 9.5px; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 700; color: var(--muted); }
.example-stat .num { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 24px; color: var(--ink); margin-top: 4px; }
.example-stat .num small { font-size: 12px; color: var(--secondary); font-weight: 700; margin-left: 4px; }
.example-q { font-size: 14px; color: var(--ink-soft); padding: 12px 16px; background: var(--paper); border: 1px solid var(--border); border-radius: 14px; }
.example-q::before { content: 'V: '; font-weight: 700; color: var(--muted); }
.example-a { font-size: 14px; color: var(--ink); padding: 12px 16px; margin-top: 10px; background: var(--primary-soft); border-radius: 14px; }
.example-a::before { content: 'AI: '; font-weight: 700; color: var(--primary); }
.example-a strong { color: var(--primary); font-weight: 700; }
.example-src { margin-top: 14px; font-size: 11.5px; color: var(--muted); }

/* REFERENCES */
.refs { border-top: 1px solid var(--border); padding: 30px 0; background: var(--surface); }
.refs-inner { display: flex; align-items: baseline; gap: 28px; flex-wrap: wrap; }
.refs-label { font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; font-weight: 700; color: var(--muted); }
.refs-list { display: flex; gap: 28px; flex-wrap: wrap; align-items: baseline; }
.ref-name { font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 15px; color: var(--ink-soft); }

/* KONTEKST CARDS */
.cards-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 48px; }
@media (max-width: 720px) { .cards-grid { grid-template-columns: 1fr; } }
.card {
  background: var(--surface); border: 1px solid var(--border); border-radius: 16px;
  padding: 26px 28px 28px;
}
.card h3 { font-size: 16px; font-weight: 600; margin-bottom: 8px; line-height: 1.35; }
.card p { color: var(--body-c); font-size: 14px; line-height: 1.55; }

/* AI STACK */
.stack-row { margin-top: 36px; display: flex; flex-wrap: wrap; gap: 10px; }
.stack-chip {
  background: var(--surface); border: 1px solid var(--border); border-radius: 999px;
  padding: 8px 18px; font-size: 13px; font-weight: 500; color: var(--ink-soft);
}

/* REŠITVE - numbered list */
.modules-list { margin-top: 48px; display: grid; gap: 18px; }
.module {
  display: grid; grid-template-columns: 72px 1fr; gap: 28px;
  background: var(--surface); border: 1px solid var(--border); border-radius: 18px;
  padding: 34px 38px;
}
@media (max-width: 720px) { .module { grid-template-columns: 1fr; gap: 10px; padding: 24px; } }
.module-num {
  font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 30px; line-height: 1;
  background: var(--grad);
  -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
}
.module h3 { font-size: 20px; font-weight: 600; margin-bottom: 10px; }
.module p { color: var(--body-c); font-size: 14.5px; line-height: 1.6; max-width: 640px; }
.module-example { margin-top: 16px; padding: 12px 18px; border-left: 3px solid var(--primary); background: var(--primary-soft); border-radius: 0 12px 12px 0; }
.module-example .lab { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 700; color: var(--primary); margin-bottom: 6px; }
.module-example .quote { font-family: 'Instrument Serif', Georgia, serif; font-style: italic; font-size: 15.5px; color: var(--ink-soft); line-height: 1.5; max-width: 580px; }

/* ARHITEKTURA */
.arch-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 48px; align-items: start; }
@media (max-width: 880px) { .arch-grid { grid-template-columns: 1fr; } }
.arch-text { color: var(--body-c); font-size: 15.5px; line-height: 1.65; }
.arch-text p + p { margin-top: 16px; }
.arch-stack { background: var(--surface); border: 1px solid var(--border); border-radius: 18px; overflow: hidden; }
.arch-row { display: flex; align-items: center; gap: 16px; padding: 16px 22px; border-top: 1px solid var(--border); }
.arch-row:first-child { border-top: 0; }
.arch-row.brand { background: var(--primary-soft); }
.arch-row .ic { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 12px; color: var(--muted); width: 22px; flex-shrink: 0; }
.arch-row .lab { font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 700; color: var(--muted); display: block; }
.arch-row .val { font-family: 'Space Grotesk', sans-serif; font-size: 14px; font-weight: 600; color: var(--ink); }
.arch-row.brand .val { color: var(--primary); }

/* PERSONA SPOTLIGHT */
.spotlight {
  margin-top: 48px; padding: 44px 48px;
  background: var(--surface); border: 1px solid var(--border); border-radius: 20px;
  position: relative; overflow: hidden;
  display: grid; grid-template-columns: 1fr 1fr; gap: 44px;
}
.spotlight::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--grad); }
@media (max-width: 880px) { .spotlight { grid-template-columns: 1fr; padding: 28px 24px; } }
.spotlight-left h3 { font-size: 25px; line-height: 1.2; margin: 14px 0 16px; }
.spotlight-left h3 .serif-accent { font-size: 1.05em; }
.spotlight-left p { color: var(--body-c); font-size: 15.5px; line-height: 1.6; }
.spotlight-right { display: grid; gap: 13px; align-content: start; }
.bullet { display: grid; grid-template-columns: 18px 1fr; gap: 12px; font-size: 14.5px; color: var(--ink-soft); line-height: 1.5; }
.bullet .ic { color: var(--secondary); font-weight: 700; }

/* BENEFITS */
.benefits-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 48px; }
@media (max-width: 880px) { .benefits-grid { grid-template-columns: 1fr; } }
.benefit-col { background: var(--surface); border: 1px solid var(--border); border-radius: 18px; padding: 32px 36px; }
.benefit-col .lab { font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; font-weight: 700; color: var(--primary); margin-bottom: 16px; }
.benefit-col h4 { font-size: 20px; font-weight: 600; line-height: 1.3; margin-bottom: 16px; }
.benefit-list { display: grid; gap: 10px; }
.benefit-list .item { display: grid; grid-template-columns: 18px 1fr; gap: 12px; font-size: 14px; color: var(--ink-soft); line-height: 1.5; }
.benefit-list .item .ic { color: var(--secondary); font-weight: 700; }

/* VARNOST checklist */
.safety-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 48px; margin-top: 44px; max-width: 840px; }
@media (max-width: 720px) { .safety-grid { grid-template-columns: 1fr; } }
.safety-grid .item {
  display: grid; grid-template-columns: 18px 1fr; gap: 12px;
  font-size: 14.5px; color: var(--ink-soft); line-height: 1.5;
  padding: 12px 0; border-bottom: 1px solid var(--border);
}
.safety-grid .item .ic { color: var(--primary); font-weight: 700; }

/* VARNOST PODATKI */
.text-block { max-width: 680px; margin: 36px 0 0; color: var(--body-c); font-size: 16px; line-height: 1.68; }
.text-block p + p { margin-top: 18px; }

/* FAQ */
.faq-list { max-width: 780px; margin: 44px 0 0; }
.faq-item { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; margin-bottom: 10px; }
.faq-item summary {
  list-style: none; cursor: pointer;
  display: flex; align-items: baseline; justify-content: space-between; gap: 18px;
  padding: 20px 24px;
  font-family: 'Space Grotesk', sans-serif;
  font-size: 15.5px; font-weight: 600; color: var(--ink);
}
.faq-item summary::-webkit-details-marker { display: none; }
.faq-item summary::after { content: '+'; font-size: 20px; font-weight: 400; color: var(--primary); width: 22px; text-align: center; flex-shrink: 0; }
.faq-item[open] summary::after { content: '−'; }
.faq-item .answer { padding: 0 24px 22px; color: var(--body-c); font-size: 14.5px; line-height: 1.65; max-width: 660px; }

/* FINAL CTA */
.cta-final { margin-top: 104px; background: var(--ink); color: #fff; padding: 96px 0 100px; position: relative; overflow: hidden; }
.cta-final::before {
  content: ''; position: absolute; top: -240px; left: 50%; transform: translateX(-50%);
  width: 720px; height: 720px;
  background: radial-gradient(circle, rgba(124,59,237,0.35), rgba(238,79,132,0.12) 55%, transparent 75%);
  pointer-events: none;
}
.cta-final-inner { position: relative; max-width: 1080px; margin: 0 auto; padding: 0 28px; }
.cta-final .kicker { color: var(--accent-o); }
.cta-final h2 { font-size: 40px; line-height: 1.12; color: #fff; max-width: 660px; margin-top: 16px; }
@media (max-width: 720px) { .cta-final h2 { font-size: 28px; } }
.cta-final p { color: rgba(255,255,255,0.75); font-size: 16.5px; line-height: 1.6; margin-top: 20px; max-width: 560px; }
.cta-final .btn { margin-top: 40px; }
.cta-final-contact {
  margin-top: 40px; padding-top: 24px; border-top: 1px solid rgba(255,255,255,0.14);
  font-size: 13px; color: rgba(255,255,255,0.6);
  display: flex; gap: 26px; flex-wrap: wrap;
}
.cta-final-contact a { color: rgba(255,255,255,0.88); }
.cta-final-contact a:hover { color: #fff; }

/* FOOTER */
.footer { padding: 0 0 36px; background: var(--ink); }
.footer-inner {
  max-width: 1080px; margin: 0 auto; padding: 22px 28px 0;
  display: flex; align-items: baseline; justify-content: space-between; gap: 18px; flex-wrap: wrap;
  font-size: 12px; color: rgba(255,255,255,0.45);
  border-top: 1px solid rgba(255,255,255,0.1);
}
.footer-inner a { color: rgba(255,255,255,0.7); }
.footer-inner a:hover { color: #fff; }
`;
}

// ─── SECTION RENDERERS ────────────────────────────────────────────────────────

function renderBanner(meta, content) {
  // Prefer the LLM-corrected banner line (proper diacritics + Slovene role title);
  // fall back to the mechanically built one.
  const line = (content && content.recipientBanner) || meta.recipientFull;
  return `<div class="banner">
  <div class="banner-inner"><span class="lab">Zasebni predlog</span>${esc(line)}</div>
</div>`;
}

function renderHeader(meta) {
  return `<header class="header">
  <div class="header-inner">
    <div class="brand-lockup"><span class="aiera">AIERA</span><span class="sep">×</span><span class="target">${esc(meta.companyDisplay)}</span></div>
    <a href="${esc(meta.calendlyUrl)}" target="_blank" rel="noopener" class="header-link">Rezervirajte pogovor</a>
  </div>
</header>`;
}

function renderHero(content, meta) {
  const trust = (content.heroTrust || []).slice(0, 3);
  return `<section class="hero">
  <div class="wrap hero-grid">
    <div>
      <span class="hero-kicker"><span class="accent">Predlog sodelovanja</span> · ${todayUpper()}</span>
      <h1>${esc(content.heroTitleTop)}<br><span class="brand-line">${esc(content.heroTitleBottom)}</span></h1>
      <p class="hero-lead">${esc(content.heroLead)}</p>
      <div class="hero-cta-row">
        <a href="${esc(meta.calendlyUrl)}" target="_blank" rel="noopener" class="btn btn-primary">Rezervirajte 15-minutni pogovor</a>
        <a href="#resitve" class="hero-scroll">Preberite predlog ↓</a>
      </div>
      ${trust.length ? `<div class="hero-trust">${trust.map(t => esc(t)).join('<span class="sep">·</span>')}</div>` : ''}
    </div>
    <div>
      ${renderHeroExample(content, meta)}
    </div>
  </div>
</section>`;
}

function renderHeroExample(content, meta) {
  const stats = (content.widgetStats || []).slice(0, 3);
  const chatPrompt = content.widgetChatPrompt || 'Pripravi povzetek za vodstvo.';
  const chatAnswer = content.widgetChatAnswer || 'Pripravljen. Glavna ugotovitev v 2 stavkih.';
  const sources = content.widgetSources || ['CRM', 'Dokumenti'];
  const widgetTitle = content.widgetTitle || `${meta.companyDisplay} pregled`;

  return `<div class="example-card">
    <div class="example-head">
      <span class="t">${esc(widgetTitle)}</span>
      <span>ilustrativni prikaz</span>
    </div>
    <div class="example-body">
      ${stats.length ? `<div class="example-stats">
        ${stats.map(s => `<div class="example-stat">
          <div class="lab">${esc(s.label)}</div>
          <div class="num">${esc(s.value)}${s.delta ? `<small>${esc(s.delta)}</small>` : ''}</div>
        </div>`).join('')}
      </div>` : ''}
      <div class="example-q">${esc(chatPrompt)}</div>
      <div class="example-a">${chatAnswer ? esc(chatAnswer).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') : ''}</div>
      <div class="example-src">Viri: ${sources.map(esc).join(' · ')}</div>
    </div>
  </div>`;
}

function renderReferences(content) {
  // Only CONFIRMED clients here. Env OFFER_REFERENCES (comma-separated) overrides;
  // an explicitly empty env value hides the whole strip. Never invent names.
  let refs;
  if (process.env.OFFER_REFERENCES !== undefined) {
    refs = process.env.OFFER_REFERENCES.split(',').map(s => s.trim()).filter(Boolean);
  } else {
    refs = ['Munchies', 'Valtheron', 'B2Booster', 'RedEyeMonkey'];
  }
  if (!refs.length) return '';
  return `<section class="refs">
  <div class="wrap refs-inner">
    <div class="refs-label">Izbrane stranke AIERA</div>
    <div class="refs-list">
      ${refs.map(r => `<span class="ref-name">${esc(r)}</span>`).join('')}
    </div>
  </div>
</section>`;
}

function renderKontekst(content) {
  const cards = content.kontekstCards || [];
  return `<section class="section">
  <div class="wrap">
    <span class="kicker">${esc(content.kontekstEyebrow || 'Kontekst')}</span>
    <h2>${esc(content.kontekstTitle)}</h2>
    <p class="section-lead">${esc(content.kontekstLead)}</p>
    <div class="cards-grid">
      ${cards.slice(0, 4).map(c => `<div class="card">
        <h3>${esc(c.title)}</h3>
        <p>${esc(c.body)}</p>
      </div>`).join('')}
    </div>
  </div>
</section>`;
}

function renderAiStack(content) {
  const items = content.aiStackTools || ['Claude', 'OpenAI', 'Gemini', 'n8n', 'Make', 'Airtable'];
  return `<section class="section">
  <div class="wrap">
    <span class="kicker">Orodja</span>
    <h2>Preverjeni gradniki, pravilno sestavljeni</h2>
    <p class="section-lead">Ne uvajamo eksperimentalnih orodij. Gradimo z modeli in platformami, ki so dokazano stabilne za poslovno rabo.</p>
    <div class="stack-row">
      ${items.map(t => `<span class="stack-chip">${esc(t)}</span>`).join('')}
    </div>
  </div>
</section>`;
}

function renderResitve(content) {
  const modules = content.resitveModules || [];
  return `<section class="section" id="resitve">
  <div class="wrap">
    <span class="kicker">${esc(content.resitveEyebrow || 'Možnosti')}</span>
    <h2>${esc(content.resitveTitle)}</h2>
    ${content.resitveLead ? `<p class="section-lead">${esc(content.resitveLead)}</p>` : ''}
    <div class="modules-list">
      ${modules.slice(0, 5).map((m, i) => `<div class="module">
        <div class="module-num">0${i + 1}</div>
        <div>
          <h3>${esc(m.title)}</h3>
          <p>${esc(m.body)}</p>
          ${m.example ? `<div class="module-example">
            <div class="lab">Primer uporabe</div>
            <div class="quote">${esc(m.example)}</div>
          </div>` : ''}
        </div>
      </div>`).join('')}
    </div>
  </div>
</section>`;
}

function renderArhitektura(content) {
  const layers = content.arhitekturaLayers || [];
  return `<section class="section">
  <div class="wrap">
    <span class="kicker">Arhitektura</span>
    <h2>${esc(content.arhitekturaTitle)}</h2>
    <p class="section-lead">${esc(content.arhitekturaLead)}</p>
    <div class="arch-grid">
      <div class="arch-text">
        ${(content.arhitekturaParagraphs || []).map(p => `<p>${esc(p)}</p>`).join('')}
      </div>
      <div class="arch-stack">
        ${layers.slice(0, 5).map((l, i) => `<div class="arch-row${l.brand ? ' brand' : ''}">
          <span class="ic">0${i + 1}</span>
          <div><span class="lab">${esc(l.label)}</span><div class="val">${esc(l.value)}</div></div>
        </div>`).join('')}
      </div>
    </div>
  </div>
</section>`;
}

function renderPersonaSpotlight(content, persona) {
  const bullets = content.spotlightBullets || [];
  return `<section class="section">
  <div class="wrap">
    <div class="spotlight">
      <div class="spotlight-left">
        <span class="kicker">${esc(persona.spotlight.label)}</span>
        <h3>${esc(content.spotlightTitle || persona.spotlight.title)}</h3>
        <p>${esc(content.spotlightBody)}</p>
      </div>
      <div class="spotlight-right">
        ${bullets.slice(0, 5).map(b => `<div class="bullet"><span class="ic">✓</span><span>${esc(b)}</span></div>`).join('')}
      </div>
    </div>
  </div>
</section>`;
}

function renderBenefits(content) {
  const left = content.benefitsLeft || { title: '', label: 'Za zaposlene', items: [] };
  const right = content.benefitsRight || { title: '', label: 'Za vodstvo', items: [] };
  return `<section class="section">
  <div class="wrap">
    <span class="kicker">Vpliv</span>
    <h2>${esc(content.benefitsTitle)}</h2>
    <div class="benefits-grid">
      <div class="benefit-col">
        <div class="lab">${esc(left.label)}</div>
        <h4>${esc(left.title)}</h4>
        <div class="benefit-list">
          ${(left.items || []).slice(0, 5).map(i => `<div class="item"><span class="ic">✓</span><span>${esc(i)}</span></div>`).join('')}
        </div>
      </div>
      <div class="benefit-col">
        <div class="lab">${esc(right.label)}</div>
        <h4>${esc(right.title)}</h4>
        <div class="benefit-list">
          ${(right.items || []).slice(0, 5).map(i => `<div class="item"><span class="ic">✓</span><span>${esc(i)}</span></div>`).join('')}
        </div>
      </div>
    </div>
  </div>
</section>`;
}

function renderVarnostKratko(content) {
  const items = content.varnostKratkoItems || [];
  return `<section class="section">
  <div class="wrap">
    <span class="kicker">Varnost in omejitve</span>
    <h2>${esc(content.varnostKratkoTitle || 'AI naj pomaga, ne odloča namesto ljudi')}</h2>
    <p class="section-lead">${esc(content.varnostKratkoLead)}</p>
    <div class="safety-grid">
      ${items.slice(0, 6).map(i => `<div class="item"><span class="ic">✓</span><span>${esc(i)}</span></div>`).join('')}
    </div>
  </div>
</section>`;
}

function renderVarnostPodatki(content) {
  return `<section class="section">
  <div class="wrap">
    <span class="kicker">Podatki in arhitektura</span>
    <h2>${esc(content.varnostPodatkiTitle)}</h2>
    <div class="text-block">
      ${(content.varnostPodatkiParagraphs || []).map(p => `<p>${esc(p)}</p>`).join('')}
    </div>
  </div>
</section>`;
}

function renderFaq(content) {
  const items = content.faqItems || [];
  return `<section class="section">
  <div class="wrap">
    <span class="kicker">Vprašanja</span>
    <h2>${esc(content.faqTitle || 'Pogosta vprašanja')}</h2>
    <div class="faq-list">
      ${items.slice(0, 7).map(q => `<details class="faq-item">
        <summary>${esc(q.q)}</summary>
        <div class="answer">${esc(q.a)}</div>
      </details>`).join('')}
    </div>
  </div>
</section>`;
}

function renderCtaFinal(content, meta, persona) {
  const personaCta = persona.cta.replace('{company}', meta.companyDisplay);
  return `<section class="cta-final">
  <div class="cta-final-inner">
    <span class="kicker">Naslednji korak</span>
    <h2>${esc(content.ctaFinalTitle || personaCta)}</h2>
    <p>${esc(content.ctaFinalBody)}</p>
    <a href="${esc(meta.calendlyUrl)}" target="_blank" rel="noopener" class="btn btn-primary">Rezervirajte 15-minutni pogovor</a>
    <div class="cta-final-contact">
      <span>Žan Bagarič · CEO AIERA</span>
      <a href="mailto:zan@aiera.si">zan@aiera.si</a>
      <a href="tel:+38640708327">+386 40 708 327</a>
    </div>
  </div>
</section>`;
}

function renderFooter() {
  return `<footer class="footer">
  <div class="footer-inner">
    <span>© ${new Date().getFullYear()} AIERA d.o.o. · Predlog je pripravljen izključno za naslovnika.</span>
    <span><a href="https://aiera.si" target="_blank" rel="noopener">aiera.si</a></span>
  </div>
</footer>`;
}

// ─── DISPATCHER ───────────────────────────────────────────────────────────────
// 'pilot' and 'pristop' intentionally removed: the page must not prescribe a
// pilot or lecture about "our approach" - we do not know the lead's priorities.
// Unknown section IDs from stale persona overrides render as empty string.

const RENDERERS = {
  hero: renderHero,
  references: renderReferences,
  kontekst: renderKontekst,
  aiStack: renderAiStack,
  resitve: renderResitve,
  arhitektura: renderArhitektura,
  personaSpotlight: renderPersonaSpotlight,
  benefits: renderBenefits,
  varnostKratko: renderVarnostKratko,
  varnostPodatki: renderVarnostPodatki,
  faq: renderFaq,
  ctaFinal: renderCtaFinal,
  footer: renderFooter,
};

// ─── TRACKING PIXEL ───────────────────────────────────────────────────────────

function renderTrackingPixel(meta) {
  // Endpoint resolves from data-pixel-url attr; defaults to same-origin /pixel/:slug.
  // If proposal hosted on Netlify and bot on Render, use absolute Render URL.
  const endpoint = meta.pixelEndpoint || `${process.env.SERVER_URL || ''}/pixel/${meta.slug}`;
  return `<script>
(function(){
  var endpoint = ${JSON.stringify(endpoint)};
  var slug = ${JSON.stringify(meta.slug)};
  var started = Date.now();
  var lastBeat = started;
  var maxScroll = 0;
  var scrollFired = {};
  var visible = !document.hidden;
  var totalActive = 0;
  function send(event, value){
    try {
      var payload = JSON.stringify({ event: event, value: value, slug: slug, ts: Date.now() });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(endpoint, new Blob([payload], { type: 'application/json' }));
      } else {
        fetch(endpoint, { method: 'POST', headers: {'Content-Type':'application/json'}, body: payload, keepalive: true }).catch(function(){});
      }
    } catch(e){}
  }
  function pct(){
    var h = document.documentElement;
    var b = document.body;
    var st = h.scrollTop || b.scrollTop || 0;
    var sh = h.scrollHeight || b.scrollHeight || 1;
    var ch = h.clientHeight || 1;
    if (sh <= ch) return 100;
    return Math.min(100, Math.round((st + ch) / sh * 100));
  }
  send('page_view', null);
  document.addEventListener('scroll', function(){
    var p = pct();
    if (p > maxScroll) maxScroll = p;
    [25,50,75,100].forEach(function(t){
      if (p >= t && !scrollFired[t]) {
        scrollFired[t] = true;
        send('scroll_' + t, t);
      }
    });
  }, { passive: true });
  document.addEventListener('click', function(e){
    var a = e.target && e.target.closest && e.target.closest('a');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (/calendly\\.com/i.test(href)) {
      send('calendly_click', href);
      send('cta_click', href);
    } else if (a.className && (a.className.indexOf('btn-primary') > -1 || a.className.indexOf('header-link') > -1)) {
      send('cta_click', href);
    }
  }, true);
  function heartbeat(){
    if (visible) {
      var now = Date.now();
      totalActive += (now - lastBeat);
      lastBeat = now;
      send('heartbeat', { secs: Math.round(totalActive / 1000), maxScroll: maxScroll });
    } else {
      lastBeat = Date.now();
    }
  }
  document.addEventListener('visibilitychange', function(){
    if (document.hidden) {
      if (visible) { totalActive += (Date.now() - lastBeat); }
      visible = false;
    } else {
      visible = true;
      lastBeat = Date.now();
    }
  });
  setInterval(heartbeat, 30000);
  window.addEventListener('beforeunload', function(){
    if (visible) totalActive += (Date.now() - lastBeat);
    send('unload', { secs: Math.round(totalActive / 1000), maxScroll: maxScroll });
  });

  // Exit-intent: mouse leaves viewport via top edge. One-shot.
  var exitFired = false;
  document.addEventListener('mouseleave', function(e){
    if (exitFired || e.clientY > 5) return;
    exitFired = true;
    send('exit_intent', { maxScroll: maxScroll, secs: Math.round(totalActive / 1000) });
  });

  // Pricing section dwell tracking (any element with .pricing, .price, [data-pricing])
  var pricingEl = document.querySelector('[data-pricing], .pricing, .price-block, .pricing-section');
  if (pricingEl && 'IntersectionObserver' in window) {
    var pEnter = null, pTotal = 0, pShortFired = false, pLongFired = false;
    var pio = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if (en.intersectionRatio > 0.5) {
          if (!pEnter) pEnter = Date.now();
        } else if (pEnter) {
          pTotal += Date.now() - pEnter;
          pEnter = null;
        }
        var live = pTotal + (pEnter ? (Date.now() - pEnter) : 0);
        if (!pShortFired && live > 15000) { pShortFired = true; send('pricing_dwell', { ms: live, bucket: 'short_15s' }); }
        if (!pLongFired && live > 45000) { pLongFired = true; send('pricing_dwell', { ms: live, bucket: 'long_45s' }); }
      });
    }, { threshold: [0, 0.5, 1] });
    pio.observe(pricingEl);
  }
})();
</script>`;
}

// ─── PUBLIC: renderPage ───────────────────────────────────────────────────────

function renderPage({ persona, theme: themeName, content, meta }) {
  const theme = getTheme(themeName);
  const sectionList = persona.sections.filter(s => s !== 'footer');

  const sectionsHtml = sectionList
    .map(sectionId => {
      const fn = RENDERERS[sectionId];
      if (!fn) return '';
      // Some sections need extra context (persona)
      if (sectionId === 'personaSpotlight') return fn(content, persona);
      if (sectionId === 'ctaFinal') return fn(content, meta, persona);
      if (sectionId === 'hero') return fn(content, meta);
      return fn(content);
    })
    .join('\n');

  const title = content.metaTitle || `${meta.companyDisplay} — AI predlog · AIERA`;
  const description = content.metaDescription || `Personaliziran AI predlog za ${meta.companyDisplay}. Pripravil Žan Bagarič, CEO AIERA.`;

  return `<!DOCTYPE html>
<html lang="sl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:type" content="website">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&family=Orbitron:wght@500;600;700&display=swap" rel="stylesheet">
  <style>${baseStyles(theme)}</style>
</head>
<body>
${renderBanner(meta, content)}
${renderHeader(meta)}
${sectionsHtml}
${renderFooter()}
${meta.disablePixel ? '' : renderTrackingPixel(meta)}
</body>
</html>`;
}

module.exports = { renderPage };
