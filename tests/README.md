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

## Overené proti index.html (2026-07-26)
Scaffold bol pôvodne napísaný naslepo. Overenie ukázalo:

1. **Kľúče localStorage** — appka nepíše `localStorage.setItem` priamo, ale cez
   `Store.get/set(k)`, čo interne používa kľúč `'fintb_' + k` (pozri `Store` v index.html).
   TX → `Store.get('tx')` → `fintb_tx`. Kategórie **nie sú** jeden kľúč `cats` —
   BUILTIN_CATS sú natvrdo v kóde, testovacie kategórie treba seedovať ako
   `customCats` → `Store.get('customcats')` → `fintb_customcats`, v tvare
   `{id, l:label, c:color, builtin:false}` (nie `{name,color}`).
2. **ID kontajnera pivotu** — `<table id="pivot-tbl">`, naplní ho `renderPivot()`.
   `golden.mjs` má `PIVOT_IDS = ['pivot-tbl']`.
3. **Async loadAll()** — appka na štarte spúšťa `loadAll().then(...)` (async cez
   `Store.get`). `loadApp()` v `lib/dom.mjs` preto teraz **await**-uje pár macrotaskov
   po vytvorení JSDOM, aby TX/customCats boli naplnené skôr, než testy začnú čítať stav.
   `smoke.mjs`/`golden.mjs` preto musia `await loadApp(seed)`.

Baseline (`pivot_golden.json`) je vygenerovaný a skontrolovaný ručne — čísla v ňom
zodpovedajú invariantom v seed dátach (shared podiel, dateOverride, split, excluded).
