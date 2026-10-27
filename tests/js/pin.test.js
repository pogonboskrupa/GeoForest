'use strict';
// GeoForest nema PIN sekcija (Šumarstvo, Sušenje, Požari, Projektovanje puta su uklonjeni).
// Ostaje samo PIN karata (mjesečni, drive-karte.js) i zajednički unos _pinUnos s pauzom poslije 5 grešaka.
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const HTML = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
let pass = 0;
const t = (ime, fn) => { try { fn(); pass++; console.log('  ✔ ' + ime); } catch (e) { console.error('  ✘ ' + ime + '\n      ' + e.message); process.exitCode = 1; } };
console.log('PIN karata (bez PIN-a sekcija):');

t('nema PIN-a sekcija ni dugmeta „Zaključaj zaštićene sekcije”', () => {
  for (const x of ['_PIN_HES', '_PIN_SOL', '_pinTrazi', '_pinOtkljucano', '_pinZakljucaj', 'set-pin-zakljucaj', 'usf_pin_ok']) assert.ok(!HTML.includes(x), x);
});

t('zajednički unos _pinUnos: 4 cifre, pauza 30 s poslije 5 grešaka, koristi ga PIN karata', () => {
  const i = HTML.indexOf('async function _pinUnos('), f = HTML.slice(i, HTML.indexOf('\n}', i));
  assert.ok(i > 0 && f.includes('/^\\d{4}$/.test(pin)') && f.includes('n >= 5 ? { n: 0, do: Date.now() + 30000 }'));
  assert.ok(HTML.includes("await _pinUnos('', 'usf_karte_greske',"), 'PIN karata ide kroz _pinUnos');
});

console.log('\n' + pass + ' prošlo, ' + (process.exitCode ? 'IMA PALIH' : '0 palo') + ' — PIN');
