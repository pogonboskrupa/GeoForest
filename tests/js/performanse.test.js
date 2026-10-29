const assert = require('assert'), fs = require('fs');
const R = f => fs.readFileSync(__dirname + '/../../' + f, 'utf8');
const H = R('index.html'), D = R('static/js/doznaka.js'), C = R('static/css/geoforest.css');
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('  ✔ ' + n); } catch (e) { process.exitCode = 1; console.log('  ✘ ' + n + '\n      ' + e.message); } };
t('nema blur() backdrop-filtera na stalnim elementima', () => {
  const m = (H + C).match(/backdrop-filter\s*:\s*blur\([^)]*\)/g) || [];
  assert.deepStrictEqual(m, [], 'blur: ' + m.join(' | '));
});
t('blur dugmadi/koordinata ide samo preko --ui-bf (zadano none)', () => {
  assert.ok(H.includes("var(--ui-bf,none)") && H.includes("--ui-bf"));
  assert.ok(!H.includes("blur(var(--ui-blur"));
});
t('Doznaka ne pravi novi L.canvas pri svakom crtanju', () => {
  const n = (D.match(/L\.canvas\(/g) || []).length;
  assert.strictEqual(n, 1, 'L.canvas( mora biti samo u pomoćnoj funkciji rendera, a ima ih ' + n);
  assert.ok(D.includes('rendera(rendSl') && D.includes('rendera(rendIzb'));
});
t('KML renderer nema ogroman padding', () => { assert.ok(/_kmlRenderer = L\.canvas\(\{ pane: 'tragMsrLines', padding: 0\.4 \}\)/.test(H)); });
t('visina u značci koordinata je odgođena', () => { assert.ok(H.includes('_geoBadgeT = setTimeout(_geoBadgeUpdate, 350)')); });
console.log('\n' + pass + ' prošlo — performanse');
