// Local test: generate 3 different persona proposals as static HTML files.
// Run: node proposal/test-local.js
// Output: proposal/test-output/<slug>.html

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { buildProposalHTML } = require('./index');

const TEST_LEADS = [
  {
    firstName: 'Marko',
    lastName: 'Novak',
    company: 'KRKA d.d.',
    title: 'Head of IT',
    industry: 'farmacevtska industrija, raziskave in razvoj',
    theirMessage: 'Pozanimam se za AI rešitve, ki bi pomagale pri pripravi regulatornih dokumentov in iskanju informacij iz internih baz znanja. Imamo veliko dokumentacije in zaposleni izgubijo veliko časa.',
  },
  {
    firstName: 'Tina',
    lastName: 'Kovač',
    company: 'Petrol d.d.',
    title: 'Head of Sales B2B',
    industry: 'energetika, B2B prodaja, fleet management',
    gender: 'female',
    theirMessage: 'Imamo 200+ B2B kupcev. Iščemo način, kako bolje prepoznati priložnosti za up-sell in upravljati odnose - kar imamo v CRM-u, ni dovolj uporabno za prodajno ekipo.',
  },
  {
    firstName: 'Jure',
    lastName: 'Zupan',
    company: 'NLB d.d.',
    title: 'CFO',
    industry: 'bančništvo, finance',
    theirMessage: 'Pregled stroškov in priprava finančnih poročil traja predolgo. Zanimam se, kje konkretno bi AI lahko skrajšal čas, ne pa povečal tveganja.',
  },
];

async function main() {
  const outDir = path.join(__dirname, 'test-output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  for (const lead of TEST_LEADS) {
    console.log(`\n=== Generating: ${lead.company} (${lead.title}) ===`);
    try {
      const { html, slug, persona, theme } = await buildProposalHTML(lead);
      const filename = `${slug}-${persona}.html`;
      const filepath = path.join(outDir, filename);
      fs.writeFileSync(filepath, html);
      console.log(`✓ Saved: ${filepath} (persona=${persona}, theme=${theme}, ${html.length} bytes)`);
    } catch (err) {
      console.error(`✗ Failed for ${lead.company}:`, err.message);
      console.error(err.stack);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
