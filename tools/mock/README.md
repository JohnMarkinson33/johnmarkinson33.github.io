# Mock dáta pre finTB

Umelá, ale vnútorne konzistentná sada dát na testovanie appky — vrátane UI testovania
AI agentom. Pokrýva **všetky funkcie**, nie len transakcie.

## Načítanie

`fintb_mock.json` je **záloha**, nie bankový výpis. Načítava sa cez:

> **Dáta → ☁ Záloha → ↑ Import zálohy** → potvrdiť „Nahradiť všetky dáta"

⚠️ Import **prepíše všetko**, čo je v appke. Pred použitím na ostrých dátach si
sprav vlastnú zálohu (↓ Export zálohy).

## Pregenerovanie

Dátumy sú relatívne k dňu generovania. Po pár týždňoch bude „aktuálny mesiac"
v appke poloprázdny — vtedy pregeneruj:

```bash
node tools/mock/generate.mjs
```

```bash
node tools/mock/generate.mjs 2027-03-15
```

Generátor je deterministický (seedovaný RNG), takže rovnaký deň dá rovnaký výstup.

## Čo je vnútri

Stav k vygenerovaniu 25. 11. 2026 — po pregenerovaní sa čísla posunú, pomery ostanú.

| | |
|---|---|
| obdobie | 2025-10 → 2026-11 (14 mesiacov) |
| transakcie | 676 (účet 505, kreditka 171) |
| účty | Tatra (hlavný) + Slsp, Revolut, 365.bank |
| kategórie | 11 vstavaných + 10 vlastných (z toho 5 podkategórií, 1 investičná) |
| pravidlá | 15 · opakované platby | 13 · ciele | 4 |
| rozpočtové limity | 12 (mesačné, ročné, flexible/fixed, 1 s rolloverom, 1 bez limitu) |
| majetok | 8 položiek + 13 mesačných snapshotov |

**Zostatky:** Tatra 2 712,45 € · Slsp 1 834,78 € · Revolut 399,29 € · 365.bank 615,16 €

## Mapa na testovanie

Kde čo hľadať a čo tam má byť. Pre agenta, ktorý prechádza UI.

| Funkcia | Kde | Čo overiť |
|---|---|---|
| Dashboard, prehľad mesiaca | Dashboard | príjmy ~2,3 k €, výdavky, stav účtu, predpoveď, projekcia |
| Kreditka — cyklus | Dashboard ↓ | **čisté** čerpanie v dlaždici + „hrubé" v podnadpise, splátky ≠ 0 |
| Refundy na karte | rozbaliť ČERPANIE | 6 kladných súm **zelenou s +**, výdavky červenou |
| Zoznam, filtre, stránkovanie | Transakcie | filtre podľa účtu, kategórie, tagu, dátumu; hromadný režim |
| Odznak „neskontrolované" | Transakcie (tab) | **82** |
| Nezaradené | Transakcie → filter | **5** skutočne nezaradených |
| Detail transakcie | klik na riadok | kategória, tagy, poznámka, rozdelenie, zdieľanie, log úprav |
| Mesačný a ročný pivot | Analýza | rozbaľovanie podkategórií (Doprava → Palivo/MHD) |
| Za obdobie | Analýza → 📅 | presety aj vlastný rozsah, drill do kategórie |
| Tok (Sankey) | Analýza → 🔀 | príjmy → kategórie |
| Tagy | Analýza → 🏷 | 5 tagov: dovolenka, deti, auto, vianoce, firemné |
| Rozpočty | Budget | Flex aj Klasický pohľad, Reálne vs Plán, prekročenia |
| Presun prebytku | Budget → ↔ Presun | 3 existujúce presuny v aktuálnom a minulom mesiaci |
| Ciele | Ciele | 4 ciele vrátane jedného na **97 %** (Notebook 1 360/1 400 €) |
| Majetok | Majetok | čistý majetok ~103 k €, graf vývoja, koláč aktív |
| Opakované platby | Dashboard ↓ | 13 definícií — mesačné, štvrťročné, ročné, **týždenné** |
| Pohľadávky | Dashboard ↓ | **Zuzana dlhuje 86,20 €**, Peter vyrovnaný |
| Účty a rekonciliácia | 🏦 Účty | Tatra **sedí**, Slsp **nesedí o −12,40 €** |
| Export zálohy | Dáta → ☁ Záloha | export → opätovný import musí dať rovnaký stav |
| PDF report, XLSX export | Dashboard / Prehľady | generovanie reportov |

## Zámerné anomálie — nie sú to chyby appky

Agent ich nemá hlásiť ako bugy. Sú tam preto, aby bolo čo testovať.

- **Slsp rekonciliácia nesedí o −12,40 €** — testuje vetvu „nesedí" a korekčnú transakciu.
  Tatra naopak sedí presne.
- **5 nezaradených výdavkov** v aktuálnom mesiaci (SumUp, PayPal, trhovisko…).
- **1 nezúčtovaná (Autorizovaná)** transakcia na karte.
- **Otvorená pohľadávka 86,20 €** — Zuzana nevrátila podiel za Airbnb a obed,
  Peter vrátil 62,20 € a je vyrovnaný.
- **Platba rozdelená medzi 3 mesiace** (zimné pneumatiky, 3× 140 €) — `dateOverride`
  posúva časti dozadu.
- **Tag `firemné` je vylúčený z analýzy** → 3 transakcie nevidno v súčtoch, ale sú v zozname.
- **Korekčná transakcia** (`reconAdjust`, −12,40 €) je `excluded`, teda mimo výdavkov.
- **Párové presuny medzi vlastnými účtami** sú `excluded` — nesmú sa objaviť
  ani v príjmoch, ani vo výdavkoch.
- **Splátky kreditky** majú dve nohy (odliv z účtu + kladný pohyb na karte) a sú
  mimo výdavkov cez `isCCRepayment`.
- **Kategória Vzdelávanie je zaradená bez limitu** — platný stav, nie chýbajúce dáta.
- **Opakovaná platba „Starý časopis" je neaktívna**, „Fitness permanentka" má
  v aktuálnom mesiaci blokovanie.

## Čo mock nepokrýva

- **Import výpisov** (XLS/CSV) — to sa testuje skutočnými súbormi, nie zálohou.
- **Google Drive sync** — vyžaduje PIN a reálne Google konto.
- **Banková synchronizácia** — archivovaná, `syncCfg` je prázdny zámerne.
- **XTB import a investičné pozície** — do zálohy sa neukladajú (len `fundNames`),
  takže graf investícií stojí na položke Majetku a kategórii *ETF portfólio*.

## Pri zmene formátu zálohy

Generátor kopíruje tvar `exportBackup()` (`version: 5`). Ak sa v `index.html` zmení
zoznam kľúčov v zálohe, treba upraviť aj `generate.mjs` — inak sa nová vec do mocku
nedostane a bude vyzerať ako nepodporovaná.
