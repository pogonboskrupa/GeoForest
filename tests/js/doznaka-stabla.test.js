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
t('blokovi pločica: zadani korak, bez praznih blokova', () => {
  const stabla = []; for (let n = 1; n <= 700; n += 7) stabla.push(st(n, n, 0));
  const bl = S.blokovi(stabla, 300);
  assert.deepStrictEqual(bl.map(b => [b.od, b.do, b.ime]), [[1, 300, 'Projektant 1'], [301, 600, 'Projektant 2'], [601, 694, 'Projektant 3']]);
  assert.deepStrictEqual(S.blokovi([st(305, 0, 0), st(310, 5, 0)], 300).map(b => [b.od, b.do, b.ime]), [[301, 310, 'Projektant 2']], 'prazan prvi blok se preskače');
});
t('tri inženjera, polje 600 m: blok = projektant, povratak „sa starim pločicama” ostaje u istom pojasu, drugi inženjer se ne spaja', () => {
  // A: 1–60 odlazi y=0 (x 0→590), vraća se 61–120 na y=45; B: 121–180 odlazi y=22, vraća 181–240 y=67; C: 241–300 y=… (jedan prolaz)
  const stabla = [];
  for (let k = 0; k < 60; k++) stabla.push(st(1 + k, k * 10, 0));
  for (let k = 0; k < 60; k++) stabla.push(st(61 + k, 590 - k * 10, 45));
  for (let k = 0; k < 60; k++) stabla.push(st(121 + k, k * 10, 22));       // B počinje 25 m od kraja A-ovog povratka (x=0) ⇒ blok ih mora razdvojiti
  for (let k = 0; k < 60; k++) stabla.push(st(181 + k, 590 - k * 10, 67));
  const bl = S.blokovi(stabla, 120);
  assert.strictEqual(bl.length, 2);
  const g = S.gradiBlokove(stabla, 50, bl);
  assert.strictEqual(g.pojasi.length, 2, 'po jedan pojas (odlazak + povratak) za svakog: ' + g.pojasi.map(p => p.ids.length));
  assert.deepStrictEqual(g.pojasi.map(p => [p.r, p.ids.length, p.sig]), [['Projektant 1', 120, '1-120'], ['Projektant 2', 120, '121-240']]);
  assert.strictEqual(g.bezBroja, 0);
});
t('veći razmak od 50 m prekida pojas unutar bloka (sljedeći dan počinje drugdje, brojevi se nastavljaju)', () => {
  const stabla = [st(1, 0, 0), st(2, 10, 0), st(3, 20, 0), st(4, 400, 300), st(5, 410, 300), st(6, 420, 300)];
  const g = S.gradiBlokove(stabla, 50, [{ od: 1, do: 6, ime: 'Ana' }]);
  assert.deepStrictEqual(g.pojasi.map(p => p.ids.length), [3, 3]);
  assert.ok(g.pojasi.every(p => p.r === 'Ana'), 'isti inženjer (isti blok)');
});
t('blokovi po skoku: novi blok kad je sljedeći broj dalje od 300 m (paketi pločica iz stvarne doznake)', () => {
  const stabla = [];
  for (let n = 1; n <= 40; n++) stabla.push(st(n, n * 8, 0));        // paket 1
  for (let n = 41; n <= 90; n++) stabla.push(st(n, -400 + (n - 41) * 8, 600)); // sljedeći broj počinje 600+ m dalje
  for (let n = 91; n <= 100; n++) stabla.push(st(n, -8 + (n - 90) * 8, 600));
  const bl = S.blokoviSkok(stabla, 300);
  assert.deepStrictEqual(bl.map(b => [b.od, b.do]), [[1, 40], [41, 100]]);
  assert.strictEqual(S.gradiBlokove(stabla, 50, bl).pojasi.length, 2);
});
t('povezano u aplikaciju: podtab, uvoz, offline lista', () => {
  const H = R('index.html'), J = R('static/js/doznaka.js');
  assert.ok(H.includes('static/js/doznaka-stabla.js'));
  assert.ok(R('sw.js').includes('static/js/doznaka-stabla.js'));
  assert.ok(J.includes("data-a=\"tab\"") && J.includes('ST().gradi') && J.includes('ST().izKml') && J.includes('window.USFDozStabla') && J.includes('p.stabla'));
});
console.log('\n' + pass + ' prošlo, ' + (process.exitCode ? 'IMA PALIH' : '0 palo') + ' — doznaka stabla');
