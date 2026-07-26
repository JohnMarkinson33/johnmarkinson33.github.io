# finTB — pravidlá práce

## Jazyk
Komunikácia **po slovensky**, vrátane komentárov v kóde a UI textov.

## Čo je tento projekt
`index.html` = celá appka na osobné financie. Vanilla JS, localStorage, SheetJS z CDN,
Canvas grafy. **Žiadny framework, žiadny build step, žiadny backend v appke.**
Vývojár aj jediný používateľ = Mato. Primárne Android PWA, desktop na vývoj a analýzu.

Nasadenie: GitHub Pages, repo `johnmarkinson33.github.io`, appka je `index.html` v koreni.
Vedľa nej **nemazať**: `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png`,
`icon-maskable-512.png`, `privacy.html`, `terms.html`.

## ⚠️ Čítanie súboru — kritické
`index.html` je obrovský jednosúborový dokument. **Nikdy ho nečítaj celý.**
Postup vždy: `grep -n "kotva"` → `sed -n 'X,Yp'` na cieľový blok → až potom edit.
Čítanie celého súboru spáli kontext a nič nepridá.

## Štýl spolupráce
- **Priama implementácia** pri UI, kozmetike, bugfixoch a jasne zadaných veciach.
- **Návrh s rozhodovacími bodmi + odporúčaním** pri architektúre alebo novom dátovom
  koncepte — počkaj na „poďme" / „podľa odporúčaní", až potom píš kód.
- Pri deployi vždy vysvetli: **root cause → čo sa zmenilo → ako to otestovať na desktope**.
- Máš **stále povolenie pokračovať v práci**, kým Mato testuje.

## Build postup (nemenný)
1. Čítať kód pred editom (`grep -n` / `sed -n`) — nikdy needitovať naslepo.
2. Edit tool s unikátnou kotvou. Ak kotva nie je unikátna, **rozšír ju** o okolitý riadok;
   nikdy neriešiť problém tým, že sa nahradí prvý výskyt.
3. Syntax check inline scriptov: `node tests/syntax.mjs`
4. `npm test` v `tests/` — jsdom smoke + **golden pivot snapshot musí byť byte-identický**.
5. Bump verzie v `title="verzia buildu">vNN` (sekvenčne: v159 → v160 → …).
6. Commit s popisom zmeny, `git push` = deploy na GitHub Pages.

Ak sa golden snapshot zmenil **zámerne** (zmena výpočtu), regeneruj ho
(`npm run golden`), ale v commit message to výslovne uveď a vysvetli prečo.

## Dátový model — INVARIANTY (porušenie = tiché chyby)

| Invariant | Popis |
|---|---|
| `eDate(t)` | = `t.dateOverride \|\| t.date`. Používať **všade** vrátane sortov. Nikdy `t.date` priamo v analýze. |
| `txMyAmount(t)` | môj podiel (shared výdavky, vrátky pohľadávok). |
| `getTxCatAmounts(tx)` | **jediný** zdroj per-kategória súm; Σ === `txMyAmount`. |
| `anTx({...})` | **kanonický** analytický filter: scope účtu + excluded + CC splátky + vylúčené tagy. |
| `_inAnScope(t)` | kontrola scope pri multi-bank. |
| `isCCRepayment(t)` | splátky kreditky von zo všetkých výdavkov. |
| `localDateKey(d)` | namiesto `toISOString()` (UTC posun by menil dátumy v CE(S)T). |
| `fabs(n)` | **už obsahuje €** — nikdy nepridávať „ €" navyše. `fe(n)` so znamienkom. |
| `getDebtLinks(tx)` | kompatibilita starý `debtLink` ↔ nový `debtLinks[]`. |
| `anMonth` | **0-indexovaný** (jún = 5). Nikdy nepridávať `-1`. |
| `_returnMap` | cache → nastaviť `null` v `saveD()` a všade, kde sa menia debtLinks. |
| sTx/dTx | pass-through spread → nové polia tx sa perzistujú automaticky. |

**BUILTIN kategórie:** potraviny, doprava, restauracie, nakupy, byvanie, zdravie,
zabava, cestovanie, sluzby, sporenie, ostatne. Testovacie dáta **nesmú** kolidovať s týmito ID.

## Architektonické rozhodnutia (nemeniť bez diskusie)
- Analytické funkcie **nikdy** nečítajú goals/budgetMoves (bráni dvojitému počítaniu).
- Priradenie k cieľu **nemutuje** transakcie.
- Detekcia opakujúcich sa platieb len **navrhuje**, plná manuálna kontrola ostáva.
- Sporiace ciele **mimo** net worth (double-counting).
- TX splits: `tx.splits=[{category,amount}]`, žiadne virtuálne záznamy.
- Shared: `tx.shared={people:[{name,amount}]}` na výdavku,
  `tx.debtLinks=[{expTxId,personName,amount}]` na príjme.
- `categoryLocked` nastavuje `setCat()` / `_setCatLocked()` — **nie** `autoSaveDet()`
  (ten beží pri každej zmene poľa).
- CSS base rules musia byť **pred** media queries pri rovnakej špecificite.
- Pivot má **viac builderov** príjmových riadkov — zmena v jednom nestačí.

## Perzistencia
Nové nastavenia sa musia pridať na **všetkých 7 miest** perzistencie
(vzor: `reconciliations`, `syncCfg`). Pred pridaním nového kľúča si nájdi všetkých 7
cez `grep -n "reconciliations" index.html` a doplň analogicky.

## Bezpečnosť
Repo je **verejné** (GitHub Pages). Nikdy necommitni:
`APP_KEY`, `EB_PRIVATE_KEY`, `EB_APP_ID`, IBAN, ani reálne bankové dáta v testoch.
Secrets workera žijú výhradne v Cloudflare env. `syncCfg` žije v localStorage používateľa.

## Ďalší kontext
- `docs/finTB_kontext.md` — história verzií, banková synchronizácia, otvorené úlohy.
  Čítaj **len keď je téma relevantná**, nie preventívne.
- `docs/finTB_roadmap.md` — roadmapa.
- `fintb_worker/worker.js` — Cloudflare Worker (Enable Banking adaptér).
