// Testovacia sada pre b-mail parser (Fáza B, krok 2).
//
// Vzniká ZÁMERNE SKÔR než parser — z iba šiestich vzoriek vypadlo dvanásť pascí
// (docs/finTB_zber_dat_analyza.md §4.4), takže sada je akceptačné kritérium, nie dodatok.
// Nedotýka sa index.html ani appky; testuje modul workera.
//
// Spustenie:  npm run bmail
//
// Kým `fintb_worker/bmail.mjs` neexistuje, sada vypíše kontrakt, ktorý má parser splniť,
// a skončí nenulovým kódom. To je očakávaný stav pred napísaním parsera.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expected, merchantTailCases } from './bmail/expected.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, 'bmail', 'fixtures');
const PARSER = process.env.FINTB_BMAIL || path.resolve(HERE, '../fintb_worker/bmail.mjs');

let pass = 0, fail = 0;
// Ktoré pasce zo §4.4 sú práve overované — na záverečnú tabuľku pokrytia.
const traps = new Map();
const ok = (name, cond, detail = '', trap = null) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
  if (trap != null) {
    for (const t of [].concat(trap)) traps.set(t, (traps.get(t) !== false) && cond);
  }
};

const TRAP_NAZVY = {
  1: 'dva desatinné oddeľovače (čiarka vs bodka)',
  2: 'to isté pole pod dvoma názvami (Cislo/Meno karty)',
  3: 'protistrana pod dvoma názvami (Informacia/Referencia)',
  4: 'hodnota NOT PROVIDED',
  5: 'kolísajúca veľkosť písmen',
  6: 'kolísajúca diakritika (typ 6)',
  7: 'typ 6 má ID= v tele, ale nie je transakcia',
  8: 'tri rôzne tvary ID',
  9: 'obchodníka nemožno splitnúť na čiarke',
  10: 'čas 00:00 pri systémovej udalosti',
  11: 'pätička na každom maile',
  12: 'platba kartou na účte má iný tvar',
};

// Lokálny formát — ZÁMERNE nie toISOString(), ten by v CE(S)T posunul deň.
const p2 = n => String(n).padStart(2, '0');
const fmtDateTime = d => d instanceof Date && !isNaN(d)
  ? `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`
  : String(d);
