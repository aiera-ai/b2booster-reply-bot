// Deterministic HTML template for personalized AIERA proposals.
// Design is fixed. Only content slots vary. This is how we keep quality consistent.

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
  return `
:root {
  --brand: ${theme.brand};
  --brand-soft: ${theme.brandSoft};
  --brand-dark: ${theme.brandDark};
  --brand-rgba: ${theme.brandRgba};
  --accent-line: ${theme.accentLine};
  --ink: ${theme.ink};
  --ink-soft: ${theme.inkSoft};
  --body: ${theme.body};
  --muted: ${theme.muted};
  --paper: ${theme.paper};
  --paper-soft: ${theme.paperSoft};
  --paper-bg: ${theme.paperBg};
  --border: ${theme.border};
  --border-strong: ${theme.borderStrong};
}
*, *::before, *::after { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
  background: var(--paper-bg);
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-feature-settings: 'ss01' on, 'cv11' on;
  line-height: 1.55;
}
h1, h2, h3, h4 {
  font-family: 'Space Grotesk', system-ui, sans-serif;
  letter-spacing: -0.02em;
  color: var(--ink);
  margin: 0;
}
p { margin: 0; }
a { color: inherit; text-decoration: none; }

.wrap { max-width: 1180px; margin: 0 auto; padding: 0 28px; }
.wrap-narrow { max-width: 880px; margin: 0 auto; padding: 0 28px; }
.eyebrow {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 11px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--brand-dark); background: var(--brand-soft);
  padding: 7px 14px; border-radius: 999px;
  font-family: 'DM Sans', sans-serif;
}
.eyebrow-dot::before {
  content: ''; width: 6px; height: 6px; border-radius: 999px; background: var(--brand);
  display: inline-block;
}
.section { padding: 96px 0; border-top: 1px solid var(--border); }
.section--first { padding-top: 0; border-top: 0; }
.section h2 { font-size: 40px; font-weight: 700; line-height: 1.1; max-width: 860px; margin: 16px auto 0; text-align: center; }
.section-lead { color: var(--body); font-size: 17px; max-width: 760px; margin: 20px auto 0; text-align: center; }
.center { text-align: center; }

/* TOP PERSONALIZED BANNER */
.banner {
  background: var(--ink);
  color: rgba(255,255,255,0.92);
  font-size: 13px;
  padding: 10px 28px;
  text-align: center;
  letter-spacing: 0.01em;
}
.banner-icon { opacity: 0.6; margin-right: 8px; }

/* STICKY HEADER */
.header {
  position: sticky; top: 0; z-index: 50;
  background: rgba(255,255,255,0.85);
  backdrop-filter: saturate(180%) blur(14px);
  -webkit-backdrop-filter: saturate(180%) blur(14px);
  border-bottom: 1px solid var(--border);
}
.header-inner {
  max-width: 1180px; margin: 0 auto;
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 28px;
}
.brand-lockup { display: flex; align-items: center; gap: 14px; font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 17px; color: var(--ink); letter-spacing: 0.02em; }
.brand-lockup .aiera { color: var(--brand); }
.brand-lockup .sep { color: var(--muted); font-weight: 500; }
.brand-lockup .target { color: var(--ink); }
.btn {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 11px 22px; font-size: 14px; font-weight: 600;
  border-radius: 999px; border: 1px solid transparent;
  font-family: 'DM Sans', sans-serif;
  transition: transform 0.12s ease, box-shadow 0.12s ease, background 0.12s ease;
  cursor: pointer;
}
.btn:hover { transform: translateY(-1px); }
.btn-primary { background: var(--brand); color: #fff; }
.btn-primary:hover { background: var(--brand-dark); box-shadow: 0 8px 24px var(--brand-rgba); }
.btn-ghost { background: transparent; color: var(--ink); border-color: var(--border-strong); }
.btn-ghost:hover { background: var(--paper-soft); }
.btn-arrow::after { content: '→'; font-size: 16px; line-height: 1; }

/* HERO */
.hero { padding: 88px 0 64px; background: var(--paper-bg); position: relative; overflow: hidden; }
.hero::before {
  content: ''; position: absolute; inset: 0;
  background-image: radial-gradient(var(--border) 1px, transparent 1px);
  background-size: 28px 28px; opacity: 0.35; mask-image: linear-gradient(180deg, #000 0%, transparent 75%);
  pointer-events: none;
}
.hero-grid { position: relative; display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 64px; align-items: center; }
@media (max-width: 960px) { .hero-grid { grid-template-columns: 1fr; gap: 40px; } }
.hero h1 { font-size: 64px; font-weight: 700; line-height: 1.02; letter-spacing: -0.025em; margin-top: 24px; }
.hero h1 .brand-line { color: var(--brand); }
@media (max-width: 720px) { .hero h1 { font-size: 44px; } }
.hero-lead { color: var(--body); font-size: 18px; line-height: 1.55; max-width: 540px; margin-top: 22px; }
.hero-cta-row { display: flex; align-items: center; gap: 18px; margin-top: 32px; flex-wrap: wrap; }
.hero-trust { display: flex; gap: 24px; flex-wrap: wrap; margin-top: 36px; font-size: 13px; color: var(--muted); }
.hero-trust .item { display: inline-flex; align-items: center; gap: 8px; }
.hero-trust .dot { width: 14px; height: 14px; border-radius: 999px; background: var(--brand-soft); color: var(--brand); display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; }

/* HERO MOCK WIDGET */
.widget {
  background: var(--paper); border: 1px solid var(--border-strong);
  border-radius: 18px; padding: 0; box-shadow: 0 24px 48px -24px rgba(15, 23, 42, 0.18), 0 12px 24px -12px rgba(15, 23, 42, 0.08);
  position: relative; overflow: hidden;
}
.widget-bar { display: flex; align-items: center; gap: 8px; padding: 14px 18px; border-bottom: 1px solid var(--border); background: var(--paper-soft); font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 12px; color: var(--muted); }
.widget-bar .dots { display: flex; gap: 6px; }
.widget-bar .dots span { width: 10px; height: 10px; border-radius: 999px; }
.widget-bar .dots span:nth-child(1) { background: #FCA5A5; }
.widget-bar .dots span:nth-child(2) { background: #FCD34D; }
.widget-bar .dots span:nth-child(3) { background: #86EFAC; }
.widget-bar .url { background: var(--paper-bg); padding: 4px 10px; border-radius: 6px; color: var(--body); }
.widget-bar .live { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; color: #16A34A; font-weight: 600; }
.widget-bar .live::before { content: ''; width: 7px; height: 7px; border-radius: 999px; background: #22C55E; box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.18); }
.widget-body { padding: 22px 22px 24px; }
.widget-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
.widget-title { font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 15px; color: var(--ink); }
.widget-tag { font-size: 11px; color: var(--muted); font-family: 'JetBrains Mono', monospace; }
.widget-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 18px; }
.stat-card { background: var(--paper-soft); border: 1px solid var(--border); border-radius: 12px; padding: 14px 14px; }
.stat-label { font-size: 10px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); }
.stat-num { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 26px; color: var(--ink); margin-top: 6px; display: flex; align-items: baseline; gap: 6px; }
.stat-delta { font-size: 12px; color: var(--brand); font-weight: 600; }
.activity { background: var(--paper-soft); border: 1px solid var(--border); border-radius: 12px; padding: 14px 14px 8px; }
.activity-head { display: flex; justify-content: space-between; align-items: center; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
.activity-spark { width: 100%; height: 38px; margin-top: 6px; }
.chat { background: var(--paper-soft); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; margin-top: 14px; }
.chat-head { display: flex; align-items: center; gap: 8px; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 600; color: var(--muted); margin-bottom: 10px; }
.chat-head .typing { margin-left: auto; color: var(--brand); }
.chat-bubble { background: var(--paper); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; font-size: 13px; color: var(--ink-soft); margin-bottom: 8px; }
.chat-bubble--ai { background: var(--brand-soft); border-color: transparent; color: var(--ink); }
.chat-bubble strong { color: var(--brand-dark); font-weight: 600; }
.chat-sources { font-size: 11px; color: var(--muted); margin-top: 6px; display: flex; gap: 6px; flex-wrap: wrap; }
.chat-sources .tag { background: var(--paper-bg); padding: 3px 9px; border-radius: 6px; color: var(--body); }

.widget-pill {
  position: absolute; left: -16px; top: 80px;
  background: var(--paper); border: 1px solid var(--border-strong);
  border-radius: 999px; padding: 8px 14px 8px 10px;
  display: inline-flex; align-items: center; gap: 8px;
  box-shadow: 0 12px 24px -12px rgba(15,23,42,0.18);
  font-size: 12px; color: var(--ink-soft);
}
.widget-pill .ic { width: 24px; height: 24px; border-radius: 999px; background: var(--brand-soft); color: var(--brand); display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; }
.widget-pill .lab { display: block; font-size: 9px; letter-spacing: 0.14em; color: var(--muted); text-transform: uppercase; font-weight: 700; }
.widget-pill .val { display: block; font-weight: 600; }
.widget-pill--bottom { top: auto; bottom: 36px; left: auto; right: -18px; }

/* REFERENCES STRIP */
.refs { background: var(--paper); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); padding: 36px 0; }
.refs-inner { display: flex; align-items: center; gap: 28px; flex-wrap: wrap; justify-content: center; }
.refs-label { font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
.refs-list { display: flex; gap: 28px; flex-wrap: wrap; align-items: center; }
.ref-name { font-family: 'Space Grotesk', sans-serif; font-weight: 600; color: var(--ink-soft); font-size: 15px; letter-spacing: -0.01em; }
.refs-more { color: var(--muted); font-size: 13px; }

/* KONTEKST + CARDS */
.cards-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; margin-top: 56px; }
@media (max-width: 880px) { .cards-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 520px) { .cards-grid { grid-template-columns: 1fr; } }
.card {
  background: var(--paper); border: 1px solid var(--border); border-radius: 14px;
  padding: 24px 22px; transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
}
.card:hover { border-color: var(--border-strong); transform: translateY(-2px); box-shadow: 0 16px 32px -20px rgba(15,23,42,0.12); }
.card-ic { width: 36px; height: 36px; border-radius: 10px; background: var(--brand-soft); color: var(--brand); display: inline-flex; align-items: center; justify-content: center; font-size: 16px; margin-bottom: 18px; }
.card h3 { font-family: 'Space Grotesk', sans-serif; font-size: 16px; font-weight: 600; color: var(--ink); margin-bottom: 6px; line-height: 1.3; }
.card p { color: var(--body); font-size: 14px; line-height: 1.55; }

/* AI STACK */
.stack-row { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; margin-top: 40px; }
.stack-chip {
  display: inline-flex; align-items: center; gap: 8px;
  background: var(--paper); border: 1px solid var(--border);
  border-radius: 999px; padding: 9px 18px;
  font-size: 13px; color: var(--ink-soft); font-weight: 500;
}
.stack-chip::before { content: ''; width: 6px; height: 6px; border-radius: 999px; background: var(--brand); }

/* RESITVE - 6 numbered cards */
.modules-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-top: 56px; }
@media (max-width: 880px) { .modules-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 520px) { .modules-grid { grid-template-columns: 1fr; } }
.module {
  background: var(--paper); border: 1px solid var(--border); border-radius: 16px;
  padding: 26px 24px; position: relative;
}
.module-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.module-ic { width: 38px; height: 38px; border-radius: 10px; background: var(--brand-soft); color: var(--brand); display: inline-flex; align-items: center; justify-content: center; font-size: 16px; }
.module-num { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--muted); letter-spacing: 0.06em; }
.module h3 { font-family: 'Space Grotesk', sans-serif; font-size: 17px; font-weight: 600; line-height: 1.3; color: var(--ink); margin-bottom: 10px; }
.module p { color: var(--body); font-size: 14px; line-height: 1.6; }
.module-example { margin-top: 18px; padding: 14px 16px; background: var(--paper-soft); border-radius: 10px; border-left: 3px solid var(--brand); }
.module-example .lab { font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--brand-dark); margin-bottom: 6px; }
.module-example .quote { font-size: 13px; color: var(--ink-soft); font-style: italic; line-height: 1.5; }

/* ARHITEKTURA - blocks */
.arch-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 56px; align-items: start; }
@media (max-width: 880px) { .arch-grid { grid-template-columns: 1fr; } }
.arch-text { color: var(--body); font-size: 16px; line-height: 1.65; }
.arch-text p + p { margin-top: 16px; }
.arch-stack { background: var(--paper); border: 1px solid var(--border); border-radius: 16px; padding: 28px; }
.arch-layer { display: grid; grid-template-columns: 1fr; gap: 10px; }
.arch-row {
  display: flex; align-items: center; gap: 14px;
  background: var(--paper-soft); border: 1px solid var(--border); border-radius: 12px;
  padding: 14px 18px;
}
.arch-row.brand { background: var(--brand-soft); border-color: transparent; }
.arch-row .ic { width: 28px; height: 28px; border-radius: 8px; background: var(--paper); border: 1px solid var(--border); display: inline-flex; align-items: center; justify-content: center; color: var(--ink); font-weight: 600; font-size: 12px; flex-shrink: 0; }
.arch-row.brand .ic { background: var(--paper); color: var(--brand); border: 0; }
.arch-row .lab { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
.arch-row .val { font-family: 'Space Grotesk', sans-serif; font-size: 14px; font-weight: 600; color: var(--ink); }

/* PILOT - two-column grid (cilj + faze) */
.pilot-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 56px; }
@media (max-width: 880px) { .pilot-grid { grid-template-columns: 1fr; } }
.pilot-block { background: var(--paper); border: 1px solid var(--border); border-radius: 16px; padding: 28px 28px 22px; }
.pilot-block .lab { font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--brand-dark); margin-bottom: 18px; }
.pilot-list { display: grid; gap: 12px; }
.pilot-item { display: grid; grid-template-columns: 26px 1fr; gap: 12px; align-items: start; font-size: 14px; color: var(--ink-soft); line-height: 1.5; }
.pilot-item .num { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--brand); font-weight: 700; padding-top: 2px; }
.pilot-item .check { width: 18px; height: 18px; border-radius: 999px; background: var(--brand-soft); color: var(--brand); display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; margin-top: 2px; }

/* PERSONA SPOTLIGHT - asymmetric block */
.spotlight {
  background: var(--paper); border: 1px solid var(--border); border-radius: 18px;
  padding: 44px 48px; margin-top: 56px;
  display: grid; grid-template-columns: 1fr 1fr; gap: 48px;
}
@media (max-width: 880px) { .spotlight { grid-template-columns: 1fr; padding: 32px 28px; } }
.spotlight-left .eyebrow { margin-bottom: 18px; }
.spotlight-left h3 { font-family: 'Space Grotesk', sans-serif; font-size: 30px; font-weight: 700; line-height: 1.15; color: var(--ink); margin-bottom: 18px; }
.spotlight-left p { color: var(--body); font-size: 16px; line-height: 1.6; }
.spotlight-right { display: grid; gap: 14px; align-content: start; }
.bullet {
  display: grid; grid-template-columns: 22px 1fr; gap: 14px; align-items: start;
  font-size: 15px; color: var(--ink-soft); line-height: 1.5;
}
.bullet .ic {
  width: 22px; height: 22px; border-radius: 999px; background: var(--brand-soft); color: var(--brand);
  display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; margin-top: 2px;
}

/* BENEFITS - 2 column table */
.benefits-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 56px; }
@media (max-width: 880px) { .benefits-grid { grid-template-columns: 1fr; } }
.benefit-col { background: var(--paper); border: 1px solid var(--border); border-radius: 16px; padding: 28px 30px; }
.benefit-col .lab { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--brand-dark); font-weight: 700; margin-bottom: 22px; }
.benefit-col h4 { font-family: 'Space Grotesk', sans-serif; font-size: 22px; font-weight: 600; line-height: 1.25; color: var(--ink); margin-bottom: 16px; }
.benefit-list { display: grid; gap: 10px; }
.benefit-list .item { display: grid; grid-template-columns: 18px 1fr; gap: 12px; font-size: 14px; color: var(--ink-soft); line-height: 1.5; }
.benefit-list .item .ic { width: 18px; height: 18px; border-radius: 999px; background: var(--brand); color: #fff; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; margin-top: 3px; }

/* VARNOST KRATKO - safety checklist */
.safety-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 32px; margin-top: 48px; max-width: 880px; margin-left: auto; margin-right: auto; padding: 28px 32px; background: var(--paper); border: 1px solid var(--border); border-radius: 16px; }
@media (max-width: 720px) { .safety-grid { grid-template-columns: 1fr; padding: 24px 22px; } }
.safety-grid .item { display: grid; grid-template-columns: 22px 1fr; gap: 12px; font-size: 14px; color: var(--ink-soft); line-height: 1.5; }
.safety-grid .item .ic { width: 20px; height: 20px; border-radius: 6px; background: var(--brand-soft); color: var(--brand); display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; margin-top: 2px; }

/* VARNOST PODATKI - full text block */
.text-block { max-width: 800px; margin: 40px auto 0; color: var(--body); font-size: 17px; line-height: 1.65; text-align: left; }
.text-block p + p { margin-top: 18px; }

/* PRISTOP - approach block */
.approach { background: var(--paper); border: 1px solid var(--border); border-radius: 18px; padding: 44px 48px; margin-top: 56px; }
@media (max-width: 720px) { .approach { padding: 32px 28px; } }
.approach .lab { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--brand-dark); font-weight: 700; margin-bottom: 14px; }
.approach h3 { font-family: 'Space Grotesk', sans-serif; font-size: 26px; font-weight: 700; line-height: 1.2; color: var(--ink); margin-bottom: 18px; }
.approach p { color: var(--body); font-size: 16px; line-height: 1.65; margin-bottom: 14px; }
.approach-row { display: flex; flex-wrap: wrap; gap: 24px; margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--border); }
.approach-fact { flex: 1 1 200px; }
.approach-fact .v { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 22px; color: var(--brand); }
.approach-fact .k { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); margin-top: 4px; font-weight: 600; }

/* FAQ */
.faq-list { max-width: 820px; margin: 48px auto 0; }
.faq-item { border-bottom: 1px solid var(--border); }
.faq-item summary {
  list-style: none; cursor: pointer;
  display: flex; align-items: center; justify-content: space-between; gap: 18px;
  padding: 22px 4px;
  font-family: 'Space Grotesk', sans-serif; font-size: 17px; font-weight: 600; color: var(--ink);
}
.faq-item summary::-webkit-details-marker { display: none; }
.faq-item summary::after { content: '+'; font-size: 22px; font-weight: 400; color: var(--brand); width: 24px; text-align: center; transition: transform 0.2s ease; }
.faq-item[open] summary::after { content: '−'; }
.faq-item .answer { padding: 4px 4px 22px; color: var(--body); font-size: 15px; line-height: 1.65; max-width: 720px; }

/* FINAL CTA */
.cta-final { padding: 96px 0 112px; background: linear-gradient(180deg, var(--paper-bg) 0%, var(--paper) 100%); border-top: 1px solid var(--border); position: relative; overflow: hidden; }
.cta-final::before {
  content: ''; position: absolute; top: 0; left: 50%; transform: translateX(-50%);
  width: 800px; height: 800px; border-radius: 999px;
  background: radial-gradient(circle at center, var(--brand-rgba) 0%, transparent 70%);
  pointer-events: none;
}
.cta-final-inner { position: relative; max-width: 720px; margin: 0 auto; text-align: center; padding: 0 28px; }
.cta-final h2 { font-size: 44px; font-weight: 700; line-height: 1.1; }
@media (max-width: 720px) { .cta-final h2 { font-size: 32px; } }
.cta-final p { color: var(--body); font-size: 18px; line-height: 1.6; margin-top: 20px; max-width: 540px; margin-left: auto; margin-right: auto; }
.cta-final .btn { margin-top: 32px; font-size: 15px; padding: 14px 28px; }
.cta-final-contact { margin-top: 32px; font-size: 13px; color: var(--muted); display: flex; gap: 20px; justify-content: center; flex-wrap: wrap; }
.cta-final-contact a { color: var(--brand-dark); font-weight: 500; }

/* FOOTER */
.footer { padding: 36px 0; border-top: 1px solid var(--border); background: var(--paper); }
.footer-inner { display: flex; align-items: center; justify-content: space-between; gap: 18px; flex-wrap: wrap; max-width: 1180px; margin: 0 auto; padding: 0 28px; font-size: 13px; color: var(--muted); }
.footer-inner a { color: var(--muted); }
.footer-inner a:hover { color: var(--ink); }
`;
}

