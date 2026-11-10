// Očakávaný výstup parsera pre každú vzorku z tests/bmail/fixtures/.
//
// Tento súbor je KONTRAKT parsera, nie len test — definuje tvar záznamu, ktorý
// `parseBmail()` musí vrátiť. Katalóg typov je v docs/finTB_zber_dat_analyza.md §4.1,
// pasce v §4.4; pri každom poli je uvedené, ktorú pascu drží.
//
// Konvencie:
//   - chýbajúce TEXTOVÉ pole  → '' (prázdny reťazec), nikdy undefined
//   - chýbajúce ČÍSELNÉ pole  → null, nikdy 0 (0 je platná suma)
//   - `date` sa porovnáva ako lokálny reťazec 'RRRR-MM-DD HH:MM'.
//     Zámerne NIE cez toISOString() — ten by v CE(S)T posunul deň (invariant
//     localDateKey z CLAUDE.md platí aj v testoch).
//   - `bmSrc` je POVINNÝ pri každom zázname. „Disponibilný zostatok" znamená na účte
//     a na kreditke opačnú vec (§4.3), takže bez rozlíšenia zdroja by sa zamenili.

export const expected = {

  // ── Typ 1 — prevod na účte ────────────────────────────────────────────────
  // Pasce: 1 (desatinná ČIARKA), 3 (protistrana cez „Informacia pre prijemcu"),
  //        8 (ID v tvare 041126/100001-1), 11 (pätička sa nesmie dostať do dát)
  '01-debet-prevod': {
    bmId: '041126/100001-1',
    bmType: 1,
    bmSrc: 'acct',
    kind: 'tx',
    date: '2026-11-04 14:23',
    amount: -32.35,
    merchant: '',                       // prevod nemá obchodníka
    note: 'Najom garaz',
    counterAccount: '9988776655/0900',
    vs: '202611',
    cardNo: '',
    balAcct: 1234.56,
    balCurrent: 1234.56,
    balAvail: 1234.56,
    cardAvail: null,
    status: '',
  },

  // ── Typ 2 — platba kartou z účtu ──────────────────────────────────────────
  // Pasce: 12 (iný tvar než prevod, BODKA na konci riadku sa nesmie dostať do mena),
  //        2 (maska karty je tu vnútri Popisu, nie v samostatnom poli)
  '02-debet-karta': {
    bmId: '051126/100002-1',
    bmType: 2,
    bmSrc: 'acct',
    kind: 'tx',
    date: '2026-11-05 09:41',
    amount: -12.80,
    merchant: 'KAVIAREN U JANA',        // BEZ koncovej bodky
    note: '',
    counterAccount: '',
    vs: '',
    cardNo: '123456******7890',
    balAcct: 1221.76,
    balCurrent: 1221.76,
    balAvail: 1221.76,
    cardAvail: null,
    status: '',
  },

  // ── Typ 3 — kredit na účte ────────────────────────────────────────────────
  // Pasce: 3 (protistrana je tu v „Referencia platitela", nie v „Informacia pre prijemcu"),
  //        4 (NOT PROVIDED sa musí zahodiť, nie zapísať ako text),
  //        5 (PLATBA veľkými písmenami — routing aj parsovanie case-insensitive)
  '03-kredit': {
    bmId: '061126/100003-1',
    bmType: 3,
    bmSrc: 'acct',
    kind: 'tx',
    date: '2026-11-06 11:02',
    amount: 450.00,                     // kredit = KLADNÁ suma
    merchant: '',
    note: '/VS202611/SS/KS',            // z Referencia platitela, NIE 'NOT PROVIDED'
    counterAccount: '1112223334/0200',
    vs: '202611',
    cardNo: '',
    balAcct: 1671.76,
    balCurrent: 1671.76,
    balAvail: 1671.76,
    cardAvail: null,
    status: '',
  },

  // ── Typ 4 — debet na kreditnej karte ──────────────────────────────────────
  // Pasce: 1 (desatinná BODKA), 5 (predmet začína malým písmenom),
  //        8 (ID = 10 číslic), 9 (meno obchodníka OBSAHUJE čiarku),
  //        §4.3 (Disponibilny zostatok je tu zvyšok RÁMCA → cardAvail, nie balAcct)
  '04-debet-kreditka': {
    bmId: '4412345678',
    bmType: 4,
    bmSrc: 'card',
    kind: 'tx',
    date: '2026-11-07 18:15',
    amount: -25.00,
    merchant: 'TESTFIRMA, s.r.o.',      // čiarka v mene PREŽIJE, mesto a chvost odpadnú
    note: '',
    counterAccount: '',
    vs: '',
    cardNo: '123456******7890',
    balAcct: null,                      // kreditka NEMÁ účtovný zostatok
    balCurrent: null,
    balAvail: null,
    cardAvail: 2805.00,
    status: 'autorizovana',
  },

  // ── Typ 5 — úhrada dlžnej sumy na kreditnej karte ─────────────────────────
  // Pasce: 2 („Meno karty" namiesto „Cislo karty" — to isté pole, iný názov),
  //        10 (čas 00:00 je platný údaj systémovej udalosti, nie chýbajúci čas)
  '05-uhrada-kreditka': {
    bmId: '4412345679',
    bmType: 5,
    bmSrc: 'card',
    kind: 'tx',
    date: '2026-11-08 00:00',
    amount: 150.00,                     // úhrada = KLADNÁ na karte
    merchant: '',
    note: 'Vasa platba - dakujeme',
    counterAccount: '',
    vs: '',
    cardNo: '123456******7890',         // musí prísť z „Meno karty"
    balAcct: null,
    balCurrent: null,
    balAvail: null,
    cardAvail: 2955.00,
    status: '',
  },

  // ── Typ 6 — mesačná uzávierka kreditnej karty ─────────────────────────────
  // Pasce: 6 (predmet JE s diakritikou, na rozdiel od typov 1–5),
  //        7 (ID= je v TELE a NIE je to transakcia — slepé hľadanie ID= by raz
  //           mesačne vyrobilo fantómový pohyb), 8 (ID = 8 číslic)
  // NIE JE to transakcia: kind='statement', amount=null. Do účtovnej knihy nesmie.
  '06-uzavierka': {
    bmId: '44120001',
    bmType: 6,
    bmSrc: 'card',
    kind: 'statement',
    date: '2026-11-09 00:00',           // dátum uzávierky, čas sa neuvádza
    amount: null,                       // ŽIADNY pohyb
    merchant: '',
    note: '',
    counterAccount: '',
    vs: '',
    cardNo: '123456******7890',
    balAcct: null,
    balCurrent: null,
    balAvail: null,
    cardAvail: null,
    status: '',
    stmtDue: 487.65,                    // dlžná suma za cyklus (§5.4 — vyčíslenie poplatku)
    stmtMinPayment: 24.40,
    stmtDueDate: '2026-11-25',
  },
};

