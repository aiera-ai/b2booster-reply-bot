// Renderer for solution-module offer pages. Mirrors the structure of the
// hand-made aiera.si/{company} pages, tightened after the 2026-08-01 audit:
// max 3 solutions, an explicit assumption + pilot scope, cited sources, a
// low-friction primary CTA, and OG tags so the LinkedIn preview is not blank.
// Self-contained single HTML file, < 99k chars (Airtable HTML field cap).

const { SOLUTION_MODULES } = require('./modules');

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const MONTHS_SI = ['januar', 'februar', 'marec', 'april', 'maj', 'junij', 'julij', 'avgust', 'september', 'oktober', 'november', 'december'];
function todaySi() {
  const d = new Date();
  return `${d.getDate()}. ${MONTHS_SI[d.getMonth()]} ${d.getFullYear()}`;
}

// Tool badges read as junior to a technically mature buyer and add nothing to
// conversion. Off by default; OFFER_SHOW_STACK=1 restores them.
const SHOW_STACK = process.env.OFFER_SHOW_STACK === '1';
const AI_STACK = ['Claude', 'OpenAI', 'Gemini', 'n8n', 'Lovable', 'Cursor', 'Clay'];

// B2Booster is our own service, not a client reference - claiming it weakens
// the whole row.
const REFERENCES = ['MUNCHIES', 'Megasplet', 'Valtheron', 'NordLogistics', 'RedEyeMonkey'];

const RESULTS_FIXED = [
  'Sistematičen, ponovljiv vir B2B povpraševanj',
  'Krajši čas od povpraševanja do ponudbe',
  'Avtomatizirana marketinška produkcija',
  'Manj ročnega dela, več strateškega fokusa',
];

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return url; }
}