// ─── SECTION RENDERERS ────────────────────────────────────────────────────────

function renderBanner(meta) {
  return `<div class="banner">
  <span class="banner-icon">✉</span> Pripravljeno za: ${esc(meta.recipientFull)}
</div>`;
}

function renderHeader(meta) {
  return `<header class="header">
  <div class="header-inner">
    <div class="brand-lockup">
      <span class="aiera">AIERA</span>
      <span class="sep">×</span>
      <span class="target">${esc(meta.companyDisplay)}</span>
    </div>
    <a href="${esc(meta.calendlyUrl)}" target="_blank" rel="noopener" class="btn btn-primary">Rezerviraj 15-min sestanek</a>
  </div>
</header>`;
}

function renderHero(content, meta) {
  const trust = (content.heroTrust || []).slice(0, 3);
  return `<section class="hero">
  <div class="wrap hero-grid">
    <div>
      <span class="eyebrow eyebrow-dot">Personaliziran predlog — ${todayUpper()}</span>
      <h1>${esc(content.heroTitleTop)}<br><span class="brand-line">${esc(content.heroTitleBottom)}</span></h1>
      <p class="hero-lead">${esc(content.heroLead)}</p>
      <div class="hero-cta-row">
        <a href="${esc(meta.calendlyUrl)}" target="_blank" rel="noopener" class="btn btn-primary btn-arrow">Rezerviraj 15-min sestanek</a>
        <a href="#resitve" class="btn btn-ghost">Primeri uporabe</a>
      </div>
      <div class="hero-trust">
        ${trust.map(t => `<span class="item"><span class="dot">✓</span>${esc(t)}</span>`).join('')}
      </div>
    </div>
    <div style="position: relative;">
      ${renderHeroWidget(content, meta)}
    </div>
  </div>
</section>`;
}

