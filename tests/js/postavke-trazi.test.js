const assert = require('assert');
const { kopijaStanje, pretrazi } = require('../../static/js/izgled.js');
let ok = 0, fail = 0;
const t = (n, f) => { try { f(); ok++; console.log('  ✔ ' + n); } catch (e) { fail++; console.log('  ✖ ' + n + '\n    ' + e.message); } };
const now = Date.parse('2026-11-05T12:00:00Z');
t('kopija: nikad, danas, jučer, star', () => {
  assert.strictEqual(kopijaStanje(null, now).nivo, 'nikad');
  assert.strictEqual(kopijaStanje('2026-11-05T01:00:00Z', now).tekst, 'Zadnja kopija: danas');
  assert.strictEqual(kopijaStanje('2026-11-04T01:00:00Z', now).tekst, 'Zadnja kopija: jučer');
  assert.strictEqual(kopijaStanje('2026-10-01T00:00:00Z', now).nivo, 'star');
  assert.strictEqual(kopijaStanje('2026-10-30T00:00:00Z', now).nivo, 'ok');
});
t('pretraga: naslov ima prednost, kratak upit prazan', () => {
  const b = [{ id: 'a', naslov: 'Dugmad', str: '', tekst: 'gps tačnost' }, { id: 'b', naslov: 'GPS i baterija', str: '', tekst: 'x' }];
  assert.deepStrictEqual(pretrazi('g', b), []);
  assert.deepStrictEqual(pretrazi('GPS', b).map(x => x.id), ['b', 'a']);
  assert.deepStrictEqual(pretrazi('nema', b), []);
});
console.log(ok + ' prošlo, ' + fail + ' palo — postavke-trazi'); process.exit(fail ? 1 : 0);