// ── Pasca 9 samostatne: chvost obchodníka sa odstrihuje OD KONCA ────────────
// §4.4 odporúča neparsovať zľava, ale odstrihnúť známy chvost
// „, <mesto> <KRAJINA>, <typ> - <stav>"; zvyšok = meno obchodníka.
// Mesto raz s pomlčkou, raz bez; meno samo môže obsahovať čiarku.
// Tabuľka je zámerne mimo fixtures — fixtures držia katalóg šiestich typov (§4.1),
// toto drží maticu variantov jednej pasce.
export const merchantTailCases = [
  { popis: 'mesto s pomlčkou',
    vstup: 'BISTRO PRAMEN, BRATISLAVA - SK, dom nakup - autorizovana',
    merchant: 'BISTRO PRAMEN', status: 'autorizovana' },

  { popis: 'mesto bez pomlčky',
    vstup: 'HOLICSTVO CENTRUM, Kosice SK, dom nakup - autorizovana',
    merchant: 'HOLICSTVO CENTRUM', status: 'autorizovana' },

  { popis: 'čiarka v mene firmy',
    vstup: 'TESTFIRMA, s.r.o., Bratislava - SK, dom nakup - autorizovana',
    merchant: 'TESTFIRMA, s.r.o.', status: 'autorizovana' },

  { popis: 'dve čiarky v mene',
    vstup: 'ALFA, BETA, GAMA, Zilina SK, dom nakup - autorizovana',
    merchant: 'ALFA, BETA, GAMA', status: 'autorizovana' },

  { popis: 'viacslovné mesto',
    vstup: 'LEKAREN CENTRUM, Nove Zamky SK, dom nakup - autorizovana',
    merchant: 'LEKAREN CENTRUM', status: 'autorizovana' },

  // ⚠️ NEOVERENÉ na reálnej vzorke — otvorená otázka §11.2.
  // Ak Tatra pri zahraničnej platbe použije iný text než „zahr nakup", test padne
  // a povie presne, čo treba doplniť. To je zámer, nie chyba.
  { popis: 'zahraničný nákup (nepotvrdený tvar)',
    vstup: 'WEBSHOP XY, Wien - AT, zahr nakup - autorizovana',
    merchant: 'WEBSHOP XY', status: 'autorizovana', neoverene: true },
];
