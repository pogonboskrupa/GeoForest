const assert = require('assert');
const S = require('../../static/js/doznaka-stabla.js');
// Pojas 1: brojevi 1–120 uz liniju (10 m razmak), rupa u brojevima 40–44 (stabla nisu doznačena); pojas 2 počinje 900 m dalje: 121–200.
const st = [];
const tac = (n, x, y) => st.push({ n, la: 44 + y / 111195, lo: 16 + x / (111195 * Math.cos(44 * Math.PI / 180)) });
for (let n = 1; n <= 120; n++) { if ((n >= 40 && n <= 44) || n === 46) continue; tac(n, n * 10, 0); }
tac(46, 460 + 3, 40); // stablo 46 malo van linije (usamljeno u svom komadu? ne — ostaje u pojasu)
for (let n = 121; n <= 200; n++) tac(n, 900 + (n - 121) * 10, 900);
const par = S.parametri(st);
assert.ok(par.prag >= 25 && par.prag <= 100, 'prag iz razmaka brojeva: ' + par.prag);
const bl = S.blokoviSkok(st, par.skok);
assert.strictEqual(bl.length, 2, 'dva bloka (skok 900 m)');
const r = S.gradiBlokove(st, par.prag, bl, { gap: true });
const k = S.konsoliduj(st, r.pojasi, r.singles, par.prag);
assert.strictEqual(k.length, 2, 'rupa u brojevima ne dijeli pojas: ' + k.length);
assert.ok(k[0].ids.length >= 110 && k[1].ids.length === 80);
// bez gap opcije staro ponašanje ostaje (rupa 5 brojeva × 10 m = 50 m ≤ 50 → isto jedan pojas, ali bez konsolidacije nema usamljenih)
assert.ok(S.gradiBlokove(st, 50, bl).singles.length === 0);
console.log('doznaka-auto ok');