function renderHeroWidget(content, meta) {
  const stats = (content.widgetStats || []).slice(0, 3);
  const chatPrompt = content.widgetChatPrompt || 'Pripravi povzetek za vodstvo.';
  const chatAnswer = content.widgetChatAnswer || 'Pripravljen. Glavna ugotovitev v 2 stavkih.';
  const sources = content.widgetSources || ['CRM', 'Dokumenti', 'Razpisi'];
  const widgetTag = content.widgetTag || 'pilot';
  const widgetTitle = content.widgetTitle || `${meta.companyDisplay} pregled`;
  const pillTopLabel = content.widgetPillTopLabel || 'POVEZAVA';
  const pillTopValue = content.widgetPillTopValue || 'AI predlog pripravljen';
  const pillBottomLabel = content.widgetPillBottomLabel || 'AUDIT LOG';
  const pillBottomValue = content.widgetPillBottomValue || '+42 dejanj danes';

  return `<div class="widget">
    <div class="widget-bar">
      <div class="dots"><span></span><span></span><span></span></div>
      <div class="url">${esc(meta.slug)}.ai-portal / ${esc(widgetTag)}</div>
      <div class="live">live</div>
    </div>
    <div class="widget-body">
      <div class="widget-row">
        <div class="widget-title">${esc(widgetTitle)}</div>
        <div class="widget-tag">danes</div>
      </div>
      <div class="widget-stats">
        ${stats.map(s => `<div class="stat-card">
          <div class="stat-label">${esc(s.label)}</div>
          <div class="stat-num">${esc(s.value)} ${s.delta ? `<span class="stat-delta">${esc(s.delta)}</span>` : ''}</div>
        </div>`).join('')}
      </div>
      <div class="activity">
        <div class="activity-head"><span>${esc(content.widgetActivityLabel || 'AKTIVNOST (30D)')}</span><span style="color: var(--brand); font-weight: 700;">▲ ${esc(content.widgetActivityDelta || '24%')}</span></div>
        <svg class="activity-spark" viewBox="0 0 200 38" preserveAspectRatio="none">
          <polyline fill="none" stroke="var(--brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            points="0,30 18,28 35,29 52,25 70,26 88,22 105,20 122,17 140,14 158,10 175,12 200,5"/>
        </svg>
      </div>
      <div class="chat">
        <div class="chat-head">
          <span>AI asistent</span>
          <span class="typing">● piše</span>
        </div>
        <div class="chat-bubble">${esc(chatPrompt)}</div>
        <div class="chat-bubble chat-bubble--ai">${chatAnswer ? chatAnswer.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') : ''}</div>
        <div class="chat-sources">
          <span style="color: var(--muted); font-weight: 600;">Viri:</span>
          ${sources.map(src => `<span class="tag">${esc(src)}</span>`).join('')}
        </div>
      </div>
    </div>
    <div class="widget-pill">
      <span class="ic">✓</span>
      <span><span class="lab">${esc(pillTopLabel)}</span><span class="val">${esc(pillTopValue)}</span></span>
    </div>
    <div class="widget-pill widget-pill--bottom">
      <span class="ic">⊙</span>
      <span><span class="lab">${esc(pillBottomLabel)}</span><span class="val">${esc(pillBottomValue)}</span></span>
    </div>
  </div>`;
}

