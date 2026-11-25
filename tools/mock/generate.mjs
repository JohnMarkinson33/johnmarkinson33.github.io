#!/usr/bin/env node
// Generátor mock dát pre finTB — výstup je ZÁLOHA (Dáta → ☁ Záloha → ↑ Import zálohy),
// nie bankový výpis. Len záloha nesie budgety, ciele, pravidlá a opakované platby.
//
//   node tools/mock/generate.mjs                 → tools/mock/fintb_mock.json
//   node tools/mock/generate.mjs 2027-03-15      → dáta ukotvené k inému dňu
//   node tools/mock/generate.mjs --out /cesta.json
//
// Dátumy sú RELATÍVNE k dnešku, takže po čase treba pregenerovať — inak „aktuálny
// mesiac" v appke vyjde prázdny. Generátor je deterministický (seedovaný RNG),
// takže rovnaký deň = rovnaký výstup.
//
// Tvar payloadu kopíruje exportBackup() (version 5). Pri zmene zálohy v index.html
// treba upraviť aj tento súbor.

import fs from 'node:fs';
import path from 'node:path';

// ── argumenty ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const OUT = outIdx >= 0 ? args[outIdx + 1] : path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'fintb_mock.json');
const anchorArg = args.find(a => !a.startsWith('--') && a !== args[outIdx + 1]);
const ANCHOR = anchorArg ? new Date(anchorArg) : new Date();
if (isNaN(ANCHOR)) { console.error('Neplatný dátum:', anchorArg); process.exit(1); }

const MESIACOV = 14;              // koľko mesiacov histórie (kvôli ročnému pivotu a porovnaniu rokov)

// ── deterministický RNG ─────────────────────────────────────────────────────
let _s = 20261125;
const rnd = () => { _s |= 0; _s = _s + 0x6D2B79F5 | 0; let t = Math.imul(_s ^ _s >>> 15, 1 | _s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));            // celé číslo <a,b>
const rf = (a, b, dec = 2) => +(a + rnd() * (b - a)).toFixed(dec);   // desatinné
const pick = arr => arr[Math.floor(rnd() * arr.length)];
const maybe = p => rnd() < p;

