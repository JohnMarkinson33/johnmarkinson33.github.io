# finTB — kontext pre nový chat (stav: v159, júl 2026)

> Skopíruj celý tento súbor do prvej správy nového chatu (alebo ho nahraj ako prílohu).
> Obsahuje všetko potrebné: pravidlá práce, invarianty kódu, históriu, stav bankovej synchronizácie a otvorené úlohy.

---

## 0. Ako so mnou pracovať (Mato)

- **Komunikácia po slovensky**, vrátane komentárov v kóde.
- **Priama implementácia** pri UI, kozmetike, bugfixoch a jasne zadaných veciach.
- **Návrh s rozhodovacími bodmi + odporúčaním** pri architektúre alebo novom dátovom koncepte — počkaj na „poďme" / „podľa odporúčaní".
- Pri deployi vždy vysvetli: **root cause → čo sa zmenilo → ako to otestovať na desktope**.
- Máš **stále povolenie pokračovať v práci**, kým testujem.
- Verzie číslujem **sekvenčne** (v159 → v160 → …).

---

## 1. Projekt

**finTB** = jednosúborová HTML appka na osobné financie (vanilla JS, localStorage, SheetJS z CDN, Canvas grafy, **žiadny framework, žiadny backend v appke**). Vývojár aj jediný používateľ = Mato. Primárne **Android PWA**, desktop na vývoj a hlbšiu analýzu.