function renderReferences(content) {
  const refs = content.references || ['Munchies', 'Valtheron', 'B2Booster', 'NordLogistics', 'RedEyeMonkey'];
  const moreLabel = content.referencesMore || '+ 30 podjetij v SI in EU';
  return `<section class="refs">
  <div class="wrap refs-inner">
    <div class="refs-label">Reference — izbrane stranke AIERA</div>
    <div class="refs-list">
      ${refs.map(r => `<span class="ref-name">${esc(r)}</span>`).join('')}
      <span class="refs-more">${esc(moreLabel)}</span>
    </div>
  </div>
</section>`;
}

function renderKontekst(content) {
  const cards = content.kontekstCards || [];
  return `<section class="section">
  <div class="wrap">
    <div class="center"><span class="eyebrow">${esc(content.kontekstEyebrow || 'Kontekst')}</span></div>
    <h2>${esc(content.kontekstTitle)}</h2>
    <p class="section-lead">${esc(content.kontekstLead)}</p>
    <div class="cards-grid">
      ${cards.slice(0, 4).map(c => `<div class="card">
        <div class="card-ic">${esc(c.icon || '◆')}</div>
        <h3>${esc(c.title)}</h3>
        <p>${esc(c.body)}</p>
      </div>`).join('')}
    </div>
  </div>
</section>`;
}

