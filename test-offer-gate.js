// Offline check of the offer quality gate. No API calls: exercises the
// deterministic layer against the real GenePlanet copy that shipped, plus a
// clean control, plus a full render.
process.env.OFFER_PROOFREAD_ENABLED = '0';

const { autoFix, deterministicCheck } = require('./proposal-solutions/validate');
const { renderPage } = require('./proposal-solutions/template');

const ctx = {
  canonicalBrand: 'GenePlanet',
  rawCompany: 'Gene Planet',
  firstName: 'Marko',
  lastName: 'Bitenc',
  title: 'Founder and CEO',
  industry: 'Biotechnology',
  sensitive: true,
  facts: [],
};

// ── 1. The copy that actually shipped on 2026-08-01 ──────────────────────────
const shipped = {
  hero_h1: 'AI za rast Gene Planet - od podatkov do odločitev.',
  hero_sub: 'Gene Planet razvija napredne biotehološke rešitve, ki zahtevajo natančnost in hitrost. AI avtomatizira repetitivne procese - od obdelave podatkov do komunikacije s partnerji - tako da se Vaša ekipa osredotoči na inovacije.',
  assumption: 'Predlog temelji na javno dostopnih informacijah o podjetju in vlogi prejemnika.',
  why_now_title: 'Gene Planet raste hitro. AI doda kapaciteto.',
  why_now_body: 'V bioteh panogi je ročna obdelava podatkov časovno potratna. Rezultat: vaša ekipa lahko voduje 2-3x več dialogov s klientelo, brez da bi se zamenjali v papirjih.',
  quick_wins: [
    { title: 'Hitrejši odzivi', desc: 'AI je drafta odgovore in prihranijo ure vsakodnevnega sita.' },
    { title: 'Manj ročnega dela', desc: 'AI kvalificira nevroze povpraševanja.' },
  ],
  modules: [
    { id: 'outbound', intro: 'Sistematičen outbound proti laboratorijem in klinikam.' },
    { id: 'customer_service', intro: 'AI prebere zgodovino stranke in pripravi odgovor o rezultatih testov.' },
    { id: 'agenti', intro: 'Agenti prevzamejo pošiljanje rezultatov in vnos naročil.' },
  ],
  pilot_first: 'Začeli bi z outboundom.',
  pilot_includes: ['ICP raziskava'],
  pilot_excludes: [],
  needed_from_client: ['Kontakt za obrat s Vašo ekipo'],
  cta_paragraph: 'Radi bi na kratkem sestanku spoznali Mašo in Martina ter razumeli, kateri del vašega tedna je najpotratnejši.',
};

console.log('═══ 1. SHIPPED GENEPLANET COPY ═══');
const fixedShipped = autoFix(shipped, ctx.canonicalBrand);
const issues = deterministicCheck(fixedShipped, ctx);
console.log(`Auto-fixed brand   : ${fixedShipped.hero_h1}`);
console.log(`Auto-fixed vikanje : ${fixedShipped.hero_sub.includes('Vaša') ? 'STILL BROKEN' : 'ok (lowercased)'}`);
console.log(`Hard fails         : ${issues.length}`);
issues.forEach(i => console.log('  ✕ ' + i));
if (!issues.length) { console.error('FAIL: gate let the bad page through'); process.exit(1); }

// ── 2. Clean control: must pass ──────────────────────────────────────────────
const clean = {
  hero_h1: 'Dve konkretni priložnosti za GenePlanet',
  hero_sub: 'Predlagamo dve smeri, kjer lahko AIERA podpre hitrejšo komercialno izvedbo v GenePlanet, brez poseganja v genetske ali zdravstvene podatke.',
  assumption: 'Predlog temelji na javno dostopnih informacijah o podjetju in na vaši vlogi. Na kratkem pogovoru bi preverili, ali sta smeri dejansko relevantni.',
  why_now_title: 'GenePlanet ima znanstveno jedro. AI doda komercialno hitrost.',
  why_now_body: 'Rast na več trgov pomeni več lokaliziranih materialov in več pogovorov s partnerji. Oba dela je mogoče sistematizirati brez dotikanja občutljivih podatkov.',
  quick_wins: [
    { title: 'Sistematičen outbound', desc: 'Voden proces odpiranja pogovorov s kliničnimi in laboratorijskimi partnerji.' },
    { title: 'Lokalizirani materiali', desc: 'Predstavitve in ponudbe za nov trg pripravljene iz odobrenih vsebin.' },
  ],
  modules: [
    { id: 'outbound', intro: 'Odpiranje pogovorov s kliničnimi partnerji in distributerji na izbranem prioritetnem trgu.' },
    { id: 'generator_ponudb', intro: 'Priprava lokaliziranih B2B predstavitev iz vnaprej odobrenih vsebin.' },
  ],
  pilot_first: 'Začeli bi z outboundom na enem trgu, ker je učinek tam najhitreje merljiv.',
  pilot_includes: ['ICP raziskava za en trg', 'Baza odločevalcev', 'Tedensko poročanje'],
  pilot_excludes: ['Genetski, zdravstveni in pacientovi podatki', 'Dostop do internih sistemov z osebnimi podatki'],
  needed_from_client: ['Kontaktna oseba za komercialni del', 'Odobreni predstavitveni materiali'],
  cta_paragraph: 'Predlagam kratek pogovor, na katerem preverimo, ali je smer prava. Iz tega pripravim konkreten predlog pilota.',
};

console.log('\n═══ 2. CLEAN CONTROL ═══');
const cleanIssues = deterministicCheck(autoFix(clean, ctx.canonicalBrand), ctx);
console.log(`Hard fails: ${cleanIssues.length}`);
cleanIssues.forEach(i => console.log('  ✕ ' + i));
if (cleanIssues.length) { console.error('FAIL: gate rejected clean copy (false positive)'); process.exit(1); }

// ── 3. Render ────────────────────────────────────────────────────────────────
const html = renderPage({
  leadData: { company: 'GenePlanet', firstName: 'Marko', lastName: 'Bitenc', title: 'Founder and CEO', gender: 'male' },
  slots: autoFix(clean, ctx.canonicalBrand),
  meta: {
    calendlyUrl: 'https://calendly.com/aiera-koledar/aiera-ai',
    pixelEndpoint: '', disablePixel: true,
    pageUrl: 'https://ponudbe.aiera.si/geneplanet',
    sources: [{ claim: 'Lauxera Capital Partners je julija 2026 vstopil kot strateski investitor.', url: 'https://www.geneplanet.com/news' }],
    sensitive: true,
  },
});
require('fs').writeFileSync('/tmp/geneplanet-new.html', html);
console.log(`\n═══ 3. RENDER ═══\nchars: ${html.length}  (cap 99000)`);
console.log(`og:title present: ${html.includes('og:title')}`);
console.log(`h4 removed      : ${!html.includes('<h4')}`);
console.log(`dashes present  : ${/[–—]/.test(html)}`);
console.log('\nALL CHECKS PASSED');
