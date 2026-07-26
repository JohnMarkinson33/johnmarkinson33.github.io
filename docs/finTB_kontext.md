# finTB — referenčný kontext (stav v159, júl 2026)

> Tento súbor sa **nenačítava automaticky**. Otvor ho, len keď je téma relevantná.
> Trvalé pravidlá sú v `/CLAUDE.md`.

---

## 1. História v134 → v159

**v134–v137 (Balík 8 — multibank):** `_anBank` scope ('tatra' default), párové presuny,
Revolut poplatky, Slsp `bankCat`, `_accClearTxs`, Slsp stávková kniha.

**v138–v141 (Balík 9 — reporty):** PDF mesačný report (canvas grafy → PNG, print CSS),
XLSX export (3 hárky so vzorcami), tab **📅 Za obdobie** (presety + vlastný rozsah),
tab **🔀 Tok** (Sankey inline SVG).

**v142–v143 (Balík 10 — správnosť):** rekonciliácia zostatkov (`reconciliations` na 7
miestach, korekčná tx `reconAdjust:true, excluded:true`); **splits audit** — opravené 3
úniky (rozpočet čítal surové TX → ignoroval excluded/CC/scope!, budget drill, investície).

**v144:** shared → **net** zjednotenie (PDF report, Za obdobie, XLSX Mesačný) — súčty
konečne sedia s dashboardom.

**v145:** CSS zladenie pivotu; overené, že Budget vs actual je hotový a správny.

**v146–v148 (PWA fix):** pôvodne blob: manifest **aj** blob: SW → Chrome oboje odmieta,
inštalácia nikdy nemohla fungovať (chyby prehltnuté v prázdnom `.catch`). Riešenie:
statické `manifest.json` + `sw.js` + 3 ikony, `beforeinstallprompt` → tlačidlo ⬇ v hlavičke,
**📲 PWA diagnostika** v Dátach. Bug v SW: `caches.addAll` je atomický → cachovanie po
jednom (v148). Rozuzlenie: Pixel neponúkal inštaláciu, lebo **Pixel Launcher nebol
predvolený** (Chrome vtedy prompt potichu potlačí). Boli to **dve nezávislé chyby**.

**v149–v150 (dizajn):** tri úrovne ovládačov — pohľady = **podčiarknuté taby**, filtre
období/účtu = **`.seg` segmented control**, tagy = **999px pill chipy**. Pivot: `.hc` =
**cell-tint** (color-mix 11 %), hairline oddeľovače. **Cashflow presunutý do Prehľadov**;
`_syncAnLineToPivot()` — graf Vývoj kategórií sleduje zvolené obdobie pivotu.

**v151:** Sankey label vo vyhradenom páse (TOP=34); drill kategórie v Za obdobie; goal
picker **len príjmy** (Math.abs by výdavok chybne pripočítal); strop presunu prebytku
`_catAvailForMove()` + hint `#mv-avail`.

**v152:** **📅 Rozdelenie platby medzi mesiace** — `splitTxAcrossMonths()`, 2–12 častí,
centové delenie, `dateOverride` dozadu, day-clamp na kratší mesiac,
`monthSplitGroup`/`monthSplitPart`, opätovný klik = zlúčenie späť.
Guardy: transferPair/splits/shared/debtLinks.

**v153 (audit):** Porovnanie období aj Cashflow cez `anTx({})` + `txMyAmount` (predtým
surové TX → presuny nafukovali obe strany); Top obchodníci a Výdavky v čase na net; goal
picker vylučuje excluded/transferPair/CC; budget drill sort podľa `eDate`.

**v154:** XLSX stĺpec **Môj podiel**; `avgMonths = dni/30.44`; backup filename cez
`localDateKey`; riadok „VYLÚČIŤ TAGY" skrytý na tabe Tagy; scope selektor na Prehľadoch;
`_anRerender` rozšírený (bol slepý na period/sankey/prehlady).