function renderAiStack(content) {
  const items = content.aiStackTools || ['Claude', 'OpenAI', 'Gemini', 'n8n', 'Lovable', 'Open Claw'];
  return `<section class="section">
  <div class="wrap center">
    <span class="eyebrow">AIERA AI Stack</span>
    <h2 style="margin-top: 16px;">Preverjeni gradniki, pravilno sestavljeni.</h2>
    <p class="section-lead">Ne uvajamo eksperimentalnih orodij. Gradimo z modeli in platformami, ki so dokazano stabilne za poslovno rabo.</p>
    <div class="stack-row">
      ${items.map(t => `<span class="stack-chip">${esc(t)}</span>`).join('')}
    </div>
  </div>
</section>`;
}

function renderResitve(content) {
  const modules = content.resitveModules || [];
  const icons = ['📘', '🌐', '📊', '📑', '🎯', '📈'];
  return `<section class="section" id="resitve">
  <div class="wrap">
    <div class="center"><span class="eyebrow">${esc(content.resitveEyebrow || 'Možne rešitve')}</span></div>
    <h2>${esc(content.resitveTitle)}</h2>
    ${content.resitveLead ? `<p class="section-lead">${esc(content.resitveLead)}</p>` : ''}
    <div class="modules-grid">
      ${modules.slice(0, 6).map((m, i) => `<div class="module">
        <div class="module-head">
          <span class="module-ic">${esc(m.icon || icons[i] || '◆')}</span>
          <span class="module-num">0${i + 1}</span>
        </div>
        <h3>${esc(m.title)}</h3>
        <p>${esc(m.body)}</p>
        ${m.example ? `<div class="module-example">
          <div class="lab">Primer uporabe</div>
          <div class="quote">${esc(m.example)}</div>
        </div>` : ''}
      </div>`).join('')}
    </div>
  </div>
</section>`;
}

