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

### 4.1 🔴 Obohacovanie pri importe (schválené v princípe, čaká na „poďme")
**Problém:** ak sync pridá kartovú platbu ako „Kartová platba" a **potom** sa importuje
XLSX s „ALZA.SK", merge to vyhodnotí ako novú transakciu → **duplikát**. Dnes preto platí
krehké pravidlo „najprv import, potom sync".

**Riešenie:** import pri zhode (suma + dátum ±4 dni + `syncPlaceholder:true`) **nepridá
novú tx, ale doplní meno obchodníka** do existujúcej sync transakcie (+ prípadne
miesto/číslo karty) a spustí naň `_matchRule`. Flag `syncPlaceholder` už existuje.

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