**Nasadenie:** GitHub Pages, repo `johnmarkinson33.github.io`, appka je `index.html` v koreni.
Vedľa nej musia ležať (nemazať!): `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `privacy.html`, `terms.html`.

**Podporované banky pri importe:** Tatra banka (XLS/XLSX + CSV kreditná karta), 365.bank, Slsp, Revolut. Plus **live sync s Tatrou** (viď §6).

---

## 2. Povinný build postup (nemenný)

1. **Čítať kód pred editom** cez `sed -n` / `grep -n` — nikdy needitovať naslepo.
2. Zmeny cez Python `str.replace` s **`assert count==N`** guardom (helper `rep(old,new,label,n=1)`).
   - Ak `rep` raisne, súbor sa **nezapíše** (write je na konci) → oprav kotvu a spusti **celý skript znova**.
3. `node --check` na extrahovaných inline scriptoch:
   `re.findall(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', c, re.S)`
4. **jsdom testy** + **golden pivot snapshot** musí byť byte-identický.
5. Bump verzie v `title="verzia buildu">vNN`.
6. Deploy: `rm -f /mnt/user-data/outputs/index.html`, `sleep 1`, `cp`, potom `present_files`.

### ⚠️ Scratch sa resetuje
`/home/claude` sa medzi sedeniami **vyprázdňuje** (stalo sa v júli 2026 a znova pri prechode do tohto chatu). Prvý krok v novom chate:

```bash
cp /mnt/user-data/outputs/index.html /home/claude/fintb_v69.html   # pracovná kópia sa VŽDY volá fintb_v69.html
cd /home/claude && npm install jsdom xlsx
```

Potom **znova vytvoriť golden baseline** (`gen_pivot_snapshot.mjs` + `pivot_golden.json`) z aktuálnej verzie a nové test sady podľa potreby. Staré testy (test_v139 … test_v158) sú stratené — kód appky je ale neporušený.

### jsdom boilerplate (funkčný)
```js
const dom=new JSDOM(html,{url:'https://localhost/',runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
  w.HTMLCanvasElement.prototype.getContext=function(){return new Proxy({},{get:(t,p)=>{
    if(p==='measureText')return()=>({width:10});
    if(p==='createLinearGradient'||p==='createRadialGradient')return()=>({addColorStop:()=>{}});
    return()=>{};},set:()=>true});};
  w.HTMLCanvasElement.prototype.toDataURL=()=>'data:,';
  w.HTMLElement.prototype.scrollIntoView=()=>{};w.alert=()=>{};w.confirm=()=>true;w.print=()=>{};w.prompt=()=>'2';
  w.matchMedia=w.matchMedia||(()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));
}});
```
- `url:'https://localhost/'` je **povinné** (inak SecurityError na localStorage).
- `E = s => w.eval(s)`; `saveD=function(){}` stubnúť.
- Function declarations (renderTx, renderBudget, renderPivot, initPrehlady, openMoveMoney, XLSX.writeFile…) sú **reassignovateľné** na spy/stub.
- Module-level `let` (TX, anMonth, anYear) **nie sú** dostupné ako `window.X` — len cez `E()`.
- Selecty: hodnota sa nastaví len ak **option existuje** → najprv `el.innerHTML='<option value="…">…</option>'` (platí pre `bg-mon`, `cmp-a`, `cmp-b`, `cf-year`, `an-line-year`).
- Testovacie dáta musia byť v **aktuálnom kalendárnom mesiaci** (anMonth sa inicializuje z `new Date().getMonth()`).
- Seed localStorage v `beforeParse` používa **ISO stringy**, nie Date objekty.

---

## 3. Dátový model — INVARIANTY (porušenie = tiché chyby)

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

**BUILTIN kategórie:** potraviny, doprava, restauracie, nakupy, byvanie, zdravie, zabava, cestovanie, sluzby, sporenie, ostatne. (Test dáta nesmú kolidovať s týmito ID.)

**Architektonické rozhodnutia:**
- Analytické funkcie **nikdy** nečítajú goals/budgetMoves (bráni dvojitému počítaniu).
- Priradenie k cieľu **nemutuje** transakcie.
- Detekcia opakujúcich sa platieb len **navrhuje**, plná manuálna kontrola.
- Sporiace ciele **mimo** net worth (double-counting).
- TX splits: `tx.splits=[{category,amount}]`, žiadne virtuálne záznamy.
- Shared: `tx.shared={people:[{name,amount}]}` na výdavku, `tx.debtLinks=[{expTxId,personName,amount}]` na príjme.
- `categoryLocked` nastavuje `setCat()` / `_setCatLocked()` — **nie** `autoSaveDet()`.
- CSS base rules musia byť **pred** media queries pri rovnakej špecificite.

---

## 4. História v134 → v159

**v134–v137 (Balík 8 — multibank):** `_anBank` scope ('tatra' default), párové presuny, Revolut poplatky, Slsp `bankCat`, `_accClearTxs`, Slsp stávková kniha.

**v138–v141 (Balík 9 — reporty):** PDF mesačný report (canvas grafy → PNG, print CSS), XLSX export (3 hárky so vzorcami), tab **📅 Za obdobie** (presety + vlastný rozsah), tab **🔀 Tok** (Sankey inline SVG).

**v142–v143 (Balík 10 — správnosť):** rekonciliácia zostatkov (`reconciliations` na 7 miestach, korekčná tx `reconAdjust:true, excluded:true`); **splits audit** — opravené 3 úniky (rozpočet čítal surové TX → ignoroval excluded/CC/scope!, budget drill, investície).

**v144:** shared → **net** zjednotenie (PDF report, Za obdobie, XLSX Mesačný) — súčty konečne sedia s dashboardom.

**v145:** CSS zladenie pivotu; overené, že Budget vs actual je hotový a správny (netreba meniť).

**v146–v148 (PWA fix):** pôvodne blob: manifest **aj** blob: SW → Chrome oboje odmieta, inštalácia nikdy nemohla fungovať (chyby prehltnuté v prázdnom `.catch`). Riešenie: statické `manifest.json` + `sw.js` + 3 ikony, `beforeinstallprompt` → tlačidlo ⬇ v hlavičke, **📲 PWA diagnostika** v Dátach. **Bug v mojom SW:** `caches.addAll` je atomický → cachovanie po jednom (v148).
**Rozuzlenie:** Matov Pixel neponúkal inštaláciu, lebo **Pixel Launcher nebol predvolený** (Chrome vtedy prompt potichu potlačí) — našiel na Reddite. Boli to teda **dve nezávislé chyby**.

**v149–v150 (dizajn):** tri úrovne ovládačov — pohľady = **podčiarknuté taby**, filtre období/účtu = **`.seg` segmented control**, tagy = **999px pill chipy**. Pivot: `.hc` = **cell-tint** (color-mix 11 %), hairline oddeľovače. **Cashflow presunutý do Prehľadov**; `_syncAnLineToPivot()` — graf Vývoj kategórií sleduje zvolené obdobie pivotu.

**v151:** Sankey label vo vyhradenom páse (TOP=34); **drill kategórie v Za obdobie**; goal picker **len príjmy** (Math.abs by výdavok chybne pripočítal); **strop presunu prebytku** `_catAvailForMove()` + hint `#mv-avail`.

**v152:** **📅 Rozdelenie platby medzi mesiace** — `splitTxAcrossMonths()`, 2–12 častí, centové delenie, `dateOverride` dozadu, day-clamp na kratší mesiac, `monthSplitGroup`/`monthSplitPart`, opätovný klik = zlúčenie späť. Guardy: transferPair/splits/shared/debtLinks.

**v153 (audit — červené):** Porovnanie období aj Cashflow cez `anTx({})` + `txMyAmount` (predtým surové TX → presuny nafukovali obe strany); Top obchodníci a Výdavky v čase na net; goal picker vylučuje excluded/transferPair/CC; budget drill sort podľa `eDate`.

**v154 (oranžové + modré):** XLSX stĺpec **Môj podiel**; `avgMonths = dni/30.44`; backup filename cez `localDateKey`; riadok „VYLÚČIŤ TAGY" skrytý na tabe Tagy; **scope selektor na Prehľadoch**; `_anRerender` rozšírený (bol slepý na period/sankey/prehlady).

**v155:** 📅 badge v analýza drille + pole v detaile; detail Suma cez `txMyAmount` → „tvoj príjem (zostatok po vrátkach)" + fix dvojitého €€; **🎯 presun prebytku priamo z budget drillu**; **ročný aj mesačný pivot: príjmovo-dominantné kategórie ukazujú čistý tok každý mesiac** (príčina: clamp `Math.max(0,-v)` orezával záporné mesiace na „—"). Pozor: pivot má **viac builderov** príjmových riadkov.