function renderArhitektura(content) {
  const layers = content.arhitekturaLayers || [];
  return `<section class="section">
  <div class="wrap">
    <div class="center"><span class="eyebrow">Arhitektura</span></div>
    <h2>${esc(content.arhitekturaTitle)}</h2>
    <p class="section-lead">${esc(content.arhitekturaLead)}</p>
    <div class="arch-grid">
      <div class="arch-text">
        ${(content.arhitekturaParagraphs || []).map(p => `<p>${esc(p)}</p>`).join('')}
      </div>
      <div class="arch-stack">
        <div class="arch-layer">
          ${layers.slice(0, 5).map((l, i) => `<div class="arch-row${l.brand ? ' brand' : ''}">
            <span class="ic">${esc(l.icon || (i + 1))}</span>
            <div><span class="lab">${esc(l.label)}</span><div class="val">${esc(l.value)}</div></div>
          </div>`).join('')}
        </div>
      </div>
    </div>
  </div>
</section>`;
}

function renderPilot(content) {
  const ciljItems = content.pilotCilj || [];
  const fazeItems = content.pilotFaze || [];
  return `<section class="section">
  <div class="wrap">
    <div class="center"><span class="eyebrow">Pilotni projekt</span></div>
    <h2>${esc(content.pilotTitle)}</h2>
    <p class="section-lead">${esc(content.pilotLead)}</p>
    <div class="pilot-grid">
      <div class="pilot-block">
        <div class="lab">Cilj pilota</div>
        <div class="pilot-list">
          ${ciljItems.slice(0, 5).map(item => `<div class="pilot-item"><span class="check">✓</span><span>${esc(item)}</span></div>`).join('')}
        </div>
      </div>
      <div class="pilot-block">
        <div class="lab">Faze projekta</div>
        <div class="pilot-list">
          ${fazeItems.slice(0, 5).map((item, i) => `<div class="pilot-item"><span class="num">0${i + 1}</span><span>${esc(item)}</span></div>`).join('')}
        </div>
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
        <span class="eyebrow">${esc(persona.spotlight.label)}</span>
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
    <div class="center"><span class="eyebrow">Vpliv</span></div>
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
    <div class="center"><span class="eyebrow">Varnost in omejitve</span></div>
    <h2>${esc(content.varnostKratkoTitle || 'AI naj pomaga, ne odloča namesto ljudi')}</h2>
    <p class="section-lead">${esc(content.varnostKratkoLead)}</p>
    <div class="safety-grid">
      ${items.slice(0, 6).map(i => `<div class="item"><span class="ic">⊙</span><span>${esc(i)}</span></div>`).join('')}
    </div>
  </div>
</section>`;
}

