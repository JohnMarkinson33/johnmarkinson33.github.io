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

// --- 13. v162: import pohybov na účte z CSV (Tatra) ---
if (E('typeof parseAccCSV') === 'function') {
  const CSV = [
    '"Dátum spracovania","Dátum zúčtovania",Suma,Mena,Typ,"Predčíslie","Číslo účtu","Kód banky",IBAN,"Variabilný symbol","Špecifický symbol","Konštantný symbol","Referencia platiteľa","Informácia pre príjemcu",Popis',
    '29.05.2026,29.05.2026,"121,00",EUR,Kredit,,1801044112, 200,SK2902000000001801044112,202606,,,/VS202606/SS/KS,,PLATBA 0200/000000-1801044112',
    '30.05.2026,30.05.2026,"22,00",EUR,Debet,,  93389333,6500,SK5465000000000093389333,,,,,"Diaľničná známka a parkovanie",Platba 6500/000000-0093389333'
  ].join('\n');
  const P = JSON.parse(E(`JSON.stringify(parseAccCSV(${JSON.stringify(CSV)}).map(function(t){
    return { d: localDateKey(t.date), a: t.amount, m: t.merchant, iban: t.iban, vs: t.vs, src: t.source };
  }))`));
  ok('CSV: parsne oba riadky', P.length === 2, `dostal ${P.length}`);
  ok('CSV: znamienko podľa stĺpca Typ', P[0] && P[1] && P[0].a === 121 && P[1].a === -22,
     `dostal ${P[0] && P[0].a} / ${P[1] && P[1].a}`);
  ok('CSV: dátum bez UTC posunu', P[0] && P[0].d === '2026-05-29' && P[1].d === '2026-05-30',
     `dostal ${P[0] && P[0].d} / ${P[1] && P[1].d}`);
  ok('CSV: diakritika z UTF-8 prežila', P[1] && P[1].m === 'Diaľničná známka a parkovanie',
     `merchant=${P[1] && P[1].m}`);
  ok('CSV: IBAN a VS sa prenesú', P[0] && P[0].iban === 'SK2902000000001801044112' && P[0].vs === '202606',
     `iban=${P[0] && P[0].iban} vs=${P[0] && P[0].vs}`);
  ok('CSV: kartový info reťazec dá miesto a masku karty',
     E(`JSON.stringify(_accCsvCardInfo('440577******0450 TALLINN 20260428 23:36:57 7.90EUR'))`)
       === '{"cardNo":"440577******0450","place":"TALLINN"}');
  ok('CSV: bežná poznámka sa nepovažuje za kartu',
     E(`String(_accCsvCardInfo('Diaľničná známka a parkovanie'))`) === 'null');

  // Výpis účtu chodí v UTF-8, výpis kreditky vo windows-1250 — dekóder si musí vybrať sám,
  // inak by z jedného z nich vypadla mojibake („DÃ¡tum" / „Z?????tovan?").
  w.__encUtf8 = new Uint8Array(Buffer.from('Zúčtovaná', 'utf8'));
  w.__encCp = new Uint8Array([0x5A, 0xFA, 0xE8, 0x74, 0x6F, 0x76, 0x61, 0x6E, 0xE1]);
  ok('_decodeCsv rozpozná UTF-8', E(`_decodeCsv(__encUtf8)`) === 'Zúčtovaná',
     `dostal ${E(`_decodeCsv(__encUtf8)`)}`);
  ok('_decodeCsv rozpozná windows-1250', E(`_decodeCsv(__encCp)`) === 'Zúčtovaná',
     `dostal ${E(`_decodeCsv(__encCp)`)}`);
  ok('parseAccCSV zvládne BOM na začiatku',
     JSON.parse(E(`JSON.stringify(parseAccCSV('\\uFEFF'+${JSON.stringify(CSV)}).length)`)) === 2);

  // Jadro rizika: tá istá platba z XLS a z CSV má INÝ merchant string (CSV nemá stĺpec
  // Príjemca). Bez zhody cez protiúčet by import pridal duplikát a nafúkol zostatok —
  // rovnaká trieda chyby ako v160/v161.
  const cf = JSON.parse(E(`(function(){
    var IBAN='SK5465000000000093389333';
    TX.push({ id:'cf_xls', source:'account', date:new Date(${Y}, ${M}, 12), amount:-49.9,
              merchant:'AZIFOOD S.R.O.', iban:IBAN, vs:'' });
    var before=TX.length, bal0=accountBalance('tatra');
    var r=mergeTransactions([{ source:'account', date:new Date(${Y}, ${M}, 12), amount:-49.9,
                               merchant:'Azifood', iban:IBAN, vs:'' }], 'account');
    var ex=TX.find(function(t){ return t.id==='cf_xls'; });
    var out={ grew:TX.length-before, added:r.added, crossFmt:r.crossFmt,
              merchant:ex&&ex.merchant,
              balDrift:Math.round((accountBalance('tatra')-bal0)*100)/100 };
    TX=TX.filter(function(t){ return t.id!=='cf_xls'; });
    return JSON.stringify(out);
  })()`));
  ok('CSV nad XLS: nepridá duplikát', cf.grew === 0 && cf.added === 0,
     `TX narástlo o ${cf.grew}, added=${cf.added}`);
  ok('CSV nad XLS: zostatok sa nepohne', cf.balDrift === 0, `posun: ${cf.balDrift} €`);
  ok('CSV nad XLS: vykáže sa ako zhoda naprieč formátmi', cf.crossFmt === 1, `crossFmt=${cf.crossFmt}`);
  ok('CSV nad XLS: bohatší názov z XLS sa neprepíše', cf.merchant === 'AZIFOOD S.R.O.',
     `merchant=${cf.merchant}`);

  // Opačný smer: rôzny VS = iná platba, tú spárovať NESMIE.
  const cfVs = JSON.parse(E(`(function(){
    var IBAN='SK9911110000000000001234';
    TX.push({ id:'cf_vs', source:'account', date:new Date(${Y}, ${M}, 13), amount:-30,
              merchant:'NAJOM', iban:IBAN, vs:'1001' });
    var before=TX.length;
    var r=mergeTransactions([{ source:'account', date:new Date(${Y}, ${M}, 13), amount:-30,
                               merchant:'Najom byt', iban:IBAN, vs:'2002' }], 'account');
    var out={ grew:TX.length-before, added:r.added, crossFmt:r.crossFmt };
    TX=TX.filter(function(t){ return t.id!=='cf_vs' && t.merchant!=='Najom byt'; });
    return JSON.stringify(out);
  })()`));
  ok('rôzny VS sa nespáruje ako ten istý pohyb', cfVs.added === 1 && cfVs.crossFmt === 0,
     `added=${cfVs.added}, crossFmt=${cfVs.crossFmt}`);

  // Bez protiúčtu (napr. kartová platba) nie je na čom párovať → musí pribudnúť normálne.
  const cfNoIban = JSON.parse(E(`(function(){
    TX.push({ id:'cf_ni', source:'account', date:new Date(${Y}, ${M}, 14), amount:-12.5,
              merchant:'BILLA 113', iban:'' });
    var before=TX.length;
    var r=mergeTransactions([{ source:'account', date:new Date(${Y}, ${M}, 14), amount:-12.5,
                               merchant:'TESCO', iban:'' }], 'account');
    var out={ grew:TX.length-before, added:r.added, crossFmt:r.crossFmt };
    TX=TX.filter(function(t){ return t.id!=='cf_ni' && t.merchant!=='TESCO'; });
    return JSON.stringify(out);
  })()`));
  ok('bez IBAN sa nepáruje naslepo', cfNoIban.added === 1 && cfNoIban.crossFmt === 0,
     `added=${cfNoIban.added}, crossFmt=${cfNoIban.crossFmt}`);
}

// --- 10. žiadne nezachytené chyby v konzole ---
console.log(`\n${pass} prešlo, ${fail} zlyhalo`);
process.exit(fail ? 1 : 0);
