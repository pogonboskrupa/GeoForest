// Korisnik aplikacije: ime u localStorage, vlasnik pojasa doznake, povezanost u index.html
const assert = require('assert'), fs = require('fs'), path = require('path');
const mem = {}; global.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
global.window = global;
const R = f => fs.readFileSync(path.join(__dirname, '../..', f), 'utf8');
const K = require('../../static/js/korisnik.js');
let pass = 0;
const t = (ime, fn) => { try { fn(); pass++; console.log('  ✔ ' + ime); } catch (e) { console.error('  ✘ ' + ime + '\n      ' + e.message); process.exitCode = 1; } };

t('ime se čisti, sprema i čita; prazno se odbija', () => {
  assert.strictEqual(K.ime(), '');
  assert.strictEqual(K.postavi('   '), false);
  assert.strictEqual(K.postavi('  Ana   Anić '), true);
  assert.strictEqual(K.ime(), 'Ana Anić');
  assert.ok(JSON.parse(mem.usf_korisnik).datum > 0);
  K.ukloni(); assert.strictEqual(K.ime(), '');
});
t('povezano: Postavke kartica, Meni čip, skripta, offline lista', () => {
  const H = R('index.html');
  assert.ok(H.includes('id="set-korisnik-box"') && H.includes('id="meni-korisnik"') && H.includes('static/js/korisnik.js'));
  assert.ok(R('sw.js').includes('static/js/korisnik.js'));
});
t('Doznaka: pojas nosi ime korisnika; bez imena nema snimanja; KML nosi ko je radio', () => {
  const J = R('static/js/doznaka.js');
  const f = J.slice(J.indexOf('async function snimi()'), J.indexOf('async function izKml('));
  assert.ok(f.includes('USFKorisnik.ime()') && f.includes('Bez imena korisnika nema snimanja') && f.includes('Ime korisnika nije uneseno'));
  assert.ok(!f.includes("pitajProjektanta('▶"), 'ne pita se projektant za svaki trag');
  assert.ok(J.includes('Doznaku radio: '));
});
console.log('\n' + pass + ' prošlo, ' + (process.exitCode ? 'IMA PALIH' : '0 palo') + ' — korisnik');