**v156–v159:** banková synchronizácia — viď §6.

---

## 5. Stav roadmapy

Balíky **1–10 hotové** (3 zrušený, 2b Share Target odložený). Všetky drobnosti z §8 roadmapy hotové.
Roadmapa: `/mnt/user-data/outputs/finTB_roadmap.md` (v5, stav v145 — **treba doplniť v146–v159**).

Vedome vynechané:
- **Swipe kategorizácia** — VYRADENÁ (kedysi bola, robila problémy, appka je primárne desktop).
- **Zlúčenie mesačného a ročného pivotu** — POTVRDENÉ nezlučovať: render funkcie sa zhodujú len na **~26 %**, výpočtové jadro (`buildPivotData`) už zdieľajú; líšia sa buckety (týždne vs 12 mesiacov), navigácia a sekcia „Vyrovnané".

Neschválené nápady: PDF report s periódovými presetmi, Word (docx) export, dedikované porovnanie účtov vedľa seba.

---

## 6. BANKOVÁ SYNCHRONIZÁCIA — kompletný príbeh a stav

### 6.1 Cesty, ktoré sme preverili
- **Vlastná AISP licencia** (NBS, eIDAS) → nereálne.
- **GoCardless/Nordigen free tier** → **zrušený** pre nové registrácie (pôvodné odporúčanie neplatí).
- **Tatra Premium API** (cesta C) → sandbox rozbehnutý a **funkčný**, ale produkcia **ZAMIETNUTÁ**:
  > „Túto službu poskytujeme len firemným klientom, je mi preto ľúto, nevieme Vám ako fyzickej osobe službu poskytnúť."
- **Enable Banking** (cesta B) → **VÍŤAZ, beží v produkcii.**
- **Scraping** → nie (zakázaný, PSD3 to potvrdzuje).

### 6.2 Čo beží dnes
```
finTB (GitHub Pages) ──► Cloudflare Worker ──► Enable Banking API ──► Tatra banka
   „🔄 Synchronizovať"      JWT RS256, session v KV        licencovaný AISP        SCA v IB
```

**Worker:** `https://fintb-worker.martin-ksinsky1.workers.dev`
Zdroj: `/mnt/user-data/outputs/fintb_worker/worker.js` (**v3 — Enable Banking adaptér**, 220 riadkov).
Navonok drží **rovnaký kontrakt ako Tatra Premium API tvar**, takže finTB o zmene poskytovateľa nevie.

**Endpointy:** `/` (index + config check), `/connect`, `/callback`, `/status`, `/accounts`, `/sync?iban=…&from=…[&raw=1]`, `/banks?country=SK`, `/disconnect`.

