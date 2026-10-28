const assert = require('assert'), fs = require('fs');
const P = require('../../static/js/mjerenja-povrsina.js');
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('  ✔ ' + n); } catch (e) { process.exitCode = 1; console.log('  ✘ ' + n + '\n      ' + e.message); } };
t('mali poligon u m², hektari u podređenom redu', () => { const f = P.fmt(812); assert.strictEqual(f.g, '812'); assert.strictEqual(f.j, 'm²'); assert.strictEqual(f.pod, '0,08 ha'); });
t('ha sa zarezom i ha-a-m² razlomak', () => { const f = P.fmt(23512); assert.strictEqual(f.g, '2,35'); assert.strictEqual(f.j, 'ha'); assert.strictEqual(f.puno, '2 ha 35 a 12 m²'); assert.strictEqual(f.pod, f.puno); });
t('veliko: jedna decimala pa cijeli brojevi', () => { assert.strictEqual(P.fmt(2345678).g, '234,6'); assert.strictEqual(P.fmt(12345678).g, '1 235'); });
t('haTekst za zbir', () => { assert.strictEqual(P.haTekst(0.05), '500 m²'); assert.strictEqual(P.haTekst(12.3456), '12,35 ha'); });
t('težište udubljenog (L) oblika je unutar poligona', () => {
  const L = [[0, 0], [0, 3], [1, 3], [1, 1], [3, 1], [3, 0]].map(([x, y]) => ({ lat: 44 + y * 0.001, lng: 16 + x * 0.001 }));
  const c = P.centar(L);
  // točka (1.0..) u L: unutar kad je x<1 ili y<1
  const x = (c.lng - 16) / 0.001, y = (c.lat - 44) / 0.001;
  assert.ok(x < 1 || y < 1, 'težište van: ' + x + ',' + y);
});
t('težište pravougaonika u sredini', () => {
  const c = P.centar([[0, 0], [0, 2], [2, 2], [2, 0]].map(([x, y]) => ({ lat: 44 + y * 0.001, lng: 16 + x * 0.001 })));
  assert.ok(Math.abs(c.lat - 44.001) < 1e-6 && Math.abs(c.lng - 16.001) < 1e-6);
});
t('natpis escapuje i ne prima proizvoljnu boju', () => { const h = P.natpis(23512, 'red"><script>', false); assert.ok(!h.includes('<script>') && h.includes('--c:#a78bfa')); });
t('povezano u aplikaciju', () => {
  const H = fs.readFileSync(__dirname + '/../../index.html', 'utf8');
  assert.ok(H.includes('static/js/mjerenja-povrsina.js') && H.includes('USFPov.natpis') && H.includes('USFPov.fmt'));
  assert.ok(fs.readFileSync(__dirname + '/../../sw.js', 'utf8').includes('mjerenja-povrsina.js'));
  assert.ok(fs.readFileSync(__dirname + '/../../android/copy-assets.sh', 'utf8').includes('mjerenja-povrsina.js'));
});
console.log('\n' + pass + ' prošlo — mjerenja površina');