const fmtDate = d => d instanceof Date && !isNaN(d)
  ? `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
  : String(d);

function readFixture(name) {
  const raw = fs.readFileSync(path.join(FIXTURES, name + '.txt'), 'utf8');
  const nl = raw.indexOf('\n');
  const first = raw.slice(0, nl).trim();
  if (!first.toLowerCase().startsWith('subject:')) {
    throw new Error(`fixture ${name}: prvý riadok musí byť "Subject: …"`);
  }
  return { subject: first.slice(8).trim(), body: raw.slice(nl + 1).replace(/^\r?\n/, '') };
}

function kontraktAVypadni(dovod) {
  console.error(`\n✗ Parser sa nedá načítať: ${dovod}\n`);
  console.error(`Očakáva sa modul ${path.relative(process.cwd(), PARSER)} s exportom:\n`);
  console.error(`    export function parseBmail({ subject, body }) → záznam | null\n`);
  console.error('Záznam (chýbajúci text = \'\', chýbajúce číslo = null):');
  console.error('    bmId, bmType 1..6, bmSrc \'acct\'|\'card\', kind \'tx\'|\'statement\',');
  console.error('    date (Date), amount (± číslo, null pri statement),');
  console.error('    merchant, note, counterAccount, vs, cardNo, status,');
  console.error('    balAcct, balCurrent, balAvail   — len bmSrc===\'acct\'');
  console.error('    cardAvail                       — len bmSrc===\'card\'');
  console.error('    stmtDue, stmtMinPayment, stmtDueDate (Date) — len typ 6\n');
  console.error('Doplnkovo: export function parseMerchant(popisTransakcie) → { merchant, status }');
  console.error('(odstrihnutie chvosta od konca, §4.4 pasca 9).\n');
  console.error('Toto je očakávaný stav, kým parser nevznikne — sada je akceptačné kritérium.');
  process.exit(1);
}

let parseBmail, parseMerchant;
if (!fs.existsSync(PARSER)) kontraktAVypadni('súbor neexistuje');
try {
  const m = await import(path.sep === '\\' ? 'file:///' + PARSER.replace(/\\/g, '/') : PARSER);
  parseBmail = m.parseBmail; parseMerchant = m.parseMerchant;
} catch (e) {
  kontraktAVypadni(e.message);
}
if (typeof parseBmail !== 'function') kontraktAVypadni('chýba export parseBmail()');

console.log('finTB — b-mail parser, testovacia sada\n');

// ── 1. Šesť typov z katalógu §4.1 ───────────────────────────────────────────
// Pasca 8 (tri tvary ID) a 11 (pätička) sa overujú naprieč všetkými vzorkami.
const POLIA_TEXT = ['bmId', 'bmSrc', 'kind', 'merchant', 'note', 'counterAccount', 'vs', 'cardNo', 'status'];
const POLIA_CISLO = ['amount', 'balAcct', 'balCurrent', 'balAvail', 'cardAvail', 'stmtDue', 'stmtMinPayment'];
// Ktorá vzorka drží ktorú pascu (na tabuľku pokrytia).
const PASCE_VZORKY = {
  '01-debet-prevod': [1, 3], '02-debet-karta': [12], '03-kredit': [3, 4, 5],
  '04-debet-kreditka': [1, 5, 9], '05-uhrada-kreditka': [2, 10], '06-uzavierka': [6, 7],
};

for (const [name, exp] of Object.entries(expected)) {
  console.log(`\n${name}`);
  const trap = PASCE_VZORKY[name] || null;
  let rec;
  try { rec = parseBmail(readFixture(name)); }
  catch (e) { ok(`${name}: parser nespadol`, false, e.message, trap); continue; }

  if (!rec) { ok(`${name}: parser vrátil záznam`, false, 'vrátil null', trap); continue; }

  ok('typ správy', rec.bmType === exp.bmType, `${rec.bmType} ≠ ${exp.bmType}`, trap);

  for (const f of POLIA_TEXT) {
    const got = rec[f] === undefined ? '«undefined»' : rec[f];
    ok(`${f} = ${JSON.stringify(exp[f])}`, got === exp[f], `dostal ${JSON.stringify(got)}`,
       f === 'bmId' ? 8 : f === 'cardNo' && name === '05-uhrada-kreditka' ? 2 : trap);
  }
  for (const f of POLIA_CISLO) {
    if (exp[f] === undefined) continue;
    const got = rec[f] === undefined ? '«undefined»' : rec[f];
    const same = exp[f] === null ? got === null : (typeof got === 'number' && Math.abs(got - exp[f]) < 0.0001);
    ok(`${f} = ${exp[f]}`, same, `dostal ${JSON.stringify(got)}`, f === 'amount' ? trap : null);
  }

  ok(`date = ${exp.date}`, fmtDateTime(rec.date) === exp.date, `dostal ${fmtDateTime(rec.date)}`, trap);
  if (exp.stmtDueDate) {
    ok(`stmtDueDate = ${exp.stmtDueDate}`, fmtDate(rec.stmtDueDate) === exp.stmtDueDate,
       `dostal ${fmtDate(rec.stmtDueDate)}`, 7);
  }

  // Pasca 11 — pätička sa nesmie dostať do žiadneho textového poľa.
  const zPaticky = ['tatrabanka.sk', 'vygenerovana automaticky', 'notifikacie po precitani', 'neodpovedajte'];
  const zasiahnute = POLIA_TEXT.filter(f => {
    const v = String(rec[f] || '').toLowerCase();
    return zPaticky.some(s => v.includes(s));
  });
  ok('pätička sa nedostala do dát', zasiahnute.length === 0, `v poliach: ${zasiahnute.join(', ')}`, 11);
}

// ── 2. Pasca 7 — typ 6 nesmie vyrobiť transakciu ────────────────────────────
console.log('\ntyp 6 — uzávierka nie je transakcia');
{
  // Parser môže vrátiť null (napr. nerozpozná typ 6) — to je zlyhanie testu,
  // nie dôvod, aby spadla celá sada.
  const rec = parseBmail(readFixture('06-uzavierka'));
  if (!rec) {
    ok('uzávierka sa rozpozná', false, 'parser vrátil null', [7, 8]);
  } else {
    ok('kind je "statement", nie "tx"', rec.kind === 'statement', `kind=${rec.kind}`, 7);
    ok('amount je null (žiadny pohyb)', rec.amount === null, `amount=${rec.amount}`, 7);
    ok('bmId je z TELA, nie z predmetu', rec.bmId === '44120001', `bmId=${rec.bmId}`, [7, 8]);
  }
}

// ── 3. Pasca 8 — tri tvary ID nesmú kolidovať ───────────────────────────────
console.log('\ntvary ID a kolízie kľúčov');
{
  const mena = Object.keys(expected);
  const surove = mena.map(n => parseBmail(readFixture(n)));
  const chybajuce = mena.filter((_, i) => !surove[i]);
  ok('každá vzorka dala záznam', chybajuce.length === 0, `null pri: ${chybajuce.join(', ')}`);
  const vsetky = surove.filter(Boolean);
  const kluce = vsetky.map(r => `${r.bmSrc}|${r.bmId}`);
  ok('žiadne dva záznamy nemajú rovnaký kľúč', new Set(kluce).size === kluce.length,
     `kľúče: ${kluce.join(' , ')}`, 8);
  ok('bmSrc je vyplnený vždy', vsetky.length > 0 && vsetky.every(r => r.bmSrc === 'acct' || r.bmSrc === 'card'),
     `dostal: ${vsetky.map(r => r.bmSrc).join(',')}`);
  // §4.3 — „disponibilný zostatok" má na účte a na karte opačný význam.
  ok('účtové záznamy nemajú cardAvail', vsetky.filter(r => r.bmSrc === 'acct').every(r => r.cardAvail === null));
  ok('kartové záznamy nemajú balAcct', vsetky.filter(r => r.bmSrc === 'card').every(r => r.balAcct === null));
}

// ── 4. Pasca 5 — routing nesmie závisieť od veľkosti písmen ─────────────────
console.log('\nrouting podľa predmetu');
{
  const f = readFixture('01-debet-prevod');
  const a = parseBmail({ subject: f.subject.toUpperCase(), body: f.body });
  const b = parseBmail({ subject: f.subject.toLowerCase(), body: f.body });
  ok('VEĽKÉ písmená v predmete → ten istý typ', a && a.bmType === 1, `dostal ${a && a.bmType}`, 5);
  ok('malé písmená v predmete → ten istý typ', b && b.bmType === 1, `dostal ${b && b.bmType}`, 5);
}

// ── 5. Pasca 9 — chvost obchodníka sa odstrihuje od konca ───────────────────
console.log('\nmeno obchodníka (odstrihnutie chvosta od konca)');
if (typeof parseMerchant !== 'function') {
  ok('export parseMerchant() existuje', false, 'chýba — §4.4 pasca 9', 9);
} else {
  for (const c of merchantTailCases) {
    const r = parseMerchant(c.vstup) || {};
    const znacka = c.neoverene ? ' [neoverené na reálnej vzorke]' : '';
    ok(`${c.popis}${znacka} → ${JSON.stringify(c.merchant)}`, r.merchant === c.merchant,
       `dostal ${JSON.stringify(r.merchant)}`, c.neoverene ? null : 9);
    ok(`${c.popis} → stav ${JSON.stringify(c.status)}`, r.status === c.status,
       `dostal ${JSON.stringify(r.status)}`, c.neoverene ? null : 9);
  }
}

// ── 6. Neznáma správa sa nesmie tváriť ako transakcia ───────────────────────
console.log('\nodolnosť');
{
  const cudzia = parseBmail({ subject: 'Newsletter november', body: 'Suma: 100,00 EUR\nID=999' });
  ok('neznámy predmet → null (nie fantómová transakcia)', cudzia === null,
     `dostal ${JSON.stringify(cudzia)}`, 7);
  const prazdna = parseBmail({ subject: '', body: '' });
  ok('prázdna správa → null', prazdna === null, `dostal ${JSON.stringify(prazdna)}`);
}

// ── Tabuľka pokrytia pascí zo §4.4 ──────────────────────────────────────────
console.log('\n── pokrytie pascí §4.4 ──');
let nepokryte = 0;
for (let i = 1; i <= 12; i++) {
  const st = traps.get(i);
  if (st === undefined) { nepokryte++; console.log(`  ?  ${i}. ${TRAP_NAZVY[i]} — NEPOKRYTÁ`); }
  else console.log(`  ${st ? '✓' : '✗'}  ${i}. ${TRAP_NAZVY[i]}`);
}

console.log(`\n${pass} prešlo, ${fail} zlyhalo${nepokryte ? `, ${nepokryte} pascí nepokrytých` : ''}`);
process.exit(fail || nepokryte ? 1 : 0);