// ── dátumy ──────────────────────────────────────────────────────────────────
// Hodina 10:00 UTC je zámer: v CE(S)T je to 11:00/12:00, takže kalendárny deň
// vyjde rovnako v UTC aj lokálne a nevzniká posun cez polnoc (invariant localDateKey).
const Y = ANCHOR.getFullYear(), M = ANCHOR.getMonth(), DNES = ANCHOR.getDate();
function iso(monthsBack, day, h = 10) {
  const y = Y, m = M - monthsBack;
  const posledny = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, posledny), h, 0, 0)).toISOString();
}
const ym = monthsBack => { const d = new Date(Date.UTC(Y, M - monthsBack, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
const dayKey = isoStr => isoStr.slice(0, 10);
// V aktuálnom mesiaci negenerujeme dni v budúcnosti.
const maxDen = mb => mb === 0 ? DNES : 28;

// ── kategórie ───────────────────────────────────────────────────────────────
// BUILTIN sa preberajú tak, ako sú v appke (testovacie dáta s nimi nesmú kolidovať).
const BUILTIN = [
  { id: 'potraviny', l: 'Potraviny', c: '#52d97a', builtin: true },
  { id: 'doprava', l: 'Doprava', c: '#5ea8d8', builtin: true },
  { id: 'restauracie', l: 'Reštaurácie', c: '#f0a040', builtin: true },
  { id: 'nakupy', l: 'Nákupy', c: '#9d74d6', builtin: true },
  { id: 'byvanie', l: 'Bývanie', c: '#56b3c0', builtin: true },
  { id: 'zdravie', l: 'Zdravie', c: '#e05c5c', builtin: true },
  { id: 'zabava', l: 'Zábava', c: '#c87dd4', builtin: true },
  { id: 'cestovanie', l: 'Cestovanie', c: '#60d4b0', builtin: true },
  { id: 'sluzby', l: 'Služby', c: '#d47a9a', builtin: true },
  { id: 'sporenie', l: 'Sporenie', c: '#7ab85e', builtin: true },
  { id: 'ostatne', l: 'Ostatné', c: '#4a6070', builtin: true },
];

// Vlastné kategórie — vrátane PODKATEGÓRIÍ (parentId) a investičnej (isInvestment),
// aby sa dal testovať rozbaľovací pivot aj graf investícií.
const C = {
  kava: 'cat_kava_a1', palivo: 'cat_palivo_b2', mhd: 'cat_mhd_c3',
  predplatne: 'cat_predplatne_d4', etf: 'cat_etf_e5', deti: 'cat_deti_f6',
  darceky: 'cat_darceky_g7', vzdelavanie: 'cat_vzdelavanie_h8',
  vyplata: 'cat_vyplata_i9', prijmy: 'cat_prijmy_j0',
};
const customCats = [
  { id: C.kava, l: 'Káva', c: '#b5651d', builtin: false, emoji: '☕', parentId: 'restauracie' },
  { id: C.palivo, l: 'Palivo', c: '#4f87b8', builtin: false, emoji: '⛽', parentId: 'doprava' },
  { id: C.mhd, l: 'MHD', c: '#6fa8dc', builtin: false, emoji: '🚌', parentId: 'doprava' },
  { id: C.predplatne, l: 'Predplatné', c: '#c96a92', builtin: false, emoji: '📺', parentId: 'sluzby' },
  { id: C.darceky, l: 'Darčeky', c: '#8f6ec4', builtin: false, emoji: '🎁', parentId: 'nakupy' },
  { id: C.etf, l: 'ETF portfólio', c: '#3fae7a', builtin: false, emoji: '📈', isInvestment: true },
  { id: C.deti, l: 'Deti', c: '#e8a33d', builtin: false, emoji: '🧒' },
  { id: C.vzdelavanie, l: 'Vzdelávanie', c: '#7f9cc4', builtin: false, emoji: '📚' },
  { id: C.vyplata, l: 'Výplata', c: '#43b36b', builtin: false, emoji: '💰' },
  { id: C.prijmy, l: 'Ostatné príjmy', c: '#69c2a0', builtin: false, emoji: '➕' },
];

// ── obchodníci ──────────────────────────────────────────────────────────────
const OBCH = {
  potraviny: ['BILLA 113 BRATISLAVA', 'LIDL SK 0412', 'TESCO EXPRES', 'KAUFLAND BA PETRZALKA', 'COOP JEDNOTA', 'YEME BA'],
  kava: ['KAVIAREN PRAMEN', 'STARBUCKS AUPARK', 'FIVE POINTS COFFEE', 'URBAN HOUSE'],
  restauracie: ['BISTRO MLYNSKA', 'PIZZA MIZZA', 'SASHIMI SUSHI', 'FOODSTOCK', 'REŠTAURÁCIA U RICHTARA'],
  palivo: ['SLOVNAFT BA RACA', 'OMV SENEC', 'SHELL D1'],
  nakupy: ['ALZA.SK', 'MALL.SK', 'IKEA BRATISLAVA', 'DECATHLON', 'H&M AUPARK', 'DATART'],
  zdravie: ['LEKAREN DR MAX', 'BENU LEKAREN', 'MEDICINA S.R.O.', 'OPTIKA VISION'],
  zabava: ['CINEMA CITY', 'STEAM GAMES', 'KNIHKUPECTVO MARTINUS', 'AQUAPARK SENEC'],
  cestovanie: ['BOOKING.COM', 'RYANAIR', 'REGIOJET', 'AIRBNB'],
  sluzby: ['ORANGE SLOVENSKO', 'SLOVAK TELEKOM', 'POSTA SLOVENSKO', 'CISTIAREN EXPRES'],
  deti: ['MATERSKA SKOLA LIENKA', 'DETSKY SVET', 'KRUZOK PLAVANIE'],
  darceky: ['KVETINARSTVO ORCHIDEA', 'ZLATNICTVO ARIA', 'DARCEKY.SK'],
  vzdelavanie: ['UDEMY', 'KURZY SK', 'MARTINUS ODBORNA'],
};

// ── účty (multibank) ────────────────────────────────────────────────────────
const accounts = [
  { id: 'acc_slsp01', name: 'Slovenská sporiteľňa', purpose: 'Spoločný účet', openingBalance: 640.00, bankType: 'slsp' },
  { id: 'acc_rev01', name: 'Revolut', purpose: 'Cestovanie a online', openingBalance: 185.50, bankType: 'revolut' },
  { id: 'acc_36501', name: '365.bank', purpose: 'Rezerva', openingBalance: 95.00, bankType: 'b365' },
];
const OPENING = 1850.00;   // počiatočný zostatok hlavného účtu (Tatra)

// ── transakcie ──────────────────────────────────────────────────────────────
const TX = [];
let seq = 0;
const nid = () => `tx_mock_${String(++seq).padStart(4, '0')}`;

function tx(o) {
  const t = {
    id: nid(), source: 'account', amount: 0, merchant: '', description: '', info: '',
    place: '', iban: '', vs: '', ref: '', cardNo: '', type: '', category: null, ...o,
  };
  TX.push(t); return t;
}

// Pomocník: bežný výdavok na hlavnom účte
const vydaj = (mb, den, suma, cat, obch, extra = {}) =>
  tx({ date: iso(mb, den), amount: -Math.abs(suma), merchant: obch, category: cat, ...extra });

// Pomocník: transakcia na kreditke
const kartaTx = (mb, den, suma, cat, obch, extra = {}) =>
  tx({
    date: iso(mb, den), amount: -Math.abs(suma), merchant: obch, category: cat,
    source: 'credit_card', isSettled: true, cardNo: '123456******7890',
    dateProcStr: dayKey(iso(mb, Math.min(den + 2, 28))).split('-').reverse().join('.'),
    dateProcParsed: iso(mb, Math.min(den + 2, 28)), status: 'Zúčtovaná', ...extra,
  });

// Koľko sa v ktorom mesiaci minulo na karte — splátka potom spláca PREDCHÁDZAJÚCI
// mesiac, aby zostatok účtu nedriftoval. Bez toho by fixná splátka a skutočné
// čerpanie rozchádzali účet o stovky eur mesačne.
const kartaSpolu = {};

for (let mb = MESIACOV - 1; mb >= 0; mb--) {
  const dmax = maxDen(mb);
  const cap = den => Math.min(den, dmax);
  const je = den => den <= dmax;                 // deň už v tomto mesiaci nastal?

  // ── pravidelné platby (musia sedieť s recurDefs nižšie) ──
  // Výška mzdy je zladená s celkovými výdavkami vrátane dopĺňania sekundárnych účtov,
  // aby zostatok hlavného účtu za 14 mesiacov mierne rástol, nie klesal do mínusu.
  if (je(15)) tx({ date: iso(mb, 15), amount: rf(2290, 2420), merchant: 'ZAMESTNAVATEL S.R.O.', category: C.vyplata, info: 'Mzda za predchadzajuci mesiac', iban: 'SK1109000000005544332211', vs: '202600' });
  if (je(1)) vydaj(mb, 1, 480, 'byvanie', 'SPRAVCA BYTOV S.R.O.', { info: 'Najomne a sluzby', vs: '880011', iban: 'SK7502000000001122334455' });
  if (je(3)) vydaj(mb, 3, rf(78, 128), 'byvanie', 'ZSE ENERGIA', { info: 'Zaloha za elektrinu' });
  if (je(8)) vydaj(mb, 8, 13.99, C.predplatne, 'NETFLIX.COM');
  if (je(12)) vydaj(mb, 12, 9.99, C.predplatne, 'SPOTIFY P12345');
  if (je(18)) vydaj(mb, 18, 22.00, 'sluzby', 'SLOVAK TELEKOM', { info: 'Internet' });
  if (je(20)) vydaj(mb, 20, 24.90, 'sluzby', 'ORANGE SLOVENSKO', { info: 'Mobilny paušál' });
  if (je(16)) vydaj(mb, 16, 200, 'sporenie', 'PREVOD NA SPORENIE', { info: 'Mesacne sporenie' });
  if (je(17)) vydaj(mb, 17, 150, C.etf, 'XTB S.A.', { info: 'Nakup ETF VWCE' });
  if (je(5)) vydaj(mb, 5, 26.00, C.mhd, 'DPB BRATISLAVA', { info: 'Mesacny predplatny listok' });
  // štvrťročné poistenie auta — len v mesiacoch, kde pripadá
  if (je(5) && (M - mb) % 3 === 1) vydaj(mb, 5, 118.40, 'doprava', 'ALLIANZ SP', { info: 'Povinne zmluvne poistenie' });
  // ročná daň z nehnuteľnosti
  if (je(10) && (M - mb + 12) % 12 === 4) vydaj(mb, 10, 86.00, 'byvanie', 'MESTO BRATISLAVA', { info: 'Dan z nehnutelnosti' });

  // ── bežná spotreba na ÚČTE ──
  // Zámerne menej než na karte: väčšina drobnej spotreby ide cez kreditku, inak by
  // sa tie isté kategórie účtovali dvakrát a zostatok by klesal do mínusu.
  for (let i = 0, n = ri(6, 9); i < n; i++) vydaj(mb, cap(ri(2, 28)), rf(9, 72), 'potraviny', pick(OBCH.potraviny));
  for (let i = 0, n = ri(1, 2); i < n; i++) vydaj(mb, cap(ri(2, 28)), rf(11, 38), 'restauracie', pick(OBCH.restauracie));
  for (let i = 0, n = ri(0, 2); i < n; i++) vydaj(mb, cap(ri(2, 28)), rf(7, 55), 'zdravie', pick(OBCH.zdravie));
  for (let i = 0, n = ri(0, 2); i < n; i++) vydaj(mb, cap(ri(2, 28)), rf(18, 85), C.deti, pick(OBCH.deti));
  if (maybe(0.4)) vydaj(mb, cap(ri(2, 28)), rf(12, 70), C.darceky, pick(OBCH.darceky));
  if (maybe(0.3)) vydaj(mb, cap(ri(2, 28)), rf(15, 90), C.vzdelavanie, pick(OBCH.vzdelavanie));
  if (maybe(0.22)) vydaj(mb, cap(ri(2, 28)), rf(60, 390), 'cestovanie', pick(OBCH.cestovanie), { tags: ['dovolenka'] });
  if (maybe(0.3)) tx({ date: iso(mb, cap(ri(5, 25))), amount: rf(25, 180), merchant: 'VRATKA / BONUS', category: C.prijmy, info: 'Mimoriadny prijem' });

  // ── kreditná karta ──
  let kartaMesiac = 0;
  for (let i = 0, n = ri(8, 14); i < n; i++) {
    const kat = pick([['potraviny', OBCH.potraviny], ['restauracie', OBCH.restauracie], [C.kava, OBCH.kava], ['nakupy', OBCH.nakupy], ['zabava', OBCH.zabava], [C.palivo, OBCH.palivo]]);
    const s = rf(4, 95);
    kartaTx(mb, cap(ri(2, 27)), s, kat[0], pick(kat[1]));
    kartaMesiac += s;
  }
  // refund na karte — kladná transakcia (testuje zelené zobrazenie a čisté čerpanie, v163)
  if (maybe(0.5)) {
    const s = rf(12, 95);
    kartaTx(mb, cap(ri(8, 24)), 0, 'nakupy', 'ALZA.SK VRATENIE', { amount: s, description: 'Vratka za vrateny tovar' });
    kartaMesiac -= s;
  }
  kartaSpolu[mb] = +kartaMesiac.toFixed(2);

  // Splátka kreditky spláca ČERPANIE PREDCHÁDZAJÚCEHO mesiaca (reálny cyklus).
  // Má DVE NOHY: odliv z účtu a kladný pohyb na karte. Sekcia „Kreditná karta — cyklus"
  // číta splátky z transakcií karty, takže bez druhej nohy by ukazovala 0 €.
  const naSplatenie = kartaSpolu[mb + 1];
  if (je(22) && naSplatenie > 0) {
    vydaj(mb, 22, naSplatenie, null, 'TATRA BANKA', { info: 'Uhrada kreditnej karty', isSplatka: true });
    kartaTx(mb, 22, 0, null, 'TATRA BANKA', { amount: naSplatenie, description: 'Vasa platba - dakujeme', isSplatka: true });
  }

  // ── sekundárne účty ──
  // Každý sa musí aj DOPĹŇAŤ, inak klesne do mínusu a „Bežný účet" v Majetku vyjde záporný.
  // Spoločný účet dotuje partner (reálny príjem), Revolut a rezerva sa dobíjajú prevodom.
  if (je(14)) tx({ date: iso(mb, 14), amount: 220, merchant: 'ZUZANA K.', category: C.prijmy, info: 'Prispevok na spolocny ucet', bank: 'acc_slsp01' });
  for (let i = 0, n = ri(2, 5); i < n; i++) tx({ date: iso(mb, cap(ri(2, 28))), amount: -rf(8, 95), merchant: pick(OBCH.potraviny), category: 'potraviny', bank: 'acc_slsp01' });
  if (je(10)) presun(mb, 10, 100, 'tatra', 'acc_rev01');
  for (let i = 0, n = ri(1, 4); i < n; i++) tx({ date: iso(mb, cap(ri(2, 28))), amount: -rf(5, 70), merchant: pick([...OBCH.nakupy, ...OBCH.cestovanie]), category: 'nakupy', bank: 'acc_rev01' });
  if (je(24)) presun(mb, 24, 30, 'tatra', 'acc_36501');
  if (maybe(0.5)) tx({ date: iso(mb, cap(ri(2, 28))), amount: -rf(10, 60), merchant: pick(OBCH.sluzby), category: 'sluzby', bank: 'acc_36501' });
}

// ── špeciálne prípady (nedávne mesiace, aby boli na očiach) ─────────────────

// 1) PÁROVÝ PRESUN medzi vlastnými účtami — obe nohy excluded + transferPair
function presun(mb, den, suma, zBank, doBank) {
  const out = tx({ date: iso(mb, den), amount: -suma, merchant: 'VLASTNY PREVOD', category: null, bank: zBank === 'tatra' ? undefined : zBank, excluded: true, info: 'Prevod medzi vlastnymi uctami' });
  const inc = tx({ date: iso(mb, den), amount: suma, merchant: 'VLASTNY PREVOD', category: null, bank: doBank === 'tatra' ? undefined : doBank, excluded: true, info: 'Prevod medzi vlastnymi uctami' });
  out.transferPair = inc.id; inc.transferPair = out.id;
}
presun(1, 6, 300, 'tatra', 'acc_slsp01');
presun(0, Math.min(4, DNES), 250, 'tatra', 'acc_36501');

// 2) ZDIEĽANÝ VÝDAVOK + POHĽADÁVKA (debtLink na príjme)
const spolocny = vydaj(1, 9, 186.60, 'cestovanie', 'AIRBNB BUDAPEST',
  { tags: ['dovolenka'], shared: { people: [{ name: 'Peter', amount: 62.20 }, { name: 'Zuzana', amount: 62.20 }] } });
const vratka1 = tx({ date: iso(1, 19), amount: 62.20, merchant: 'PETER N.', category: C.prijmy, info: 'Vratka za ubytovanie' });
vratka1.debtLinks = [{ expTxId: spolocny.id, personName: 'Peter', amount: 62.20 }];
// Zuzana zatiaľ nevrátila → zostáva otvorená pohľadávka (widget Pohľadávky)

const obed = vydaj(0, Math.min(7, DNES), 48.00, 'restauracie', 'FOODSTOCK',
  { shared: { people: [{ name: 'Zuzana', amount: 24.00 }] } });

// 3) SPLITY — jeden nákup rozdelený do viacerých kategórií (suma splitov = plná suma)
vydaj(0, Math.min(11, DNES), 164.30, 'nakupy', 'IKEA BRATISLAVA', {
  splits: [
    { category: 'byvanie', amount: -104.30 },
    { category: C.deti, amount: -40.00 },
    { category: 'nakupy', amount: -20.00 },
  ],
});
vydaj(3, 14, 92.50, 'potraviny', 'KAUFLAND BA PETRZALKA', {
  splits: [{ category: 'potraviny', amount: -61.50 }, { category: C.deti, amount: -31.00 }],
});

// 4) PLATBA ROZDELENÁ MEDZI MESIACE (📅) — 3 časti, dateOverride dozadu
const msGid = 'ms_mock_01';
[0, 1, 2].forEach((k, i) => {
  tx({
    date: iso(2, 12), dateOverride: iso(2 - k, 12), amount: -140.00,
    merchant: 'ZIMNE PNEUMATIKY PNEUBOX', category: 'doprava',
    monthSplitGroup: msGid, monthSplitPart: `${i + 1}/3`,
  });
});

// 5) REKONCILIAČNÁ KOREKCIA — excluded + reconAdjust
tx({ date: iso(4, 25), amount: -12.40, merchant: 'Korekcia zostatku', category: null, excluded: true, reconAdjust: true, info: 'Rozdiel oproti bankovemu zostatku' });

// 6) NEZARADENÉ transakcie → odznak „na zaradenie" v Transakciách
for (let i = 0; i < 5; i++) vydaj(0, Math.min(ri(2, 20), DNES), rf(6, 70), null, pick(['SUMUP *STANOK', 'PAYPAL *NEZNAMY', 'SQ *TRHOVISKO', 'REVOLUT **1234', 'ZEPTER SK']));

// 7) NEZÚČTOVANÁ (pending) transakcia na karte
kartaTx(0, Math.min(DNES, 26), 37.80, 'restauracie', 'PIZZA MIZZA', { isSettled: false, status: 'Autorizovaná' });

// 8) RUČNE UPRAVENÉ transakcie — override mena, zamknutá kategória, skontrolované
const upr = vydaj(1, 21, 59.90, 'zdravie', 'MEDICINA S.R.O.', { merchantOverride: 'Zubár — plomba', noteOverride: 'Doplatok nad poistenie', categoryLocked: true, reviewed: true });
vydaj(2, 8, 34.00, 'zabava', 'STEAM GAMES', { reviewed: true, tags: ['firemné'] });

// 9) TAGY naprieč mesiacmi
TX.filter(t => t.category === 'cestovanie').slice(0, 6).forEach(t => { t.tags = [...new Set([...(t.tags || []), 'dovolenka'])]; });
TX.filter(t => t.category === C.deti).slice(0, 5).forEach(t => { t.tags = [...new Set([...(t.tags || []), 'deti'])]; });
TX.filter(t => t.category === C.palivo).slice(0, 4).forEach(t => { t.tags = [...new Set([...(t.tags || []), 'auto'])]; });
TX.filter(t => t.category === C.darceky).slice(0, 3).forEach(t => { t.tags = [...new Set([...(t.tags || []), 'vianoce'])]; });
TX.filter(t => t.category === C.vzdelavanie).slice(0, 2).forEach(t => { t.tags = [...new Set([...(t.tags || []), 'firemné'])]; });

// 10) STAV SKONTROLOVANIA — staršie transakcie sú prejdené, nedávne čakajú.
// Bez toho by odznak „neskontrolované" ukazoval počet všetkých transakcií
// a v UI by nič nehovoril.
const hraniceRev = Date.parse(iso(2, 1));
TX.forEach(t => {
  const d = Date.parse(t.dateOverride || t.date);
  if (d < hraniceRev) t.reviewed = true;
  else if (maybe(0.45)) t.reviewed = true;
});

// ── zmazané transakcie (kôš) ────────────────────────────────────────────────
const deletedTX = [
  { id: 'tx_mock_del1', date: iso(2, 17), amount: -24.00, merchant: 'DUPLICITNY ZAZNAM', category: 'ostatne', source: 'account', deletedAt: iso(2, 18) },
  { id: 'tx_mock_del2', date: iso(1, 4), amount: -8.50, merchant: 'OMYLOM PRIDANE', category: null, source: 'account', deletedAt: iso(1, 5) },
];

// ── zostatky a rekonciliácia ────────────────────────────────────────────────
const txBank = t => t.bank || 'tatra';
const zostatokTatra = OPENING + TX.filter(t => txBank(t) === 'tatra' && t.source === 'account').reduce((s, t) => s + t.amount, 0);
const zostatokUctu = id => {
  const a = accounts.find(x => x.id === id);
  return (a?.openingBalance || 0) + TX.filter(t => txBank(t) === id).reduce((s, t) => s + t.amount, 0);
};
// Tatra sedí presne, Slsp je zámerne o 12,40 € vedľa → testuje vetvu „nesedí" + korekciu.
const reconciliations = {
  tatra: { balance: +zostatokTatra.toFixed(2), date: iso(0, Math.min(DNES, 28)) },
  acc_slsp01: { balance: +(zostatokUctu('acc_slsp01') - 12.40).toFixed(2), date: iso(0, Math.min(DNES, 28)) },
};

// ── rozpočty ────────────────────────────────────────────────────────────────
const budgetLimits = [
  { id: 'bl_m1', catId: 'potraviny', type: 'monthly', amount: 420, flexType: 'flexible', rollover: true, rolloverStart: ym(5), rolloverEnd: ym(0) },
  { id: 'bl_m2', catId: 'restauracie', type: 'monthly', amount: 160, flexType: 'flexible', rollover: false, rolloverStart: null, rolloverEnd: null },
  { id: 'bl_m3', catId: C.kava, type: 'monthly', amount: 30, flexType: 'flexible', rollover: false, rolloverStart: null, rolloverEnd: null },
  { id: 'bl_m4', catId: 'byvanie', type: 'monthly', amount: 620, flexType: 'fixed', rollover: false, rolloverStart: null, rolloverEnd: null },
  { id: 'bl_m5', catId: C.predplatne, type: 'monthly', amount: 26, flexType: 'fixed', rollover: false, rolloverStart: null, rolloverEnd: null },
  { id: 'bl_m6', catId: 'zabava', type: 'monthly', amount: 70, flexType: 'flexible', rollover: false, rolloverStart: null, rolloverEnd: null },
  { id: 'bl_m7', catId: 'nakupy', type: 'monthly', amount: 180, flexType: 'flexible', rollover: false, rolloverStart: null, rolloverEnd: null },
  { id: 'bl_m8', catId: 'doprava', type: 'monthly', amount: 210, flexType: 'flexible', rollover: false, rolloverStart: null, rolloverEnd: null },
  { id: 'bl_m9', catId: C.deti, type: 'monthly', amount: 120, flexType: 'flexible', rollover: false, rolloverStart: null, rolloverEnd: null },
  { id: 'bl_y1', catId: 'cestovanie', type: 'yearly', amount: 1800, flexType: 'flexible' },
  { id: 'bl_y2', catId: 'zdravie', type: 'yearly', amount: 600, flexType: 'flexible' },
  { id: 'bl_m10', catId: C.vzdelavanie, type: 'monthly', amount: null, flexType: 'flexible', rollover: false, rolloverStart: null, rolloverEnd: null }, // zaradená bez limitu
];

// Starší kľúčovaný model `${mesiac}_${kategoria}` — appka ho stále číta.
const budgets = {};
[0, 1, 2].forEach(mb => {
  budgets[`${ym(mb)}_potraviny`] = 420;
  budgets[`${ym(mb)}_restauracie`] = 160;
  budgets[`${ym(mb)}_zabava`] = 70;
});

// Presuny prebytku medzi kategóriami v aktuálnom mesiaci
const budgetMoves = [
  { id: 'mv_1', from: 'zabava', to: 'restauracie', amount: 25, month: ym(0) },
  { id: 'mv_2', from: 'nakupy', to: C.darceky, amount: 40, month: ym(0) },
  { id: 'mv_3', from: 'potraviny', to: 'goal:g_mock_dovolenka', amount: 50, month: ym(1) },
];

// ── ciele ───────────────────────────────────────────────────────────────────
const goals = [
  {
    id: 'g_mock_dovolenka', name: 'Dovolenka 2027', target: 2500, deadline: `${Y + 1}-07-01`, color: '#4a9fd4',
    contributions: [
      { id: 'c_d1', amount: 300, date: dayKey(iso(5, 16)), source: 'manual', note: 'počiatočný vklad' },
      { id: 'c_d2', amount: 200, date: dayKey(iso(3, 16)), source: 'manual', note: '' },
      { id: 'c_d3', amount: 150, date: dayKey(iso(1, 16)), source: 'manual', note: 'bonus' },
    ],
  },
  {
    id: 'g_mock_rezerva', name: 'Železná rezerva', target: 6000, deadline: null, color: '#7ab85e',
    contributions: [
      { id: 'c_r1', amount: 1200, date: dayKey(iso(11, 20)), source: 'manual', note: 'štart' },
      { id: 'c_r2', amount: 800, date: dayKey(iso(6, 20)), source: 'manual', note: '' },
      { id: 'c_r3', amount: 600, date: dayKey(iso(2, 20)), source: 'manual', note: '' },
    ],
  },
  {
    id: 'g_mock_auto', name: 'Nové auto', target: 12000, deadline: `${Y + 2}-03-31`, color: '#f0a040',
    contributions: [{ id: 'c_a1', amount: 2400, date: dayKey(iso(9, 10)), source: 'manual', note: 'predaj starého' }],
  },
  // Cieľ tesne pred splnením — testuje 100 % stav
  {
    id: 'g_mock_notebook', name: 'Notebook', target: 1400, deadline: `${Y}-12-20`, color: '#9d74d6',
    contributions: [
      { id: 'c_n1', amount: 900, date: dayKey(iso(4, 12)), source: 'manual', note: '' },
      { id: 'c_n2', amount: 460, date: dayKey(iso(1, 12)), source: 'manual', note: '' },
    ],
  },
];

// ── majetok ─────────────────────────────────────────────────────────────────
const netWorthItems = [
  { id: 'nw_a1', name: 'Sporiaci účet', side: 'asset', kind: 'savings', value: 8400 },
  { id: 'nw_a2', name: 'ETF portfólio', side: 'asset', kind: 'investment', value: 11250 },
  { id: 'nw_a3', name: 'Hotovosť doma', side: 'asset', kind: 'cash', value: 350 },
  { id: 'nw_a4', name: 'Byt Petržalka', side: 'asset', kind: 'property', value: 185000 },
  { id: 'nw_a5', name: 'Auto Škoda Octavia', side: 'asset', kind: 'other', value: 9800 },
  { id: 'nw_l1', name: 'Kreditná karta', side: 'liability', kind: 'creditcard', value: 980 },
  { id: 'nw_l2', name: 'Hypotéka', side: 'liability', kind: 'mortgage', value: 112000 },
  { id: 'nw_l3', name: 'Spotrebný úver', side: 'liability', kind: 'loan', value: 4200 },
];
const netWorthSnapshots = [];
for (let mb = 12; mb >= 0; mb--) {
  const k = (12 - mb) / 12;
  const assets = +(196000 + 18800 * k + rf(-900, 900)).toFixed(2);
  const liabilities = +(124000 - 6800 * k + rf(-400, 400)).toFixed(2);
  netWorthSnapshots.push({
    ym: ym(mb), net: +(assets - liabilities).toFixed(2), assets, liabilities,
    invValue: +(8600 + 2650 * k).toFixed(2), invested: +(8200 + 2100 * k).toFixed(2),
  });
}
const fundNames = { 'VWCE.DE': 'Vanguard FTSE All-World UCITS ETF', 'IWDA.NL': 'iShares Core MSCI World' };

// ── pravidlá auto-kategorizácie ─────────────────────────────────────────────
const rules = [
  { id: 'r_1', keyword: 'billa', field: 'merchant', category: 'potraviny', source: 'vlastné' },
  { id: 'r_2', keyword: 'lidl', field: 'merchant', category: 'potraviny', source: 'vlastné' },
  { id: 'r_3', keyword: 'tesco', field: 'merchant', category: 'potraviny', source: 'vlastné' },
  { id: 'r_4', keyword: 'kaufland', field: 'merchant', category: 'potraviny', source: 'import' },
  { id: 'r_5', keyword: 'netflix', field: 'merchant', category: C.predplatne, source: 'vlastné' },
  { id: 'r_6', keyword: 'spotify', field: 'merchant', category: C.predplatne, source: 'vlastné' },
  { id: 'r_7', keyword: 'slovnaft', field: 'merchant', category: C.palivo, source: 'vlastné' },
  { id: 'r_8', keyword: 'omv', field: 'merchant', category: C.palivo, source: 'vlastné' },
  { id: 'r_9', keyword: 'kaviaren', field: 'any', category: C.kava, source: 'vlastné' },
  { id: 'r_10', keyword: 'uhrada kreditnej', field: 'info', category: null, source: 'vlastné', isSplatka: true },
  { id: 'r_11', keyword: 'alza', field: 'merchant', category: 'nakupy', source: 'vlastné', amtOp: 'gt', amtVal: 50 },
  { id: 'r_12', keyword: 'orange', field: 'merchant', category: 'sluzby', source: 'vlastné' },
  { id: 'r_13', keyword: 'zamestnavatel', field: 'merchant', category: C.vyplata, source: 'vlastné' },
  { id: 'r_14', keyword: 'dpb', field: 'merchant', category: C.mhd, source: 'vlastné' },
  { id: 'r_15', keyword: 'xtb', field: 'merchant', category: C.etf, source: 'vlastné' },
];

// ── opakované platby ────────────────────────────────────────────────────────
// Pokryté sú všetky štyri frekvencie aj oba smery (výdavok / príjem).
const recurDefs = [
  { id: 'rec_vyplata', name: 'Výplata', keyword: 'zamestnavatel', amount: 2150, frequency: 'monthly', isIncome: true, dayOfMonth: 15, category: C.vyplata, note: 'Hlavný príjem', active: true },
  { id: 'rec_najom', name: 'Nájom', keyword: 'spravca bytov', amount: 480, frequency: 'monthly', isIncome: false, dayOfMonth: 1, category: 'byvanie', note: null, active: true },
  { id: 'rec_energie', name: 'Elektrina — záloha', keyword: 'zse', amount: 98, frequency: 'monthly', isIncome: false, dayOfMonth: 3, category: 'byvanie', note: null, active: true },
  { id: 'rec_netflix', name: 'Netflix', keyword: 'netflix', amount: 13.99, frequency: 'monthly', isIncome: false, dayOfMonth: 8, category: C.predplatne, note: null, active: true },
  { id: 'rec_spotify', name: 'Spotify', keyword: 'spotify', amount: 9.99, frequency: 'monthly', isIncome: false, dayOfMonth: 12, category: C.predplatne, note: null, active: true },
  { id: 'rec_telefon', name: 'Mobil', keyword: 'orange', amount: 24.90, frequency: 'monthly', isIncome: false, dayOfMonth: 20, category: 'sluzby', note: null, active: true },
  { id: 'rec_internet', name: 'Internet', keyword: 'slovak telekom', amount: 22.00, frequency: 'monthly', isIncome: false, dayOfMonth: 18, category: 'sluzby', note: null, active: true },
  { id: 'rec_mhd', name: 'MHD predplatné', keyword: 'dpb', amount: 26.00, frequency: 'monthly', isIncome: false, dayOfMonth: 5, category: C.mhd, note: 'Ročný električenka v mesačných splátkach', startMonth: ym(9), endMonth: ym(0), active: true },
  { id: 'rec_poistka', name: 'PZP auto', keyword: 'allianz', amount: 118.40, frequency: 'quarterly', isIncome: false, dayOfMonth: 5, category: 'doprava', note: null, refMonth: 1, active: true },
  { id: 'rec_dan', name: 'Daň z nehnuteľnosti', keyword: 'mesto bratislava', amount: 86.00, frequency: 'yearly', isIncome: false, dayOfMonth: 10, category: 'byvanie', note: null, refMonth: 4, active: true },
  { id: 'rec_fitko', name: 'Fitness permanentka', keyword: 'fitko', amount: 12.00, frequency: 'weekly', isIncome: false, dayOfMonth: null, category: 'zdravie', note: 'Týždenný vstup', active: true },
  { id: 'rec_sporenie', name: 'Mesačné sporenie', keyword: 'prevod na sporenie', amount: 200, frequency: 'monthly', isIncome: false, dayOfMonth: 16, category: 'sporenie', note: null, active: true },
  { id: 'rec_stare', name: 'Starý časopis (ukončené)', keyword: 'casopis', amount: 6.50, frequency: 'monthly', isIncome: false, dayOfMonth: 9, category: 'zabava', note: 'Zrušené predplatné', startMonth: ym(13), endMonth: ym(7), active: false },
];

// Per-mesiac override-y: pripnutie konkrétnej tx, zablokovanie, vylúčenie, vnútenie.
const _k = (rec, yr, mo) => `${rec}|${yr}|${mo}`;
const prevY = new Date(Date.UTC(Y, M - 1, 1));
const recurMarks = {
  pins: { [_k('rec_najom', prevY.getUTCFullYear(), prevY.getUTCMonth())]: TX.find(t => t.merchant === 'SPRAVCA BYTOV S.R.O.')?.id || '' },
  blocks: { [_k('rec_fitko', Y, M)]: true },
  excl: { [_k('rec_stare', Y, M)]: true },
  incl: {},
};
const recurIgnored = ['ignored_sumup_stanok', 'ignored_paypal_neznamy'];

// ── ostatné nastavenia ──────────────────────────────────────────────────────
const excludedTags = ['firemné'];           // tag vylúčený z analýzy
const visCols = ['date', 'main', 'place', 'source', 'cat', 'amount'];
const colWidths = { date: 70, main: 240, place: 130, source: 80, cat: 120, amount: 100 };
const detFieldsHidden = ['swift', 'ref'];
const ibanNames = {
  'SK7502000000001122334455': 'Správca bytov',
  'SK1109000000005544332211': 'Zamestnávateľ',
};
const editLog = [
  { ts: iso(1, 21, 12), txId: upr.id, txDesc: 'MEDICINA S.R.O.', txAmt: -59.90, field: 'merchantOverride', oldVal: '(prázdne)', newVal: 'Zubár — plomba' },
  { ts: iso(1, 21, 12), txId: upr.id, txDesc: 'MEDICINA S.R.O.', txAmt: -59.90, field: 'category', oldVal: 'ostatne', newVal: 'zdravie' },
  { ts: iso(0, Math.min(11, DNES), 9), txId: TX.find(t => t.merchant === 'IKEA BRATISLAVA')?.id || '', txDesc: 'IKEA BRATISLAVA', txAmt: -164.30, field: 'splits', oldVal: '(prázdne)', newVal: '3 kategórie' },
];

// ── výsledná záloha (tvar exportBackup, version 5) ──────────────────────────
const data = {
  version: 5,
  exported: new Date(Date.UTC(Y, M, Math.min(DNES, 28), 10)).toISOString(),
  tx: TX, deletedTX,
  budgets, budgetLimits, budgetMoves, goals,
  netWorthItems, netWorthSnapshots, fundNames,
  openingBalance: OPENING,
  rules, recurDefs, recurIgnored,
  customCats, builtinCats: BUILTIN, visCols,
  detFieldsHidden,
  ccLimit: '3450',
  ibanNames, editLog,
  excludedTags, recurMarks, colWidths,
  accounts, reconciliations,
  syncCfg: { url: '', key: '', iban: '', last: null },
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(data, null, 2), 'utf8');

// ── zhrnutie ────────────────────────────────────────────────────────────────
const poc = p => TX.filter(p).length;
console.log(`✓ ${path.relative(process.cwd(), OUT)}`);
console.log(`  ukotvené k ${dayKey(data.exported)} · ${MESIACOV} mesiacov histórie`);
console.log(`  transakcie:      ${TX.length} (účet ${poc(t => t.source === 'account')}, karta ${poc(t => t.source === 'credit_card')})`);
console.log(`  z toho: nezaradené ${poc(t => !t.category && !t.splits && !t.excluded)} · tagy ${poc(t => t.tags?.length)} · splity ${poc(t => t.splits)} · zdieľané ${poc(t => t.shared)}`);
console.log(`          pohľadávky ${poc(t => t.debtLinks)} · presuny ${poc(t => t.transferPair)} · rozdelené medzi mesiace ${poc(t => t.monthSplitGroup)}`);
console.log(`          splátky KK ${poc(t => t.isSplatka)} (obe nohy) · refundy na karte ${poc(t => t.source === 'credit_card' && t.amount > 0 && !t.isSplatka)} · čakajúce ${poc(t => t.isSettled === false)}`);
console.log(`  účty: ${accounts.length + 1} · kategórie: ${BUILTIN.length}+${customCats.length} · pravidlá: ${rules.length}`);
console.log(`  limity: ${budgetLimits.length} · presuny rozpočtu: ${budgetMoves.length} · ciele: ${goals.length} · opakované: ${recurDefs.length}`);
console.log(`  majetok: ${netWorthItems.length} položiek, ${netWorthSnapshots.length} snapshotov`);
console.log(`  zostatok Tatra: ${zostatokTatra.toFixed(2)} € (rekonciliácia sedí) · Slsp o 12,40 € vedľa (zámerne)`);
