// Smoke testy — appka sa naštartuje a invarianty dátového modelu držia.
//
// ⚠️ PRVÝ BEH: názvy kľúčov v lib/seed.mjs a niektoré ID elementov je nutné overiť
//    proti skutočnej appke. Test, ktorý zlyhá kvôli zlému názvu, hlási TODO.
import { loadApp, appVersion } from './lib/dom.mjs';
import { seed } from './lib/seed.mjs';

// Testy nižšie stavajú transakcie v aktuálnom mesiaci (rovnako ako seed) —
// anMonth sa inicializuje z new Date().getMonth().
const _now = new Date();
const Y = _now.getFullYear();
const M = _now.getMonth();

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
};

const { w, doc, E } = await loadApp(seed);

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
  // --- 4. eDate rešpektuje dateOverride (t8: date=deň 25, dateOverride=deň 10) ---
  const eD = E('localDateKey(eDate(TX.find(t=>t.id==="t8")))');
  ok('eDate() použije dateOverride', /-10$/.test(eD), `dostal: ${eD}`);

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

  // --- 10. v160/A: sync claim NESMIE zobrať transakciu kreditky ---
  // Kreditka nemá pole `bank`, takže txBank() jej vráti 'tatra' — pred v160 ju sync
  // claimol, účtová tx sa nepridala a zostatok účtu o ňu ticho prišiel.
  const claimA = E(`(function(){
    var d = new Date(${Y}, ${M}, 14);
    var cc = { id:'cc_probe', source:'credit_card', date:d, amount:-25, merchant:'KAVIAREN', isSettled:true };
    TX.push(cc);
    var before = TX.length;
    var res = _syncApply([{ transactionId:'BANK_A1', transactionState:'BOOKED',
      bookingDate:'${Y}-${String(M+1).padStart(2,'0')}-14',
      transactionAmount:{amount:-25,currency:'EUR'}, creditorName:'Nieco ine' }]);
    var out = { ccTagged: !!cc.tbId, added: res.added, claimed: res.claimed, grew: TX.length-before };
    TX = TX.filter(function(t){ return t.id!=='cc_probe' && t.tbId!=='BANK_A1'; });
    return JSON.stringify(out);
  })()`);
  const A = JSON.parse(claimA);
  ok('sync neoznačí tx kreditky (chyba A)', A.ccTagged === false, `ccTagged=${A.ccTagged}`);
  ok('sync namiesto claimu pridá účtovú tx', A.added === 1 && A.claimed === 0,
     `added=${A.added} claimed=${A.claimed}`);

  // --- 11. v160/B: import doplní meno do sync placeholderu namiesto duplikátu ---
  const enrichB = E(`(function(){
    var d = new Date(${Y}, ${M}, 16);
    var ph = { id:'ph_probe', source:'account', date:d, amount:-42.10,
               merchant:'Kartová platba', syncPlaceholder:true, syncAdded:true, tbId:'BANK_B1' };
    TX.push(ph);
    var before = TX.length;
    var r = mergeTransactions([{ source:'account', date:new Date(${Y}, ${M}, 16),
                                 amount:-42.10, merchant:'ALZA.SK' }], 'account');
    var out = { grew: TX.length-before, added: r.added, enriched: r.enriched,
                merchant: ph.merchant, ph: !!ph.syncPlaceholder, tbId: ph.tbId };
    TX = TX.filter(function(t){ return t.id!=='ph_probe'; });
    return JSON.stringify(out);
  })()`);
  const B = JSON.parse(enrichB);
  ok('import nepridá duplikát k sync placeholderu (chyba B)', B.grew === 0 && B.added === 0,
     `TX narástlo o ${B.grew}, added=${B.added}`);
  ok('import doplní meno obchodníka', B.merchant === 'ALZA.SK' && B.ph === false,
     `merchant=${B.merchant} placeholder=${B.ph}`);
  ok('obohatenie zachová tbId', B.tbId === 'BANK_B1', `tbId=${B.tbId}`);

  // --- 12. v161: re-import NESMIE zdvojiť platbu rozdelenú medzi mesiace ---
  // Rozdelenie zmení sumy častí (−300 → 3× −100), takže kľúč dátum+suma+obchodník
  // pôvodný riadok vo výpise minie a import ho pridal znova → zostatok +300.
  const msAcc = E(`(function(){
    var d = new Date(${Y}, ${M}, 9);
    var gid = 'ms_test';
    ['1/3','2/3','3/3'].forEach(function(p,i){
      TX.push({ id:'ms_'+i, source:'account', date:d, amount:-100, merchant:'POISTOVNA',
                monthSplitGroup:gid, monthSplitPart:p });
    });
    var before = TX.length;
    var bal0 = accountBalance('tatra');
    var r = mergeTransactions([{ source:'account', date:new Date(${Y}, ${M}, 9),
                                 amount:-300, merchant:'POISTOVNA' }], 'account');
    var out = { grew: TX.length-before, added: r.added, msCovered: r.msCovered,
                balDrift: Math.round((accountBalance('tatra')-bal0)*100)/100 };
    TX = TX.filter(function(t){ return t.monthSplitGroup!==gid && !(t.merchant==='POISTOVNA'); });
    return JSON.stringify(out);
  })()`);
  const MS = JSON.parse(msAcc);
  ok('re-import nezdvojí rozdelenú platbu (účet)', MS.grew === 0 && MS.added === 0,
     `TX narástlo o ${MS.grew}, added=${MS.added}`);
  ok('zostatok účtu sa re-importom nezmení', MS.balDrift === 0, `posun: ${MS.balDrift} €`);
  ok('rozdelená platba sa vykáže ako pokrytá', MS.msCovered === 1, `msCovered=${MS.msCovered}`);

  // to isté pre kreditku (čerpanie)
  const msCC = E(`(function(){
    var d = new Date(${Y}, ${M}, 11);
    var gid = 'ms_cc';
    ['1/2','2/2'].forEach(function(p,i){
      TX.push({ id:'mscc_'+i, source:'credit_card', isSettled:true, date:d, amount:-75,
                merchant:'ELEKTRO', monthSplitGroup:gid, monthSplitPart:p });
    });
    var before = TX.length;
    var r = mergeTransactions([{ source:'credit_card', isSettled:true,
                                 date:new Date(${Y}, ${M}, 11), amount:-150, merchant:'ELEKTRO' }], 'credit_card');
    var out = { grew: TX.length-before, added: r.added, msCovered: r.msCovered };
    TX = TX.filter(function(t){ return t.monthSplitGroup!==gid; });
    return JSON.stringify(out);
  })()`);
  const MC = JSON.parse(msCC);
  ok('re-import nezdvojí rozdelenú platbu (kreditka)', MC.grew === 0 && MC.added === 0,
     `TX narástlo o ${MC.grew}, added=${MC.added}`);
}

// --- 10. žiadne nezachytené chyby v konzole ---
console.log(`\n${pass} prešlo, ${fail} zlyhalo`);
process.exit(fail ? 1 : 0);