function renderVarnostPodatki(content) {
  return `<section class="section">
  <div class="wrap-narrow">
    <div class="center"><span class="eyebrow">Varnost, podatki in arhitektura</span></div>
    <h2>${esc(content.varnostPodatkiTitle)}</h2>
    <div class="text-block">
      ${(content.varnostPodatkiParagraphs || []).map(p => `<p>${esc(p)}</p>`).join('')}
    </div>
  </div>
</section>`;
}

function renderPristop(content) {
  const facts = content.pristopFacts || [];
  return `<section class="section">
  <div class="wrap">
    <div class="approach">
      <div class="lab">${esc(content.pristopLabel || 'AIERA pristop')}</div>
      <h3>${esc(content.pristopTitle)}</h3>
      ${(content.pristopParagraphs || []).map(p => `<p>${esc(p)}</p>`).join('')}
      ${facts.length ? `<div class="approach-row">
        ${facts.slice(0, 4).map(f => `<div class="approach-fact"><div class="v">${esc(f.value)}</div><div class="k">${esc(f.label)}</div></div>`).join('')}
      </div>` : ''}
    </div>
  </div>
</section>`;
}

function renderFaq(content) {
  const items = content.faqItems || [];
  return `<section class="section">
  <div class="wrap">
    <div class="center"><span class="eyebrow">FAQ</span></div>
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
    <span class="eyebrow">Za ${esc(meta.recipientShort)}</span>
    <h2 style="margin-top: 20px;">${esc(content.ctaFinalTitle || personaCta)}</h2>
    <p>${esc(content.ctaFinalBody)}</p>
    <a href="${esc(meta.calendlyUrl)}" target="_blank" rel="noopener" class="btn btn-primary btn-arrow">Rezerviraj 15-min sestanek</a>
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
    <span>© ${new Date().getFullYear()} AIERA d.o.o. · Ta predlog je pripravljen ročno za naslovnika.</span>
    <span><a href="https://aiera.si" target="_blank" rel="noopener">aiera.si</a></span>
  </div>
</footer>`;
}

// ─── DISPATCHER ───────────────────────────────────────────────────────────────

const RENDERERS = {
  hero: renderHero,
  references: renderReferences,
  kontekst: renderKontekst,
  aiStack: renderAiStack,
  resitve: renderResitve,
  arhitektura: renderArhitektura,
  pilot: renderPilot,
  personaSpotlight: renderPersonaSpotlight,
  benefits: renderBenefits,
  varnostKratko: renderVarnostKratko,
  varnostPodatki: renderVarnostPodatki,
  pristop: renderPristop,
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
    } else if (a.className && (a.className.indexOf('btn-primary') > -1 || a.className.indexOf('btn-arrow') > -1)) {
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
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>${baseStyles(theme)}</style>
</head>
<body>
${renderBanner(meta)}
${renderHeader(meta)}
${sectionsHtml}
${renderFooter()}
${meta.disablePixel ? '' : renderTrackingPixel(meta)}
</body>
</html>`;
}

module.exports = { renderPage };
