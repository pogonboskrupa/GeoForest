// Doznaka — pojasevi: segmentacija, bafer presječen granicom, susjedni pojasevi bez preklopa, pokrivenost kao unija, upozorenje na tuđi pojas
const assert = require('assert');
global.window = global; global.turf = require('../../static/libs/turf.min.js');
const Z = require('../../static/js/doznaka-pojas.js');
let pass = 0;
const t = (ime, fn) => { try { fn(); pass++; console.log('  ✔ ' + ime); } catch (e) { console.error('  ✘ ' + ime + '\n      ' + e.message); process.exitCode = 1; } };

// odjel 300 × 200 m kod 44,5° N / 16,3° E
const P = Z.ravan(44.5, 16.3), ll = (x, y) => P.bw([x, y]);
const odjel = [[0, 0], [300, 0], [300, 200], [0, 200]].map(q => ll(...q));
const trag = (id, ime, x, y0 = 10, y1 = 190) => ({ id, projektant: ime, boja: '#f00', pts: [ll(x, y0), ll(x, (y0 + y1) / 2), ll(x, y1)], t: 1 });
const tacka = (min, la = 44.5, lo = 16.3) => ({ la, lo, t: min * 60000 });

t('razmak > 5 min počinje novi segment, segment s < 2 tačke se odbacuje', () => {
  const s = Z.segmentiraj([tacka(0), tacka(1), tacka(2), tacka(10), tacka(11), tacka(30)]);
  assert.strictEqual(s.length, 2);
  assert.deepStrictEqual(s.map(x => x.pts.length), [3, 2]);
});
t('tačke iz pauze se odbacuju po VREMENU tačke, a pauza prekida segment', () => {
  const pauze = [{ s: 2.5 * 60000, e: 4.5 * 60000 }];
  const s = Z.segmentiraj([tacka(0), tacka(1), tacka(2), tacka(3), tacka(4), tacka(5), tacka(6)], pauze);
  assert.strictEqual(s.length, 2, 'prije i poslije pauze');
  assert.deepStrictEqual(s.map(x => x.pts.length), [3, 2]);
  const otvorena = Z.segmentiraj([tacka(0), tacka(1), tacka(2), tacka(3), tacka(4)], [{ s: 2.5 * 60000, e: null }]);
  assert.strictEqual(otvorena.length, 1); assert.strictEqual(otvorena[0].pts.length, 3, 'pauza koja traje odbacuje sve poslije');
});
t('jedan pojas: bafer R sa svake strane, presječen granicom odjela', () => {
  const r = Z.pojasevi(odjel, [trag('a', 'A', 150)], 20);
  assert.strictEqual(r.pojasi.length, 1);
  // 40 m × 180 m = 0,72 ha + zaobljeni krajevi (10 m ostaje u odjelu, dalje ih siječe granica) ≈ 0,79 ha
  assert.ok(r.pojasi[0].ha > 0.74 && r.pojasi[0].ha < 0.84, 'ha ' + r.pojasi[0].ha);
  assert.strictEqual(r.pojasi[0].spojen, false);
  // uz rub: polovina bafera je izvan odjela
  const rub = Z.pojasevi(odjel, [trag('a', 'A', 0)], 20);
  assert.ok(rub.pojasi[0].ha > 0.34 && rub.pojasi[0].ha < 0.40, 'uz rub oko pola: ' + rub.pojasi[0].ha);
});
t('dva paralelna traga na 30 m: granica na 15 m, bez preklopa', () => {
  const r = Z.pojasevi(odjel, [trag('a', 'A', 100), trag('b', 'B', 130)], 20);
  assert.strictEqual(r.pojasi.length, 2);
  assert.ok(r.pojasi.every(p => p.spojen), 'dijele granicu');
  assert.ok(r.preklopHa < 0.02, 'preklop ' + r.preklopHa);
  // A: od 80 do 115 (35 m širine), B: od 115 do 150
  assert.ok(r.pojasi[0].ha > 0.58 && r.pojasi[0].ha < 0.68, 'A ' + r.pojasi[0].ha);
});
t('tragovi na 100 m: puni R, nema spajanja', () => {
  const r = Z.pojasevi(odjel, [trag('a', 'A', 60), trag('b', 'B', 160)], 20);
  assert.ok(r.pojasi.every(p => !p.spojen));
  assert.ok(Math.abs(r.zbirHa - r.pojasi[0].ha - r.pojasi[1].ha) < 1e-9 && r.preklopHa < 1e-6);
});
t('isti dio pređen dvaput: pokrivenost se ne udvostručuje, preklop = jedan pojas', () => {
  const jedan = Z.pojasevi(odjel, [trag('a', 'A', 150)], 20);
  const dva = Z.pojasevi(odjel, [trag('a', 'A', 150), trag('b', 'A', 150)], 20);
  assert.ok(Math.abs(dva.ukupnoHa - jedan.ukupnoHa) < 0.01, 'unija ' + dva.ukupnoHa + ' vs ' + jedan.ukupnoHa);
  assert.ok(Math.abs(dva.preklopHa - jedan.ukupnoHa) < 0.02, 'preklop ' + dva.preklopHa);
});
t('po korisniku je unija njegovih pojaseva, ukupno je unija svih', () => {
  const r = Z.pojasevi(odjel, [trag('a', 'A', 60), trag('b', 'A', 60), trag('c', 'B', 240)], 20);
  assert.ok(Math.abs(r.poKorisniku.A - r.pojasi[0].ha) < 0.02, 'A samo jednom');
  assert.ok(Math.abs(r.ukupnoHa - (r.poKorisniku.A + r.poKorisniku.B)) < 0.01);
});
t('trag koji se siječe sa tuđim ne stvara rupu (presjek je isti koridor)', () => {
  const x = { id: 'x', projektant: 'B', boja: '#0f0', pts: [ll(20, 100), ll(150, 100), ll(280, 100)], t: 1 };
  const r = Z.pojasevi(odjel, [trag('a', 'A', 150), x], 20);
  assert.strictEqual(r.pojasi.length, 2);
  assert.ok(r.pojasi[0].ha > 0.6, 'širina nije skupljena u presjeku: ' + r.pojasi[0].ha);
});
t('trag izvan odjela daje prazno, kratak/neispravan se preskače', () => {
  const r = Z.pojasevi(odjel, [{ id: 'z', projektant: 'A', boja: '#f00', pts: [ll(900, 900), ll(900, 950)], t: 1 }, { id: 'k', projektant: 'A', pts: [ll(5, 5)] }], 20);
  assert.strictEqual(r.pojasi.length, 0); assert.strictEqual(r.ukupnoHa, 0);
});
t('tuđi pojas: udaljenosti, odluka tek na 3. uzastopni pogodak i najviše jednom u 15 s', () => {
  const tr = [trag('a', 'A', 100), trag('b', 'B', 140)];
  const [la, lo] = ll(130, 100);
  const r = Z.tudjiPojas(la, lo, tr, 'A');
  assert.ok(Math.abs(r.dTudji - 10) < 0.5 && Math.abs(r.dVlastiti - 30) < 0.5 && r.imeTudji === 'B');
  const st = {}; const p = { dTudji: 10, dVlastiti: 30 }, ok = { dTudji: 60, dVlastiti: 30 };
  assert.strictEqual(Z.tudjiOdluka(st, p, 1000), false);
  assert.strictEqual(Z.tudjiOdluka(st, ok, 2000), false, 'dobar fiks prekida niz');
  assert.strictEqual(Z.tudjiOdluka(st, p, 3000), false); assert.strictEqual(Z.tudjiOdluka(st, p, 4000), false);
  assert.strictEqual(Z.tudjiOdluka(st, p, 5000), true, '3. zaredom');
  assert.strictEqual(Z.tudjiOdluka(st, p, 6000), false, 'ne češće od 15 s');
  assert.strictEqual(Z.tudjiOdluka(st, p, 21000), true);
});
console.log('\n' + pass + ' prošlo — doznaka pojasevi');
