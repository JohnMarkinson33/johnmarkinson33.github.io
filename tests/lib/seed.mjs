// Deterministické testovacie dáta.
// POZOR: anMonth sa inicializuje z new Date().getMonth() → dáta MUSIA byť
// v aktuálnom kalendárnom mesiaci, inak pivot aj dashboard vyjdú prázdne.
//
// ⚠️ Kľúče localStorage a tvar objektov je nutné pri prvom behu overiť proti appke:
//    grep -n "localStorage.setItem" ../index.html
//    a doplniť skutočné názvy kľúčov nižšie.

const now = new Date();
const Y = now.getFullYear();
const M = now.getMonth();              // 0-indexovaný

/** ISO string pre daný deň aktuálneho mesiaca (bez UTC posunu). */
export function d(day) {
  const dd = String(Math.min(day, 28)).padStart(2, '0');
  return `${Y}-${String(M + 1).padStart(2, '0')}-${dd}`;
}

// Kategórie mimo BUILTIN ID (potraviny, doprava, restauracie, nakupy, byvanie,
// zdravie, zabava, cestovanie, sluzby, sporenie, ostatne).
// Tvar zodpovedá customCats v appke: {id, l:label, c:color, builtin:false}
// (over: grep -n "customCats.push" ../index.html). Príjem sa nerozlišuje cez
// kategóriu, ale znamienkom amount > 0.
export const CATS = [
  { id: 'tst_jedlo',  l: 'TEST jedlo',   c: '#4caf50', builtin: false },
  { id: 'tst_bydlo',  l: 'TEST bývanie', c: '#2196f3', builtin: false },
  { id: 'tst_prijem', l: 'TEST príjem',  c: '#ff9800', builtin: false }
];

export const TX = [
  { id: 't1', date: d(3),  amount: 1800,   desc: 'Výplata',        category: 'tst_prijem', account: 'tatra' },
  { id: 't2', date: d(5),  amount: -42.50, desc: 'BILLA',          category: 'tst_jedlo',  account: 'tatra' },
  { id: 't3', date: d(8),  amount: -650,   desc: 'Nájom',          category: 'tst_bydlo',  account: 'tatra' },
  { id: 't4', date: d(12), amount: -19.90, desc: 'LIDL',           category: 'tst_jedlo',  account: 'tatra' },
  // shared výdavok — txMyAmount musí vrátiť 30, nie 60
  { id: 't5', date: d(15), amount: -60,    desc: 'Večera dvaja',   category: 'tst_jedlo',  account: 'tatra',
    shared: { people: [{ name: 'Zuzka', amount: 30 }] } },
  // split — Σ getTxCatAmounts musí byť -100
  { id: 't6', date: d(18), amount: -100,   desc: 'Zmiešaný nákup', category: 'tst_jedlo',  account: 'tatra',
    splits: [{ category: 'tst_jedlo', amount: -70 }, { category: 'tst_bydlo', amount: -30 }] },
  // excluded — nesmie sa objaviť v analýze
  { id: 't7', date: d(20), amount: -500,   desc: 'Vylúčená',       category: 'tst_bydlo',  account: 'tatra',
    excluded: true },
  // dateOverride — eDate ju musí posunúť, t.date nie
  { id: 't8', date: d(25), amount: -33,    desc: 'Posunutá',       category: 'tst_jedlo',  account: 'tatra',
    dateOverride: d(10) }
];

/** Seed objekt pre loadApp(). Kľúče overené proti Store.get()/Store.set() v index.html:
 *  TX          → Store.get('tx')         → localStorage kľúč fintb_tx
 *  CATS (custom) → Store.get('customcats') → localStorage kľúč fintb_customcats
 *  (BUILTIN_CATS sú natvrdo v appke, nie je ich treba seedovať) */
export const seed = {
  fintb_tx: TX,
  fintb_customcats: CATS
};
