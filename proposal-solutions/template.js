// Renderer for solution-module offer pages. Mirrors the structure of the
// hand-made aiera.si/{company} pages (hero → AI stack → zakaj zdaj → reference
// → REŠITEV 1..N → predlagan začetek → rezultati → CTA → pripravil).
// Self-contained single HTML file, < 99k chars (Airtable HTML field cap).

const { SOLUTION_MODULES } = require('./modules');

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const MONTHS_SI = ['januar', 'februar', 'marec', 'april', 'maj', 'junij', 'julij', 'avgust', 'september', 'oktober', 'november', 'december'];
function todaySi() {
  const d = new Date();
  return `${d.getDate()}. ${MONTHS_SI[d.getMonth()]} ${d.getFullYear()}`;
}

const AI_STACK = ['Claude', 'OpenAI', 'Gemini', 'n8n', 'Lovable', 'Cursor', 'Clay'];
const REFERENCES = ['MUNCHIES', 'Megasplet', 'Valtheron', 'B2Booster', 'NordLogistics', 'RedEyeMonkey'];

const RESULTS_FIXED = [
  'Sistematičen, ponovljiv vir B2B povpraševanj',
  'Krajši čas od povpraševanja do ponudbe',
  'Avtomatizirana marketinška produkcija',
  'Višja konverzija spletne strani',
  'Manj ročnega dela, več strateškega fokusa',
];

function renderModuleSection(mod, intro, idx) {
  const bullets = (mod.bullets || []).map(b => `
      <div class="card">
        <h4>${esc(b.t)}</h4>
        <p>${esc(b.d)}</p>
      </div>`).join('');

  const pricing = mod.pricing ? `
    <div class="pricing">
      <p class="pricing-label">${esc(mod.pricing.label)}</p>
      <div class="pricing-lines">${mod.pricing.lines.map(l => `<span>${esc(l)}</span>`).join('')}</div>
      <p class="pricing-note">${esc(mod.pricing.note)}</p>
    </div>` : '';

  return `
  <section class="solution${idx % 2 ? ' alt' : ''}">
    <div class="wrap">
      <span class="eyebrow">REŠITEV ${idx + 1}: ${esc(mod.title)}</span>
      <h2>${esc(mod.headline)}</h2>
      ${intro ? `<p class="intro">${esc(intro)}</p>` : ''}
      <p class="body">${esc(mod.body)}</p>
      <div class="cards">${bullets}</div>
      ${pricing}
    </div>
  </section>`;
}