**v155:** 📅 badge v analýza drille + pole v detaile; detail Suma cez `txMyAmount` →
„tvoj príjem (zostatok po vrátkach)" + fix dvojitého €€; 🎯 presun prebytku priamo z
budget drillu; **ročný aj mesačný pivot: príjmovo-dominantné kategórie ukazujú čistý tok
každý mesiac** (príčina: clamp `Math.max(0,-v)` orezával záporné mesiace na „—").

**v156–v159:** banková synchronizácia — viď §3.

**v160 (oprava nesedícich zostatkov po importe):** dve tiché chyby zavedené so syncom (v156).

*Root cause A — sync claim bral aj transakcie kreditky.* Filter kandidátov v `_syncApply`
používal `txBank(t)==='tatra'`, ale `txBank()` = `t.bank || 'tatra'` a transakcie kreditky
sa vytvárajú **bez** poľa `bank` → vrátil im 'tatra'. Filtru zároveň chýbalo
`source==='account'`. Sync tak mohol „claimnúť" tx kreditky (zhodná suma, dátum ±4 dni):
claim robí `return`, takže sa **účtová tx vôbec nepridala**, a `accountBalance('tatra')`
(ráta len `source==='account'`) o ňu natrvalo prišiel. Navyše dostala `tbId`, takže ju
každý ďalší sync preskočil — chyba sa sama neopravila. Fix: `source==='account'` +
`!reconAdjust` vo filtri (korekčné riadky rekonciliácie nemajú náprotivok v banke).

*Root cause B — import vyžadoval presnú zhodu mena obchodníka.* Sync placeholdery majú
merchant `'Kartová platba'` / `'Výber hotovosti'`, XLSX skutočné meno → zhoda zlyhala →
import pridal **duplikát** a zostatok narástol. Sync smerom von je pritom fuzzy, takže
vznikla asymetria: „import → sync" fungovalo, „sync → import" vyrábalo duplikáty.
Fix: import teraz pri zlyhaní presnej zhody hľadá `syncPlaceholder` (suma + dátum ±4 dni)
a **doplní doň meno** namiesto pridania novej tx; `tbId`/`syncAdded` ostávajú. Tým je
vyriešená aj dlho otvorená úloha §4.1 — pravidlo „najprv import, potom sync" už neplatí.

*Root cause C (latentná)* — refresh existujúceho riadku pri re-importe nezachovával `tbId`
ani `syncAdded`, takže opakovaný import strhol bankové ID a ďalší sync pridal duplikát.
Fix: oba kľúče sa zachovávajú rovnakým patternom ako `splits`/`shared`.

Náprava už poškodených dát: tlačidlo **🩹 Opraviť chybné bankové ID** (`_syncFixBadIds()`)
odoberie `tbId` transakciám s `source!=='account'` a resetne `syncCfg.last`, aby sa
chýbajúce účtové transakcie stiahli nanovo.

Regresné testy v `tests/smoke.mjs` (5 nových asercií) — overené, že na v159 kóde padajú
(`FINTB_APP=… node smoke.mjs` proti `git show HEAD:index.html`). Golden pivot nedotknutý.

---

## 2. Stav roadmapy

Balíky **1–10 hotové** (3 zrušený, 2b Share Target odložený).

Vedome vynechané:
- **Swipe kategorizácia** — VYRADENÁ (robila problémy, appka je primárne desktop).
- **Zlúčenie mesačného a ročného pivotu** — POTVRDENÉ nezlučovať: render funkcie sa
  zhodujú len na ~26 %, výpočtové jadro (`buildPivotData`) už zdieľajú; líšia sa buckety
  (týždne vs 12 mesiacov), navigácia a sekcia „Vyrovnané".

Neschválené nápady: PDF report s periódovými presetmi, Word (docx) export, dedikované
porovnanie účtov vedľa seba.

---

## 3. Banková synchronizácia

### 3.1 Preverené cesty
- Vlastná AISP licencia (NBS, eIDAS) → nereálne.
- GoCardless/Nordigen free tier → **zrušený** pre nové registrácie.
- Tatra Premium API → sandbox funkčný, produkcia **ZAMIETNUTÁ** (len firemní klienti).
- **Enable Banking → VÍŤAZ, beží v produkcii.**
- Scraping → nie (zakázaný, PSD3 to potvrdzuje).

### 3.2 Čo beží dnes
```
finTB (GitHub Pages) ──► Cloudflare Worker ──► Enable Banking API ──► Tatra banka
   „🔄 Synchronizovať"    JWT RS256, session v KV     licencovaný AISP     SCA v IB
```

**Worker:** `https://fintb-worker.martin-ksinsky1.workers.dev`
Zdroj: `fintb_worker/worker.js` (v3 — Enable Banking adaptér, ~220 riadkov).
Navonok drží **rovnaký kontrakt ako Tatra Premium API tvar**, takže finTB o zmene
poskytovateľa nevie.

**Endpointy:** `/`, `/connect`, `/callback`, `/status`, `/accounts`,
`/sync?iban=…&from=…[&raw=1]`, `/banks?country=SK`, `/disconnect`.

**Cloudflare:**
- Secrets: `EB_APP_ID` (UUID = názov .pem súboru), `EB_PRIVATE_KEY` (obsah .pem, PKCS#8), `APP_KEY`
- Variables: `EB_ASPSP_NAME` = `Tatra banka`, `EB_ASPSP_COUNTRY` = `SK`, `EB_VALID_DAYS` (179)
- KV binding: `TOKENS`
- ⚠️ Zmeny premenných vyžadujú **Deploy** (dashboard ich len „pripraví").

**Enable Banking:** produkčná appka registrovaná (sandbox ostáva na testy).
Privacy/Terms: `https://johnmarkinson33.github.io/privacy.html` a `/terms.html`.
Súhlas platí **180 dní** (do 18. 1. 2027).
V SK registri je 25 bánk vrátane Slsp, Revolut, 365, ČSOB, VÚB, mBank, Wise, PayPal.

### 3.3 Bolestivé lekcie z ladenia
- `invalid_redirect_uri` → redirect URI musí byť **presná zhoda** vrátane `https://` a `/callback`.
- `invalid_scope` pri Premium API → autorizácia je pod `/premium/{env}/auth/oauth/v2`.
- `kid is missing in JWT` → chýbajúci secret `EB_APP_ID` (JSON prázdnu hodnotu vypustí).
- `Application does not exist` → `EB_APP_ID` nesedí (pozor na `.pem` príponu / zdvojené vloženie).
- **`#` v APP_KEY** rozbije `?k=` v URL (fragment) → appka posiela kľúč hlavičkou `x-app-key`.
- Schránka opakovane **zdvojuje** kopírované hodnoty — kontrolovať dĺžky (worker index ich vypisuje).

### 3.4 Integrácia v appke (v156–v159)
Sekcia **🔄 Synchronizácia s bankou** v modáli 🏦 Účty:
- polia URL workera + APP_KEY (`syncCfg` — perzistované na 7 miestach)
- **▶ Pripojiť banku**, **Načítať účty** (platnosť súhlasu, červené varovanie ≤7 dní)
- **🔄 Synchronizovať teraz** — prvý beh 90 dní, ďalšie od `syncCfg.last` s 5-dňovým presahom
- **📥 Prevziať zostatok z banky** (v157) — `_syncAdoptBalance()` upraví `openingBalance`
- **🧹 Odstrániť synchronizované** (v158) — `_syncPurge()`: maže len tx s `syncAdded:true`

**Funkcie:** `_syncFetch`, `_syncMapTx`, `_syncApply`, `_syncRuleCat`, `_syncLoadAccounts`,
`_syncNow`, `_syncAdoptBalance`, `_syncPurge`, `_renderSyncSec`.

**Dedup (`_syncApply`):**
1. `tbId` už v TX → skip. Sync je **idempotentný**.
2. PENDING sa preskakujú.
3. **Claim:** zhodná suma + dátum **±4 dni** + tatra + bez `tbId` → nepridá duplikát, len
   doplní `tbId` (najbližší dátum vyhráva). Tolerancia nutná: banka posiela dátum
   zaúčtovania, výpis dátum transakcie.
4. Nové tx dostanú `syncAdded:true` a prejdú `_matchRule`.

### 3.5 ⚠️ Reálne limity Tatry cez PSD2 (overené na surových dátach)
- **Kartové platby nemajú meno obchodníka** — `creditor: null`,
  `remittance_information: []`, `note: null`. Len suma, dátum a `bank_transaction_code`
  (`PMNT` / `CCRD` / `OTHR` / `CWDL`). **Žiadny iný poskytovateľ to nezlepší.**
  v159 mapuje: `CCRD+CWDL` → „Výber hotovosti", `CCRD` → „Kartová platba",
  flag `syncPlaceholder:true`.
- **Prevody od ľudí fungujú dobre** (`creditor.name` / `debtor.name` vyplnené).
- **Kreditná karta nie je cez PSD2 dostupná** — `/accounts` vracia len `CACC`.
  → kreditka ostáva na CSV importe.
- **Výhľad:** PSD3/PSR (~2027) zavádza data-access parity → mená obchodníkov by mali
  pribudnúť; súhlas sa predĺži na 365 dní.

**Dôsledok:** funguje **hybrid** — sync = prevody, zostatky, čerstvosť;
XLSX/CSV import = mená obchodníkov a kreditka.

---

## 4. Otvorené úlohy

### 4.1 ✅ Obohacovanie pri importe — HOTOVÉ vo v160
Import pri zhode (suma + dátum ±4 dni + `syncPlaceholder:true`) nepridá novú tx, ale
doplní meno obchodníka (+ miesto/číslo karty/VS) do existujúcej sync transakcie a spustí
`autocat()`. `tbId`/`syncAdded` ostávajú zachované. Pravidlo „najprv import, potom sync"
už **neplatí** — poradie je ľubovoľné. Detaily a root cause v §1, v160.

### 4.2 🔐 Bezpečnosť — overiť
Hodnota `APP_KEY` bola omylom vložená do chatu. Odporúčaná výmena
(Cloudflare → Settings → APP_KEY → nová hodnota → **Deploy** → prepísať v appke).
**Overiť, či sa to spravilo.**

### 4.3 🟠 Multibank sync
Worker dnes drží **jednu banku naraz** (jedna `EB_ASPSP_NAME`, jedna session v KV) a
**všetko syncnuté padá pod „Tatra"** bez ohľadu na zvolený IBAN. Ďalší krok: sessions per
banka, výber banky pri pripájaní, mapovanie IBAN → finTB účet.

### 4.4 🔵 Ostatné
- Aktualizovať `docs/finTB_roadmap.md` o v146–v159 + bankovú synchronizáciu.
- Voliteľné: PDF report s periódovými presetmi, Word export, porovnanie účtov vedľa seba.
- **Webhooky:** Enable Banking má vlastný model — preskúmať, ak bude záujem o notifikácie
  „N nových transakcií" bez pollingu.
