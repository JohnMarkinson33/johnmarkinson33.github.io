// Spoločný jsdom loader pre finTB.
// Overený boilerplate — canvas stub, localStorage seed, eval helper.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const APP = path.resolve(HERE, '../../index.html');

/**
 * Načíta appku v jsdom.
 * @param {object} seed  objekt {kluc: hodnota} do localStorage (hodnoty sa JSON.stringify-ujú)
 * @returns {{dom, w, doc, E}}  E = eval v kontexte okna (nutné pre module-level `let`)
 */
export function loadApp(seed = {}) {
  const html = fs.readFileSync(APP, 'utf8');

  const dom = new JSDOM(html, {
    url: 'https://localhost/',          // POVINNÉ — inak SecurityError na localStorage
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(w) {
      // --- canvas stub ---
      w.HTMLCanvasElement.prototype.getContext = function () {
        return new Proxy({}, {
          get: (t, p) => {
            if (p === 'measureText') return () => ({ width: 10 });
            if (p === 'createLinearGradient' || p === 'createRadialGradient')
              return () => ({ addColorStop: () => {} });
            return () => {};
          },
          set: () => true
        });
      };
      w.HTMLCanvasElement.prototype.toDataURL = () => 'data:,';

      // --- ostatné stuby ---
      w.HTMLElement.prototype.scrollIntoView = () => {};
      w.alert = () => {};
      w.confirm = () => true;
      w.print = () => {};
      w.prompt = () => '2';
      w.matchMedia = w.matchMedia || (() => ({
        matches: false,
        addEventListener() {}, removeEventListener() {},
        addListener() {}, removeListener() {}
      }));

      // --- seed localStorage PRED spustením skriptov appky ---
      // Dátumy musia byť ISO stringy, nie Date objekty.
      for (const [k, v] of Object.entries(seed)) {
        w.localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
      }
    }
  });

  const w = dom.window;
  const E = s => w.eval(s);

  // saveD stubneme, aby testy nezapisovali do localStorage medzi krokmi
  try { E('saveD = function(){}'); } catch { /* funkcia sa môže volať inak */ }

  return { dom, w, doc: w.document, E };
}

/** Normalizácia textu pre snapshoty — zjednotí whitespace a NBSP. */
export function norm(s) {
  return String(s).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Verzia buildu z title atribútu. */
export function appVersion() {
  const html = fs.readFileSync(APP, 'utf8');
  const m = html.match(/title="verzia buildu"[^>]*>\s*(v\d+)/);
  return m ? m[1] : 'unknown';
}