**Cloudflare nastavenia:**
- Secrets: `EB_APP_ID` (UUID = názov .pem súboru), `EB_PRIVATE_KEY` (celý obsah .pem, PKCS#8), `APP_KEY`
- Variables: `EB_ASPSP_NAME` = `Tatra banka`, `EB_ASPSP_COUNTRY` = `SK`, `EB_VALID_DAYS` (default 179)
- KV binding: `TOKENS`
- ⚠️ Zmeny premenných vyžadujú **Deploy** (dashboard ich len „pripraví").

**Enable Banking:** produkčná aplikácia registrovaná (sandbox appka ostáva na testy). Privacy/Terms URL sú `https://johnmarkinson33.github.io/privacy.html` a `/terms.html` (súbory v `fintb_legal/`).
**Súhlas platí 180 dní** (do 18. 1. 2027). Všetky SK banky majú `maximum_consent_validity: 15552000`.

**V registri SK sú:** Tatra banka, Slovenská sporiteľňa, Revolut, 365.Bank, ČSOB, VÚB, mBank, Wise, PayPal a ďalšie (25 bánk) — **multibank je teda možný** (viac než ponúkalo Premium API).

### 6.3 Bolestivé lekcie z ladenia (nech sa neopakujú)
- `invalid_redirect_uri` → redirect URI musí byť **presná zhoda** vrátane `https://` a `/callback`.
- `invalid_scope` pri Premium API → autorizácia je pod `/premium/{env}/auth/oauth/v2`, **nie** `/sandbox/auth/…` (to je PSD2 endpoint, kde klient scope nemá).
- `kid is missing in JWT` → chýbajúci secret `EB_APP_ID` (JSON prázdnu hodnotu vypustí).
- `Application does not exist` → `EB_APP_ID` nesedí (pozor na `.pem` príponu alebo zdvojené vloženie).
- **`#` v APP_KEY** rozbije `?k=` v URL (fragment) → appka posiela kľúč **hlavičkou `x-app-key`**.
- Schránka Matovi opakovane **zdvojuje** kopírované hodnoty — pri Client ID, URL aj kľúčoch to skontrolovať (worker index vypisuje dĺžky).

### 6.4 Integrácia v appke (v156–v159)
Sekcia **🔄 Synchronizácia s bankou** v modáli 🏦 Účty:
- polia URL workera + APP_KEY (`syncCfg` — persistované na 7 miestach ako `reconciliations`)
- **▶ Pripojiť banku** (otvorí `/connect`), **Načítať účty** (naplní select + ukáže platnosť súhlasu, červené varovanie ≤7 dní)
- **🔄 Synchronizovať teraz** — prvý beh 90 dní, ďalšie od `syncCfg.last` s 5-dňovým presahom
- **📥 Prevziať zostatok z banky** (v157) — `_syncAdoptBalance()` upraví `openingBalance` tak, aby vypočítaný == bankový `interimAvailable`
- **🧹 Odstrániť synchronizované** (v158) — `_syncPurge()`: maže len tx s `syncAdded:true`, spárovaným len odoberie `tbId`

**Kľúčové funkcie:** `_syncFetch`, `_syncMapTx`, `_syncApply`, `_syncRuleCat`, `_syncLoadAccounts`, `_syncNow`, `_syncAdoptBalance`, `_syncPurge`, `_renderSyncSec`.

**Dedup logika (`_syncApply`):**
1. `tbId` (bankové ID) už v TX → skip. Sync je **idempotentný**.
2. PENDING sa preskakujú (ešte sa menia).
3. **Claim:** zhodná suma + dátum **±4 dni** + tatra + bez `tbId` → nepridá duplikát, len doplní `tbId` (najbližší dátum vyhráva). Tolerancia je nutná, lebo banka posiela dátum **zaúčtovania**, výpis dátum transakcie.
4. Nové tx dostanú `syncAdded:true` a prejdú `_matchRule` (auto-kategorizácia).

### 6.5 ⚠️ Reálne limity Tatry cez PSD2 (overené na surových dátach)
- **Kartové platby nemajú meno obchodníka** — `creditor: null`, `remittance_information: []`, `note: null`. Banka pošle len sumu, dátum a `bank_transaction_code` (`PMNT` / `CCRD` / `OTHR` / `CWDL`). **Žiadny iný poskytovateľ to nezlepší** — všetci čítajú to isté PSD2 rozhranie. v159 preto mapuje: `CCRD+CWDL` → „Výber hotovosti", `CCRD` → „Kartová platba", flag `syncPlaceholder:true`.
- **Prevody od ľudí fungujú dobre** (`creditor.name` / `debtor.name` vyplnené).
- **Kreditná karta nie je cez PSD2 dostupná** — `/accounts` vracia len bežný účet `CACC`. (Kreditky do rozsahu PSD2 formálne patria, takže sa dá skúsiť mail na PSD2 podporu Tatry, ale očakávanie nízke.) → **kreditka ostáva na CSV importe**.
- **Výhľad:** PSD3/PSR (~2027) zavádza **data-access parity** — TPP majú dostať tie isté dáta, aké banka ukazuje vlastným klientom → mená obchodníkov by mali pribudnúť; súhlas sa predĺži na 365 dní.

**Dôsledok:** funguje **hybrid** — sync = prevody, zostatky, čerstvosť; XLSX/CSV import = mená obchodníkov a kreditka.

---

## 7. OTVORENÉ ÚLOHY (v poradí dôležitosti)

### 7.1 🔴 Obohacovanie pri importe (schválené v princípe, čaká na „poďme")
**Problém:** ak sync pridá kartovú platbu ako „Kartová platba" a **potom** sa importuje XLSX s „ALZA.SK", merge to vyhodnotí ako novú transakciu → **duplikát**. Dnes preto platí krehké pravidlo „najprv import, potom sync".

**Riešenie:** import pri zhode (suma + dátum ±4 dni + `syncPlaceholder:true`) **nepridá novú tx, ale doplní meno obchodníka** do existujúcej sync transakcie (+ prípadne miesto/číslo karty) a spustí naň `_matchRule`. Flag `syncPlaceholder` na to už existuje.

### 7.2 🔐 Bezpečnosť — overiť
Mato omylom vložil do chatu hodnotu `APP_KEY` (`Tb8RZVQydsZx42`). Bolo mu odporučené ju **vymeniť** (Cloudflare → Settings → APP_KEY → nová hodnota → Deploy → prepísať v appke). **Overiť, či to spravil.**

### 7.3 🟠 Multibank sync
Dnes worker drží **jednu banku naraz** (jedna premenná `EB_ASPSP_NAME`, jedna session v KV) a **všetko syncnuté padá pod „Tatra"** bez ohľadu na zvolený IBAN. Keďže EB má v SK registri aj Slsp, Revolut a 365, ďalší krok je: sessions per banka, výber banky pri pripájaní, mapovanie IBAN → finTB účet.

### 7.4 🔵 Ostatné
- Aktualizovať `finTB_roadmap.md` o v146–v159 + bankovú synchronizáciu.
- Obnoviť testovaciu infraštruktúru (§2) — golden baseline + nové sady.
- Voliteľné: PDF report s periódovými presetmi, Word export, porovnanie účtov vedľa seba.
- **Webhooky** (Fáza D): Tatra Premium API ich podporovala, Enable Banking má vlastný model — preskúmať, ak bude záujem o notifikácie „N nových transakcií" bez pollingu.

---

## 8. Súbory v `/mnt/user-data/outputs/`

| Súbor | Popis |
|---|---|
| `index.html` | **appka v159** — nahrávať do repo |
| `manifest.json`, `sw.js`, `icon-192/512/maskable-512.png` | PWA súbory (nemeniť, nemazať) |
| `privacy.html`, `terms.html` (v `fintb_legal/`) | právne stránky pre Enable Banking |
| `fintb_worker/worker.js` | **Worker v3** (Enable Banking) — vkladať do Cloudflare Edit code |
| `fintb_worker/README_worker.md` | návod na nasadenie workera (písaný ešte pre Tatra Premium API — **čiastočne neaktuálny**, secrets sú dnes EB_*) |
| `finTB_roadmap.md` | roadmapa v5 (stav v145) |
| `finTB_faza_A_checklist.md` | historický checklist overovania poskytovateľov (splnené) |

**Pri deployi appky:** meniť len `index.html`. SW je network-first, takže nová verzia sa načíta hneď.
