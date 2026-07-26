// Syntax check všetkých inline <script> blokov v index.html.
// Nahrádza pôvodný postup „extrahovať + node --check".
import fs from 'node:fs';
import vm from 'node:vm';
import { APP, appVersion } from './lib/dom.mjs';

const html = fs.readFileSync(APP, 'utf8');
const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];

if (!blocks.length) {
  console.error('✗ Nenašiel som žiadny inline <script> — skontroluj regex alebo súbor.');
  process.exit(1);
}

let fail = 0;
blocks.forEach((m, i) => {
  const code = m[1];
  // číslo riadku, kde blok začína — pre zmysluplnú chybovú hlášku
  const line = html.slice(0, m.index).split('\n').length;
  try {
    new vm.Script(code, { filename: `index.html:<script #${i + 1}> @riadok ${line}` });
  } catch (e) {
    fail++;
    console.error(`✗ Syntax error v scripte #${i + 1} (začína na riadku ${line}):\n  ${e.message}`);
  }
});

if (fail) process.exit(1);
console.log(`✓ syntax OK — ${blocks.length} inline scriptov, ${appVersion()}`);
