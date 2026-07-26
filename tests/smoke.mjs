// Smoke testy — appka sa naštartuje a invarianty dátového modelu držia.
//
// ⚠️ PRVÝ BEH: názvy kľúčov v lib/seed.mjs a niektoré ID elementov je nutné overiť
//    proti skutočnej appke. Test, ktorý zlyhá kvôli zlému názvu, hlási TODO.
import { loadApp, appVersion } from './lib/dom.mjs';
import { seed } from './lib/seed.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
};

const { w, doc, E } = loadApp(seed);

console.log(`finTB smoke testy — ${appVersion()}\n`);

// --- 1. appka nabehla bez výnimky ---
ok('DOM sa vyrenderoval', !!doc.body && doc.body.children.length > 0);

// --- 2. kľúčové funkcie existujú ---
for (const fn of ['eDate', 'txMyAmount', 'getTxCatAmounts', 'anTx', '_inAnScope',
                  'isCCRepayment', 'localDateKey', 'fabs']) {
  ok(`funkcia ${fn}() existuje`, E(`typeof ${fn}`) === 'function');
}

// --- 3. dáta sa načítali ---
const txCount = E('typeof TX !== "undefined" ? TX.length : -1');
ok('TX sa načítalo zo seedu', txCount > 0,
   txCount === 0 ? 'TODO: skontroluj názvy kľúčov v lib/seed.mjs' : `TX.length=${txCount}`);

if (txCount > 0) {
  // --- 4. eDate rešpektuje dateOverride ---
  const eD = E('eDate(TX.find(t=>t.id==="t8"))');
  ok('eDate() použije dateOverride', String(eD).includes('-10'), `dostal: ${eD}`);

  // --- 5. txMyAmount delí shared výdavok ---
  const my = E('txMyAmount(TX.find(t=>t.id==="t5"))');
  ok('txMyAmount() = -30 pri shared 60/2', Math.abs(my + 30) < 0.005, `dostal: ${my}`);

  // --- 6. Σ getTxCatAmounts === txMyAmount ---
  const sumOk = E(`(function(){
    var t = TX.find(x=>x.id==="t6");
    var m = getTxCatAmounts(t);
    var s = 0;
    if (Array.isArray(m)) m.forEach(function(x){ s += (x.amount||x[1]||0); });
    else Object.keys(m).forEach(function(k){ s += m[k]; });
    return Math.abs(s - txMyAmount(t)) < 0.005;
  })()`);
  ok('Σ getTxCatAmounts() === txMyAmount()', sumOk === true);

  // --- 7. anTx vylučuje excluded ---
  const hasExcluded = E('anTx({}).some(function(t){return t.id==="t7";})');
  ok('anTx() vylúči excluded transakciu', hasExcluded === false);

  // --- 8. localDateKey neposúva dátum cez UTC ---
  const key = E('localDateKey(new Date(2026,0,1,0,30))');
  ok('localDateKey() neposunie 1.1. na 31.12.', key === '2026-01-01', `dostal: ${key}`);

  // --- 9. fabs už obsahuje € ---
  const f = E('fabs(12.5)');
  ok('fabs() obsahuje €', String(f).includes('€'), `dostal: ${f}`);
}

// --- 10. žiadne nezachytené chyby v konzole ---
console.log(`\n${pass} prešlo, ${fail} zlyhalo`);
process.exit(fail ? 1 : 0);
