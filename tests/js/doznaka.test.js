// Doznaka stabala: podjela odjela po najbližem pojasu, KML izvoz/uvoz, povezanost u index.html
const assert = require('assert'), fs = require('fs'), path = require('path');
global.window = global; global.turf = require('../../static/libs/turf.min.js');
const R = f => fs.readFileSync(path.join(__dirname, '../..', f), 'utf8');
const D = require('../../static/js/doznaka.js');
let pass = 0;
const t = (ime, fn) => { try { fn(); pass++; console.log('  ✔ ' + ime); } catch (e) { console.error('  ✘ ' + ime + '\n      ' + e.message); process.exitCode = 1; } };

// kvadrat ≈ 200 × 200 m kod 44.5° N / 16.3° E (lokalna ravan → metri)
const P = D.ravan(44.5, 16.3), ll = (x, y) => P.bw([x, y]);
const odjel = [[0, 0], [200, 0], [200, 200], [0, 200]].map(q => ll(...q));
const pojas = x => [ll(x, 10), ll(x, 190)];

t('površina i dužina u metrima', () => {
  assert.ok(Math.abs(D.povrsinaLL(odjel) - 40000) < 5, 'površina 4 ha');
  assert.ok(Math.abs(D.duzinaLL(pojas(50)) - 180) < 0.5);
});
t('dva pojasa: sredina je isprekidana linija, svaka polovina svoja boja, prvi pojas do granice', () => {
  const r = D.podijeli(odjel, [pojas(50), pojas(150)]);
  assert.strictEqual(r.regije.length, 2);
  const ha = r.regije.map(x => x.ha);
  assert.ok(Math.abs(ha[0] - 2) < 0.05 && Math.abs(ha[1] - 2) < 0.05, 'svaki 2 ha: ' + ha);
  assert.ok(Math.abs(r.ha - 4) < 0.01);
  assert.ok(r.crte.length >= 1, 'ima isprekidanu liniju');
  const xs = r.crte.flat().map(q => P.fw(q)[0]);
  assert.ok(xs.every(x => Math.abs(x - 100) < 3), 'linija je na sredini između pojaseva: ' + xs.slice(0, 4));
});
t('nejednak razmak: granica je na pola puta, prvi pojas boji sve do ruba', () => {
  const r = D.podijeli(odjel, [pojas(30), pojas(70), pojas(170)]);
  const ha = r.regije.sort((a, b) => a.i - b.i).map(x => +x.ha.toFixed(2));
  assert.deepStrictEqual(ha, [1, 1.4, 1.6], 'x∈[0,50], [50,120], [120,200] × 200 m');
  assert.ok(Math.abs(ha.reduce((a, b) => a + b, 0) - 4) < 0.02, 'zbir = površina odjela');
});
t('jedan pojas boji cijeli odjel', () => {
  const r = D.podijeli(odjel, [pojas(80)]);
  assert.strictEqual(r.regije.length, 1);
  assert.ok(Math.abs(r.regije[0].ha - 4) < 0.01 && r.crte.length === 0);
});
t('KML izvoz i uvoz pojasa čuva projektanta i boju', () => {
  const p = { naziv: 'Test', odjel: 'Odjel 1', ring: odjel };
  const kml = D.kmlTragovi(p, [{ projektant: 'Ana', boja: '#f97316', pts: pojas(50), t: 1 }], true);
  assert.ok(kml.includes('usf_doznaka') && kml.includes('<LineString>') && kml.includes('<Polygon>'));
  assert.strictEqual(D.bojaKml('#f97316'), 'ff1673f9');
});
t('povezano: meni, panel, skripta, offline lista, KML hook', () => {
  const H = R('index.html');
  assert.ok(H.includes('USFDoz.otvori()') && H.includes('id="doznaka-panel"') && H.includes('id="doz-body"') && H.includes('static/js/doznaka.js'));
  assert.ok(/_ALL_PANELS = \[[^\]]*'doznaka-panel'/.test(H));
  assert.ok(H.includes('USFDoz.izKml'), 'uvoz iz KML-a kroz Učitaj KML / primljeni fajl');
  assert.ok(R('sw.js').includes('static/js/doznaka.js') && R('android/copy-assets.sh').includes('static/js/doznaka.js'));
});
console.log('\n' + pass + ' prošlo, ' + (process.exitCode ? 'IMA PALIH' : '0 palo') + ' — doznaka');
