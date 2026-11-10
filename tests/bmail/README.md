# b-mail fixtures — testovacia sada parsera

Šesť vzoriek podľa katalógu v `docs/finTB_zber_dat_analyza.md` §4.1, jedna na každý typ
správy. Sada pokrýva všetkých 12 pascí zo §4.4 a je **akceptačným kritériom Fázy B**.

```bash
cd tests && npm run bmail
```

Kým `fintb_worker/bmail.mjs` neexistuje, sada vypíše kontrakt, ktorý má parser splniť,
a skončí kódom 1. To je očakávaný stav.

Beh proti inému parseru (napr. rozpracovanému mimo repa):

```bash
FINTB_BMAIL=/cesta/k/parseru.mjs node bmail.mjs
```

## Anonymizácia — povinná

Repo je **verejné** (GitHub Pages). Vo fixtures preto nesmie byť nič reálne: žiadne
skutočné IBANy, čísla účtov, masky kariet, mená obchodníkov, sumy ani ID transakcií.
Všetky hodnoty nižšie sú vymyslené a zvolené tak, aby **štruktúra** zodpovedala realite.

| Údaj | Vymyslená hodnota |
|---|---|
| vlastný účet | `1234567890/1100` |
| protiúčty | `9988776655/0900`, `1112223334/0200` |
| maska karty | `123456******7890` |
| ID na účte | `041126/100001-1` … (dátum + poradie) |
| ID na karte | `4412345678` (10 číslic), `44120001` (8, uzávierka) |
| obchodníci | `KAVIAREN U JANA`, `TESTFIRMA, s.r.o.`, … |

Pri dopĺňaní vzorky z reálneho mailu **najprv prepíš hodnoty, až potom ulož do repa.**

## ⚠️ Čo je overené a čo rekonštruované

Fixtures nevznikli z reálnych mailov — nemal som ich k dispozícii. Vznikli z popisu
v §4.1, §4.2 a §4.4. Preto je nutné ich pri prvej reálnej vzorke prejsť.

**Overené z dokumentu** (ak sa nezhoduje, mýli sa dokument, nie fixture):

- tvary predmetov a tri tvary `ID` (§4.1)
- tvary `Popis transakcie` pre všetkých 6 typov (§4.1)
- `Informacia pre prijemcu` vs `Referencia platitela` podľa smeru (pasca 3)
- `Cislo karty` (typ 4) vs `Meno karty` (typ 5) (pasca 2)
- `Disponibilny zostatok` na karte = zvyšok úverového rámca, nie zostatok (§4.3)
- desatinná čiarka na účte, bodka na karte (pasca 1)
- `NOT PROVIDED` ako hodnota (pasca 4)
- diakritika v predmete len pri type 6 (pasca 6)
- `ID=` v tele typu 6 (pasca 7)
- čas `00:00` pri type 5 (pasca 10)
- existencia pätičky (pasca 11)
- koncová bodka za obchodníkom pri type 2 (pasca 12)

**Rekonštruované — overiť na prvom reálnom maili:**

| # | Predpoklad vo fixture | Čo spraviť, ak je inak |
|---|---|---|
| 1 | názvy polí `Ucet`, `Datum a cas`, `Suma`, `Uctovny/Aktualny/Disponibilny zostatok` | prepísať vo fixture aj v parseri |
| 2 | medzera ako oddeľovač tisícov (`1 234,56`) | ak banka tisíce neoddeľuje, upraviť fixture |
| 3 | formát dátumu `DD.MM.RRRR HH:MM` | upraviť fixture; parser má formát rozpoznať, nie hádať |
| 4 | prítomnosť `Variabilny symbol` v mailoch na účte | ak nechodí, zmazať z fixture a z `expected.mjs` |
| 5 | typ 2 (platba kartou z účtu) **nemá** `Ucet protistrany` | doplniť, ak chodí |
| 6 | prípona ` EUR` za sumou | upraviť fixture |
| 7 | presné znenie pätičky | upraviť fixture (test pasce 11 hľadá jej fragmenty) |
| 8 | typ 6 obsahuje `Datum uzavierky`, `Dlzna suma`, `Minimalna splatka`, `Datum splatnosti` | doplniť/premenovať |
| 9 | zahraničný nákup má tvar `zahr nakup` | otvorená otázka §11.2 — prípad je v `expected.mjs` označený `neoverene: true` |

Postup pri oprave: uprav fixture a zodpovedajúci záznam v `expected.mjs` **naraz**.
Fixture bez očakávaného výstupu nie je test.

## Čo sada zámerne NEtestuje

Reťaz zostatkov a `bmGap` (§5.2) — to je krok 5 Fázy B a testuje sa nad už naparsovanými
záznamami, nie nad mailmi. Sada končí pri parseri.

## Prečo nie je v `npm test`

`npm test` stráži `index.html` a musí byť zelený (vrátane byte-identického golden pivotu).
`npm run bmail` je zatiaľ červený zámerne, kým parser nevznikne. Po jeho dokončení sa
pridá do `test` skriptu.