function renderModuleSection(mod, intro, idx) {
  const bullets = (mod.bullets || []).map(b => `
      <div class="card">
        <h3>${esc(b.t)}</h3>
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
      <span class="eyebrow">MOŽNOST ${idx + 1}: ${esc(mod.title)}</span>
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
  // The role is deliberately omitted: LinkedIn titles are usually English
  // ("Founder and CEO") and mixing them into a Slovenian page reads sloppy.
  // "Prejemnik:" also avoids declining the name, which "Pripravljeno za" would
  // require ("za Marka Bitenca", not "za Marko Bitenc").
  const recipient = [titlePrefix, fullName].filter(Boolean).join(' ') + ` · ${company}`;
  const date = todaySi();
  const cal = esc(meta.calendlyUrl);
  const pageUrl = meta.pageUrl ? esc(meta.pageUrl) : '';
  const ogImage = process.env.OFFER_OG_IMAGE || '';
  const ogTitle = `AIERA x ${company} - predlog AI rešitev`;
  const ogDesc = String(slots.hero_sub || '').slice(0, 180);

  const quickWins = (slots.quick_wins || []).map(q => `
      <div class="card">
        <h3>${esc(q.title)}</h3>
        <p>${esc(q.desc)}</p>
      </div>`).join('');

  const solutions = slots.modules
    .map((m, i) => renderModuleSection(SOLUTION_MODULES[m.id], m.intro, i))
    .join('\n');

  const solutionIndex = slots.modules.map((m, i) =>
    `<span class="chip">${i + 1} · ${esc(SOLUTION_MODULES[m.id].title.toLowerCase())}</span>`).join('');

  const listItems = arr => (arr || []).map(x => `<div class="item"><span class="dot">✓</span>${esc(x)}</div>`).join('');
  const excludeItems = (slots.pilot_excludes || []).map(x => `<div class="item ex"><span class="dot">✕</span>${esc(x)}</div>`).join('');

  const sources = (meta.sources || []).length ? `
<section class="block sources">
  <div class="wrap">
    <span class="eyebrow">NA ČEM TEMELJI TA PREDLOG</span>
    <p class="body">Predlog je pripravljen na podlagi javno dostopnih informacij o podjetju ${esc(company)}.</p>
    <div class="srclist">
      ${meta.sources.map(s => `<div class="src"><span>${esc(s.claim)}</span> <a href="${esc(s.url)}" target="_blank" rel="noopener nofollow">${esc(hostOf(s.url))}</a></div>`).join('')}
    </div>
  </div>
</section>` : '';

  const stack = SHOW_STACK ? `
<div class="stack">
  <div class="wrap">
    <span class="label">AIERA AI STACK</span>
    ${AI_STACK.map(s => `<span class="badge">${esc(s)}</span>`).join('')}
  </div>
</div>` : '';

  const pixel = meta.pixelEndpoint && !meta.disablePixel
    ? `<img src="${esc(meta.pixelEndpoint)}?e=page_view" width="1" height="1" style="position:absolute;opacity:0" alt="">`
    : '';

  const choiceLine = slots.modules.length > 1
    ? `Če vam je bližja ${slots.modules.map((m, i) => `${i + 1}. možnost`).join(' ali ')}, mi na LinkedInu odgovorite samo s številko. Pripravim konkreten predlog pilota, brez obveznosti.`
    : 'Če je smer prava, mi na LinkedInu odgovorite z eno besedo. Pripravim konkreten predlog pilota, brez obveznosti.';

  return `<!DOCTYPE html>
<html lang="sl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(ogTitle)}</title>
<meta name="description" content="${esc(ogDesc)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(ogTitle)}">
<meta property="og:description" content="${esc(ogDesc)}">
<meta property="og:site_name" content="AIERA">
<meta property="og:locale" content="sl_SI">
${pageUrl ? `<meta property="og:url" content="${pageUrl}">` : ''}
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : ''}
<meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${esc(ogTitle)}">
<meta name="twitter:description" content="${esc(ogDesc)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root { --navy:#0b1526; --ink:#1e293b; --body:#475569; --muted:#64748b; --brand:#2563eb; --brand-dark:#1d4ed8; --soft:#eff6ff; --bg-alt:#f8fafc; --line:#e2e8f0; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Inter',-apple-system,sans-serif; color:var(--ink); background:#fff; line-height:1.6; -webkit-font-smoothing:antialiased; }
  .wrap { max-width:1040px; margin:0 auto; padding:0 24px; }
  .eyebrow { display:inline-block; font-size:12px; font-weight:700; letter-spacing:0.12em; color:var(--brand); text-transform:uppercase; margin-bottom:14px; }
  h2 { font-size:30px; font-weight:800; letter-spacing:-0.02em; color:var(--navy); line-height:1.15; margin-bottom:14px; max-width:760px; }
  .intro { font-size:16px; color:var(--brand-dark); font-weight:600; max-width:720px; margin-bottom:10px; }
  .body { font-size:16px; color:var(--body); max-width:720px; }
  header { position:sticky; top:0; background:rgba(255,255,255,0.94); backdrop-filter:blur(8px); border-bottom:1px solid var(--line); z-index:10; }
  .nav { display:flex; align-items:center; justify-content:space-between; height:60px; gap:12px; }
  .lockup { font-weight:800; font-size:15px; color:var(--navy); letter-spacing:0.02em; }
  .lockup .x { color:var(--muted); font-weight:500; margin:0 7px; }
  .btn { display:inline-block; background:var(--brand); color:#fff; font-weight:600; font-size:15px; padding:12px 26px; border-radius:8px; text-decoration:none; }
  .btn:hover { background:var(--brand-dark); }
  .btn-ghost { background:transparent; color:var(--brand); border:1px solid var(--brand); }
  .btn-sm { padding:8px 18px; font-size:13px; }
  .hero { padding:72px 0 52px; background:linear-gradient(180deg,#fff 0%,var(--soft) 100%); }
  .hero .kicker { font-size:12px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:var(--muted); margin-bottom:18px; }
  .hero h1 { font-size:50px; font-weight:800; letter-spacing:-0.03em; color:var(--navy); line-height:1.07; max-width:860px; margin-bottom:20px; }
  .hero .sub { font-size:18px; color:var(--body); max-width:700px; margin-bottom:20px; }
  .assume { max-width:700px; background:#fff; border:1px solid var(--line); border-left:3px solid var(--brand); border-radius:8px; padding:16px 20px; font-size:15px; color:var(--body); margin-bottom:20px; }
  .hero .byline { font-size:13px; color:var(--muted); margin-bottom:26px; }
  .cta-row { display:flex; gap:14px; flex-wrap:wrap; }
  .stack { padding:26px 0; border-bottom:1px solid var(--line); }
  .stack .wrap { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .stack .label { font-size:11px; font-weight:700; letter-spacing:0.12em; color:var(--muted); margin-right:6px; }
  .badge { font-size:12px; font-weight:600; color:var(--ink); background:var(--bg-alt); border:1px solid var(--line); border-radius:999px; padding:5px 13px; }
  section.block { padding:60px 0; }
  section.alt, section.block.alt { background:var(--bg-alt); }
  .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:16px; margin-top:26px; }
  .card { background:#fff; border:1px solid var(--line); border-radius:12px; padding:20px 22px; }
  section.alt .card { background:#fff; }
  .card h3 { font-size:15px; font-weight:700; color:var(--navy); margin-bottom:6px; }
  .card p { font-size:14px; color:var(--body); }
  .refs { padding:30px 0; border-top:1px solid var(--line); border-bottom:1px solid var(--line); }
  .refs .wrap { display:flex; align-items:center; gap:22px; flex-wrap:wrap; }
  .refs .label { font-size:11px; font-weight:700; letter-spacing:0.12em; color:var(--muted); }
  .refs .name { font-size:14px; font-weight:700; color:var(--ink); opacity:0.8; }
  .refs .more { font-size:13px; color:var(--muted); }
  .chips { display:flex; gap:8px; flex-wrap:wrap; margin-top:20px; }
  .chip { font-size:12px; font-weight:600; color:var(--brand-dark); background:var(--soft); border-radius:999px; padding:5px 13px; }
  section.solution { padding:60px 0; }
  .pricing { margin-top:28px; background:var(--navy); border-radius:14px; padding:28px 30px; color:#fff; max-width:720px; }
  .pricing-label { font-size:11px; font-weight:700; letter-spacing:0.14em; color:#93c5fd; margin-bottom:10px; }
  .pricing-lines { display:flex; gap:26px; flex-wrap:wrap; font-size:22px; font-weight:800; margin-bottom:10px; }
  .pricing-note { font-size:13px; color:#dbe3ec; }
  .list { margin-top:20px; display:grid; gap:10px; max-width:720px; }
  .list .item { display:flex; gap:10px; font-size:15px; color:var(--ink); }
  .list .dot { color:var(--brand); font-weight:800; }
  .list .item.ex { color:var(--body); }
  .list .item.ex .dot { color:var(--muted); }
  .subhead { font-size:13px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:var(--muted); margin-top:26px; }
  .sources .srclist { margin-top:18px; display:grid; gap:10px; max-width:760px; }
  .sources .src { font-size:14px; color:var(--body); display:flex; gap:10px; justify-content:space-between; flex-wrap:wrap; border-bottom:1px dashed var(--line); padding-bottom:8px; }
  .sources .src a { color:var(--brand); text-decoration:none; font-size:13px; white-space:nowrap; }
  .final { padding:76px 0; background:var(--navy); color:#fff; text-align:center; }
  .final h2 { color:#fff; margin:0 auto 14px; }
  .final p { color:#dbe3ec; max-width:640px; margin:0 auto 18px; font-size:16px; }
  .final .choice { color:#fff; font-weight:600; font-size:17px; max-width:660px; margin:0 auto 26px; }
  .final .alt-cta { display:block; margin-top:16px; font-size:14px; color:#93c5fd; }
  footer { padding:34px 0; }
  footer .wrap { display:flex; justify-content:space-between; align-items:center; gap:16px; flex-wrap:wrap; }
  footer .who { font-size:14px; color:var(--body); }
  footer .who strong { color:var(--navy); }
  footer .for { font-size:12px; color:var(--muted); }
  @media (max-width:720px) { .hero h1 { font-size:32px; } h2 { font-size:23px; } .hero { padding:48px 0 36px; } section.block, section.solution { padding:44px 0; } .pricing-lines { font-size:19px; gap:16px; } }
</style>
</head>
<body>
${pixel}
<header>
  <div class="wrap nav">
    <span class="lockup">AIERA<span class="x">×</span>${esc(companyUpper)}</span>
    <a class="btn btn-sm btn-ghost" href="${cal}" target="_blank" rel="noopener">Rezervirajte klic</a>
  </div>
</header>

<section class="hero">
  <div class="wrap">
    <p class="kicker">PREJEMNIK: ${esc(recipient.toUpperCase())}</p>
    <h1>${esc(slots.hero_h1)}</h1>
    <p class="sub">${esc(slots.hero_sub)}</p>
    <div class="assume">${esc(slots.assumption)}</div>
    <p class="byline">Pripravil: Žan Bagarič, AIERA · ${esc(date)}</p>
    <div class="cta-row">
      <a class="btn" href="#resitve">Poglejte predlagane možnosti</a>
      <a class="btn btn-ghost" href="${cal}" target="_blank" rel="noopener">Rezervirajte klic</a>
    </div>
  </div>
</section>
${stack}
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
    <span class="eyebrow">PREDLAGANE MOŽNOSTI</span>
    <h2>Izbrano za ${esc(company)}: ${slots.modules.length === 2 ? 'dve smeri' : 'tri smeri'}, en izvajalec.</h2>
    <div class="chips">${solutionIndex}</div>
  </div>
</section>

${solutions}

<section class="block alt">
  <div class="wrap">
    <span class="eyebrow">PREDLAGAN PRVI KORAK</span>
    <h2>En pilot, omejen obseg, merljiv rezultat.</h2>
    <p class="body">${esc(slots.pilot_first)}</p>
    ${(slots.pilot_includes || []).length ? `<p class="subhead">Pilot vključuje</p><div class="list">${listItems(slots.pilot_includes)}</div>` : ''}
    ${(slots.pilot_excludes || []).length ? `<p class="subhead">Pilot ne vključuje</p><div class="list">${excludeItems}</div>` : ''}
    ${(slots.needed_from_client || []).length ? `<p class="subhead">Kaj potrebujemo z vaše strani</p><div class="list">${listItems(slots.needed_from_client)}</div>` : ''}
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
${sources}
<section class="final">
  <div class="wrap">
    <h2>Naslednji korak je ena številka.</h2>
    <p class="choice">${esc(choiceLine)}</p>
    <p>${esc(slots.cta_paragraph)}</p>
    <a class="btn" href="${cal}" target="_blank" rel="noopener">Ali rezervirajte 15 minut</a>
  </div>
</section>

<footer>
  <div class="wrap">
    <span class="who"><strong>Žan Bagarič</strong> · AIERA · 040 708 327</span>
    <span class="for">Prejemnik: ${esc(recipient)} · ${esc(date)}</span>
  </div>
</footer>
</body>
</html>`;
}

module.exports = { renderPage };
