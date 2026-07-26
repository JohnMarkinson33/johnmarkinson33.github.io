# finTB testy

## Inštalácia (raz)
```bash
cd tests && npm install
```

## Beh
```bash
npm test        # syntax + smoke + golden porovnanie
npm run syntax  # len syntax check inline scriptov
npm run smoke   # len invarianty dátového modelu
npm run golden  # PREPÍŠE golden snapshot (len pri zámernej zmene výpočtu)
npm run check   # len porovnanie proti golden
```

## Prvé spustenie po migrácii
Scaffold je napísaný naslepo — bez prístupu k `index.html`. Treba overiť:

1. **Kľúče localStorage** v `lib/seed.mjs`
   `grep -n "localStorage.setItem" ../index.html`
2. **ID kontajnera pivotu** v `golden.mjs` (pole `PIVOT_IDS`)
   `grep -n 'id="piv' ../index.html`
3. **Tvar `getTxCatAmounts()`** — smoke test zvláda pole aj objekt, ale over výsledok.

Až keď `npm run smoke` prejde celé, spusti `npm run golden` a commitni baseline.
