// Doznaka — stabla iz KML-a i povezivanje brojeva u pojaseve (preplitanje radnika, prekid na > 50 m)
const assert = require('assert'), fs = require('fs'), path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '../..', f), 'utf8');
const S = require('../../static/js/doznaka-stabla.js');
let pass = 0;
const t = (ime, fn) => { try { fn(); pass++; console.log('  ✔ ' + ime); } catch (e) { console.error('  ✘ ' + ime + '\n      ' + e.message); process.exitCode = 1; } };

const la0 = 44.8, lo0 = 15.87, dy = 1 / 110574, dx = 1 / (111320 * Math.cos(la0 * Math.PI / 180));
const st = (n, x, y, r, d) => ({ n, t: String(n), la: la0 + y * dy, lo: lo0 + x * dx, r: r || '', d: d || '' });

t('brojevi i datumi iz naziva', () => {
  assert.strictEqual(S.brojIzNaziva('Stablo 12'), 12);
  assert.strictEqual(S.brojIzNaziva('O7-45'), 45);
  assert.strictEqual(S.brojIzNaziva('bez broja'), null);
  assert.strictEqual(S.danIz('2026-10-28T08:15:00Z'), '2026-10-28');
  assert.strictEqual(S.danIz('3.11.2026'), '2026-11-03');
});
t('preplitanje bez oznaka: dva radnika, brojevi naizmjenično → dva pojasa', () => {
  const a = [], b = [];
  for (let i = 0; i < 10; i++) { a.push(st(2 * i + 1, i * 10, 0)); b.push(st(2 * i + 2, i * 10, 200)); } // A na y=0 (neparni), B na y=200 (parni)
  const stabla = []; for (let i = 0; i < 10; i++) stabla.push(a[i], b[i]);
  const r = S.gradi(stabla, 50);
  assert.strictEqual(r.pojasi.length, 2);
  for (const p of r.pojasi) { assert.strictEqual(p.ids.length, 10); const ys = new Set(p.ids.map(i => Math.round(stabla[i].la * 1e5))); assert.strictEqual(ys.size, 1, 'pojas ostaje na svojoj liniji'); }
});
t('razmak preko 50 m prekida pojas i počinje novi', () => {
  const stabla = [st(1, 0, 0), st(2, 10, 0), st(3, 20, 0), st(4, 120, 0), st(5, 130, 0), st(6, 140, 0)]; // rupa 100 m
  const r = S.gradi(stabla, 50);
  assert.strictEqual(r.pojasi.length, 2);
  assert.deepStrictEqual(r.pojasi.map(p => p.ids.length), [3, 3]);
  assert.strictEqual(S.gradi(stabla, 120).pojasi.length, 1, 'veći prag spaja');
});
t('poznat radnik i dan: grupe se ne miješaju čak ni kad su stabla blizu', () => {
  const stabla = [st(1, 0, 0, 'Ana', '2026-10-01'), st(2, 10, 0, 'Marko', '2026-10-01'), st(3, 20, 0, 'Ana', '2026-10-01'), st(4, 30, 0, 'Marko', '2026-10-01'), st(5, 40, 0, 'Ana', '2026-10-02'), st(6, 50, 0, 'Ana', '2026-10-02')];
  const r = S.gradi(stabla, 50);
  const po = r.pojasi.map(p => [p.r, p.d, p.ids.length]).sort();
  assert.deepStrictEqual(po, [['Ana', '2026-10-01', 2], ['Ana', '2026-10-02', 2], ['Marko', '2026-10-01', 2]]);
});
t('usamljena stabla se ne crtaju kao pojas', () => {
  const r = S.gradi([st(1, 0, 0), st(2, 500, 0)], 50);
  assert.strictEqual(r.pojasi.length, 0); assert.strictEqual(r.usamljena, 2);
});
t('prepoznavanje projektanata: povratak istim pojasom = isti projektant; drugačiji brojevi među susjedima = drugi', () => {
  const stabla = [];
  for (let n = 1; n <= 150; n++) stabla.push(st(n, 2 * n, 0));                    // A: 1–150 slijeva nadesno
  for (let n = 151; n <= 300; n++) stabla.push(st(n, 300 - 2 * (n - 151), 70));   // A: nazad susjednim pojasom 151–300 (70 m razmaka ⇒ poseban pojas)
  for (let n = 1; n <= 140; n++) stabla.push(st(n, 2 * n, 200));                  // B: brojevi se preklapaju s A ⇒ drugi projektant
  for (let n = 141; n <= 280; n++) stabla.push(st(n, 280 - 2 * (n - 141), 270));
  const g = S.gradi(stabla, 50);
  assert.strictEqual(g.pojasi.length, 4, 'razmak 70 m prekida pojas: ' + g.pojasi.map(p => p.ids.length));
  const pr = S.prepoznaj(stabla, g.pojasi);
  assert.strictEqual(pr.length, 2, 'dva projektanta');
  assert.deepStrictEqual(pr.map(x => [x.a, x.b]), [[1, 300], [1, 280]]);
  assert.deepStrictEqual(pr.map(x => x.strips.length), [2, 2]);
});
t('prepoznavanje: potpuno različiti raspon brojeva susjednih pojaseva = dva projektanta', () => {
  const stabla = [];
  for (let n = 1; n <= 50; n++) stabla.push(st(n, 3 * n, 0));
  for (let n = 501; n <= 550; n++) stabla.push(st(n, 3 * (n - 500), 60));
  const g = S.gradi(stabla, 50), pr = S.prepoznaj(stabla, g.pojasi);
  assert.strictEqual(g.pojasi.length, 2); assert.strictEqual(pr.length, 2);
});
t('povezano u aplikaciju: podtab, uvoz, offline lista', () => {
  const H = R('index.html'), J = R('static/js/doznaka.js');
  assert.ok(H.includes('static/js/doznaka-stabla.js'));
  assert.ok(R('sw.js').includes('static/js/doznaka-stabla.js'));
  assert.ok(J.includes("data-a=\"tab\"") && J.includes('ST().gradi') && J.includes('ST().izKml') && J.includes('window.USFDozStabla') && J.includes('p.stabla'));
});
console.log('\n' + pass + ' prošlo, ' + (process.exitCode ? 'IMA PALIH' : '0 palo') + ' — doznaka stabla');
