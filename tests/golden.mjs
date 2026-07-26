// Golden snapshot pivotu.
//   node golden.mjs --write   → vygeneruje/prepíše pivot_golden.json
//   node golden.mjs           → porovná; rozdiel = exit 1
//
// Snapshot je zámerne postavený na VYRENDEROVANOM texte, nie na signatúre
// buildPivotData() — je tak odolný voči refaktoru vnútra, ale citlivý na
// akúkoľvek zmenu čísel, ktoré vidí používateľ.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApp, norm, appVersion } from './lib/dom.mjs';
import { seed } from './lib/seed.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN = path.join(HERE, 'pivot_golden.json');
const WRITE = process.argv.includes('--write');

const { doc, E } = await loadApp(seed);

// Kontajner pivotu — overené: grep -n 'id="piv' ../index.html → <table id="pivot-tbl">
// (naplní ho funkcia renderPivot(), ktorá je volaná nižšie).
const PIVOT_IDS = ['pivot-tbl'];

function snapshot() {
  try { E('renderPivot()'); } catch (e) { /* render sa mohol vykonať už pri štarte */ }

  let el = null, usedId = null;
  for (const id of PIVOT_IDS) {
    const c = doc.getElementById(id);
    if (c) { el = c; usedId = id; break; }
  }
  if (!el) {
    console.error('✗ Nenašiel som kontajner pivotu. Uprav PIVOT_IDS v golden.mjs.');
    console.error('  Tip: grep -n \'id="piv\' ../index.html');
    process.exit(2);
  }

  return {
    version: appVersion(),
    container: usedId,
    // riadky tabuľky ako pole normalizovaných reťazcov — diff je čitateľný
    rows: [...el.querySelectorAll('tr')].map(tr =>
      [...tr.children].map(td => norm(td.textContent)).join(' | ')
    ),
    text: norm(el.textContent)
  };
}

const snap = snapshot();

if (WRITE) {
  fs.writeFileSync(GOLDEN, JSON.stringify(snap, null, 2) + '\n');
  console.log(`✓ golden zapísaný (${snap.rows.length} riadkov, kontajner #${snap.container}, ${snap.version})`);
  process.exit(0);
}

if (!fs.existsSync(GOLDEN)) {
  console.error('✗ pivot_golden.json neexistuje. Spusti: npm run golden');
  process.exit(2);
}

const gold = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));

// verziu z porovnania vynechávame — mení sa každý build zámerne
const a = { ...gold, version: undefined };
const b = { ...snap, version: undefined };

if (JSON.stringify(a) === JSON.stringify(b)) {
  console.log(`✓ golden pivot identický (${snap.rows.length} riadkov)`);
  process.exit(0);
}

console.error('✗ GOLDEN PIVOT SA ZMENIL\n');
const max = Math.max(gold.rows.length, snap.rows.length);
for (let i = 0; i < max; i++) {
  const g = gold.rows[i] ?? '(chýba)';
  const s = snap.rows[i] ?? '(chýba)';
  if (g !== s) {
    console.error(`  riadok ${i}:`);
    console.error(`    bolo:  ${g}`);
    console.error(`    teraz: ${s}`);
  }
}
console.error('\nAk je zmena zámerná: npm run golden  (a uveď dôvod v commit message).');
process.exit(1);