function renderPage({ leadData, slots, meta }) {
  const company = leadData.company;
  const companyUpper = company.toUpperCase();
  const titlePrefix = leadData.gender === 'female' ? 'ga.' : (leadData.gender === 'male' ? 'g.' : '');
  const fullName = `${leadData.firstName || ''} ${leadData.lastName || ''}`.trim();
  const roleStr = leadData.title || leadData.role || '';
  const recipient = [titlePrefix, fullName].filter(Boolean).join(' ')
    + (roleStr ? `, ${roleStr}` : '') + ` - ${company}`;
  const date = todaySi();
  const cal = esc(meta.calendlyUrl);

  const quickWins = (slots.quick_wins || []).map(q => `
      <div class="card">
        <h4>${esc(q.title)}</h4>
        <p>${esc(q.desc)}</p>
      </div>`).join('');

  const solutions = slots.modules
    .map((m, i) => renderModuleSection(SOLUTION_MODULES[m.id], m.intro, i))
    .join('\n');

  const solutionIndex = slots.modules.map((m, i) =>
    `<span class="chip">${i + 1} · ${esc(SOLUTION_MODULES[m.id].title.toLowerCase())}</span>`).join('');

  const pixel = meta.pixelEndpoint && !meta.disablePixel
    ? `<img src="${esc(meta.pixelEndpoint)}?e=page_view" width="1" height="1" style="position:absolute;opacity:0" alt="">`
    : '';

  return `<!DOCTYPE html>
<html lang="sl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>AIERA x ${esc(company)} - personalizirana ponudba</title>
<meta name="description" content="Predlog AI rešitev za ${esc(company)}. Pripravil Žan Bagarič, AIERA.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root { --navy:#0b1526; --ink:#1e293b; --body:#475569; --muted:#94a3b8; --brand:#2563eb; --brand-dark:#1d4ed8; --soft:#eff6ff; --bg-alt:#f8fafc; --line:#e2e8f0; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Inter',-apple-system,sans-serif; color:var(--ink); background:#fff; line-height:1.6; -webkit-font-smoothing:antialiased; }
  .wrap { max-width:1040px; margin:0 auto; padding:0 24px; }
  .eyebrow { display:inline-block; font-size:12px; font-weight:700; letter-spacing:0.12em; color:var(--brand); text-transform:uppercase; margin-bottom:14px; }
  h2 { font-size:30px; font-weight:800; letter-spacing:-0.02em; color:var(--navy); line-height:1.15; margin-bottom:14px; max-width:760px; }
  .intro { font-size:16px; color:var(--brand-dark); font-weight:600; max-width:720px; margin-bottom:10px; }
  .body { font-size:16px; color:var(--body); max-width:720px; }
  header { position:sticky; top:0; background:rgba(255,255,255,0.92); backdrop-filter:blur(8px); border-bottom:1px solid var(--line); z-index:10; }
  .nav { display:flex; align-items:center; justify-content:space-between; height:60px; }
  .lockup { font-weight:800; font-size:15px; color:var(--navy); letter-spacing:0.02em; }
  .lockup .x { color:var(--muted); font-weight:500; margin:0 7px; }
  .btn { display:inline-block; background:var(--brand); color:#fff; font-weight:600; font-size:15px; padding:12px 26px; border-radius:8px; text-decoration:none; }
  .btn:hover { background:var(--brand-dark); }
  .btn-ghost { background:transparent; color:var(--brand); border:1px solid var(--brand); }
  .btn-sm { padding:8px 18px; font-size:13px; }
  .hero { padding:76px 0 56px; background:linear-gradient(180deg,#fff 0%,var(--soft) 100%); }
  .hero .kicker { font-size:12px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:var(--muted); margin-bottom:18px; }
  .hero h1 { font-size:52px; font-weight:800; letter-spacing:-0.03em; color:var(--navy); line-height:1.06; max-width:860px; margin-bottom:20px; }
  .hero .sub { font-size:18px; color:var(--body); max-width:700px; margin-bottom:14px; }
  .hero .byline { font-size:13px; color:var(--muted); margin-bottom:28px; }
  .cta-row { display:flex; gap:14px; flex-wrap:wrap; }
  .stack { padding:26px 0; border-bottom:1px solid var(--line); }
  .stack .wrap { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .stack .label { font-size:11px; font-weight:700; letter-spacing:0.12em; color:var(--muted); margin-right:6px; }
  .badge { font-size:12px; font-weight:600; color:var(--ink); background:var(--bg-alt); border:1px solid var(--line); border-radius:999px; padding:5px 13px; }
  section.block { padding:64px 0; }
  section.alt, section.block.alt { background:var(--bg-alt); }
  .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:16px; margin-top:28px; }
  .card { background:#fff; border:1px solid var(--line); border-radius:12px; padding:20px 22px; }
  section.alt .card { background:#fff; }
  .card h4 { font-size:15px; font-weight:700; color:var(--navy); margin-bottom:6px; }
  .card p { font-size:14px; color:var(--body); }
  .refs { padding:34px 0; border-top:1px solid var(--line); border-bottom:1px solid var(--line); }
  .refs .wrap { display:flex; align-items:center; gap:22px; flex-wrap:wrap; }
  .refs .label { font-size:11px; font-weight:700; letter-spacing:0.12em; color:var(--muted); }
  .refs .name { font-size:14px; font-weight:700; color:var(--ink); opacity:0.75; }
  .refs .more { font-size:13px; color:var(--muted); }
  .chips { display:flex; gap:8px; flex-wrap:wrap; margin-top:20px; }
  .chip { font-size:12px; font-weight:600; color:var(--brand-dark); background:var(--soft); border-radius:999px; padding:5px 13px; }
  section.solution { padding:64px 0; }
  .pricing { margin-top:30px; background:var(--navy); border-radius:14px; padding:28px 30px; color:#fff; max-width:720px; }
  .pricing-label { font-size:11px; font-weight:700; letter-spacing:0.14em; color:#93c5fd; margin-bottom:10px; }
  .pricing-lines { display:flex; gap:26px; flex-wrap:wrap; font-size:22px; font-weight:800; margin-bottom:10px; }
  .pricing-note { font-size:13px; color:#cbd5e1; }
  .list { margin-top:22px; display:grid; gap:10px; max-width:720px; }
  .list .item { display:flex; gap:10px; font-size:15px; color:var(--ink); }
  .list .dot { color:var(--brand); font-weight:800; }
  .final { padding:80px 0; background:var(--navy); color:#fff; text-align:center; }
  .final h2 { color:#fff; margin:0 auto 14px; }
  .final p { color:#cbd5e1; max-width:640px; margin:0 auto 30px; font-size:16px; }
  footer { padding:36px 0; }
  footer .wrap { display:flex; justify-content:space-between; align-items:center; gap:16px; flex-wrap:wrap; }
  footer .who { font-size:14px; color:var(--body); }
  footer .who strong { color:var(--navy); }
  footer .for { font-size:12px; color:var(--muted); }
  @media (max-width:720px) { .hero h1 { font-size:34px; } h2 { font-size:24px; } .hero { padding:52px 0 40px; } }
</style>
</head>
<body>
${pixel}
<header>
  <div class="wrap nav">
    <span class="lockup">AIERA<span class="x">×</span>${esc(companyUpper)}</span>
    <a class="btn btn-sm" href="${cal}" target="_blank" rel="noopener">Rezervirajte klic</a>
  </div>
</header>

<section class="hero">
  <div class="wrap">
    <p class="kicker">PRIPRAVLJENO ZA ${esc(recipient.toUpperCase())}</p>
    <h1>${esc(slots.hero_h1)}</h1>
    <p class="sub">${esc(slots.hero_sub)}</p>
    <p class="byline">Pripravil: Žan Bagarič, AIERA · ${esc(date)}</p>
    <div class="cta-row">
      <a class="btn" href="${cal}" target="_blank" rel="noopener">Rezervirajte klic</a>
      <a class="btn btn-ghost" href="#resitve">Predlagane AI rešitve</a>
    </div>
  </div>
</section>

<div class="stack">
  <div class="wrap">
    <span class="label">AIERA AI STACK</span>
    ${AI_STACK.map(s => `<span class="badge">${esc(s)}</span>`).join('')}
  </div>
</div>

<section class="block">
  <div class="wrap">
    <span class="eyebrow">ZAKAJ ZDAJ</span>
    <h2>${esc(slots.why_now_title)}</h2>
    <p class="body">${esc(slots.why_now_body)}</p>
    <div class="cards">${quickWins}</div>
  </div>
</section>

<div class="refs">
  <div class="wrap">
    <span class="label">REFERENCE</span>
    ${REFERENCES.map(r => `<span class="name">${esc(r)}</span>`).join('')}
    <span class="more">+ 30 podjetij v SI in EU</span>
  </div>
</div>

<section class="block alt" id="resitve">
  <div class="wrap">
    <span class="eyebrow">PREDLAGANE AI REŠITVE</span>
    <h2>Izbrano za ${esc(company)} - ${slots.modules.length} rešitev, en izvajalec.</h2>
    <div class="chips">${solutionIndex}</div>
  </div>
</section>

${solutions}

<section class="block alt">
  <div class="wrap">
    <span class="eyebrow">PREDLAGAN ZAČETEK</span>
    <h2>Discovery, izbira prvih dveh modulov, pilot v živi praksi.</h2>
    <p class="body">${esc(slots.start_modules)}</p>
    <div class="list">
      <div class="item"><span class="dot">✓</span>Discovery delavnica z vašo ekipo</div>
      <div class="item"><span class="dot">✓</span>Izbira prvih 1-2 modulov z največjim učinkom</div>
      <div class="item"><span class="dot">✓</span>60-90-dnevni pilot v živi praksi</div>
      <div class="item"><span class="dot">✓</span>Tedensko poročanje in iteracija</div>
      <div class="item"><span class="dot">✓</span>Načrt širitve na ostale module</div>
    </div>
  </div>
</section>

<section class="block">
  <div class="wrap">
    <span class="eyebrow">PRIČAKOVANI REZULTATI</span>
    <h2>Konkretno, merljivo, kumulativno.</h2>
    <p class="body">Ne obljubljamo čudežev. Gradimo orodja in proces, ki podjetju ${esc(company)} odprejo nove kanale prodaje in razbremenijo ekipo ponavljajočega se dela.</p>
    <div class="list">
      ${RESULTS_FIXED.map(r => `<div class="item"><span class="dot">✓</span>${esc(r)}</div>`).join('')}
    </div>
  </div>
</section>

<section class="final">
  <div class="wrap">
    <h2>Pogovorimo se, kje bi AI podjetju ${esc(company)} prinesel največ vrednosti.</h2>
    <p>${esc(slots.cta_paragraph)}</p>
    <a class="btn" href="${cal}" target="_blank" rel="noopener">Rezervirajte klic</a>
  </div>
</section>

<footer>
  <div class="wrap">
    <span class="who"><strong>Žan Bagarič</strong> · AIERA</span>
    <span class="for">Za ${esc(recipient)} · ${esc(date)}</span>
  </div>
</footer>
</body>
</html>`;
}

module.exports = { renderPage };
