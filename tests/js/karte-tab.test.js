'use strict';
// Karte tab (varijanta B: Na telefonu / Server / Podloga i teren) i Postavke u tabovima.
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const R = f => fs.readFileSync(path.join(__dirname, '../..', f), 'utf8');
const K = require('../../static/js/karte-tab.js');
const HTML = R('index.html');
let pass = 0;
const t = (ime, fn) => { try { fn(); pass++; console.log('  ✔ ' + ime); } catch (e) { console.error('  ✘ ' + ime + '\n      ' + e.message); process.exitCode = 1; } };
console.log('Karte tab i Postavke (tabovi):');

t('stanje karte: na telefonu > preuzima se > dostupno (PIN unesen) > uz PIN', () => {
  assert.strictEqual(K.statusKarte({}, { naTelefonu: true, napredak: { p: 5 }, kljuc: 'k' }).vrsta, 'tel');
  const p = K.statusKarte({}, { naTelefonu: false, napredak: { p: 43, mb: 120 }, kljuc: null });
  assert.deepStrictEqual([p.vrsta, p.txt, p.p], ['preuzima', '⬇ Preuzima se 43 %', 43]);
  assert.strictEqual(K.statusKarte({}, { naTelefonu: false, napredak: { p: null }, kljuc: null }).txt, '⬇ Preuzima se…');
  assert.strictEqual(K.statusKarte({}, { naTelefonu: false, napredak: null, kljuc: 'k' }).vrsta, 'dostupno');
  assert.deepStrictEqual(K.statusKarte({}, { naTelefonu: false, napredak: null, kljuc: null }), { vrsta: 'pin', txt: '🔒 Dostupno uz PIN' });
});

t('veličina fajla: MB ili GB, prazno bez podatka', () => {
  assert.strictEqual(K.velicina(350.4), '350 MB');
  assert.strictEqual(K.velicina(1536), '1,5 GB');
  assert.strictEqual(K.velicina(0), '');
});

t('red karte: status kao tekst (ne samo boja), dugme ≥ tap, escape naziva/opisa/id-a', () => {
  const k = { id: "x'1", naziv: '<img src=x onerror=alert(1)>', opis: 'a & b', mb: 2048 };
  const pin = K.red(k, false), dost = K.red(k, true);
  assert.ok(!pin.includes('<img src=x') && pin.includes('&lt;img src=x') && pin.includes('a &amp; b'));
  assert.ok(pin.includes('🔒 Dostupno uz PIN') && pin.includes('_dkOtkljucaj()') && pin.includes('kt-s-pin'));
  assert.ok(dost.includes("_dkPreuzmi('x&#39;1')") && dost.includes('⬇ Preuzmi · 2 GB') && dost.includes('kt-s-dostupno'));
});

t('Karte panel: 3 velika taba, sekcije po tabu, moduli učitani i keširani offline', () => {
  const kp = HTML.slice(HTML.indexOf('<div id="karte-panel"'), HTML.indexOf('<!-- Postavke panel -->'));
  assert.strictEqual((kp.match(/<button role="tab" data-t="/g) || []).length, 3);
  assert.strictEqual((kp.match(/class="gf-tab-sek" data-tab="/g) || []).length, 3);
  for (const f of ['static/js/tabovi.js', 'static/js/karte-tab.js']) assert.ok(HTML.includes('<script src="' + f + '"></script>'), f);
  assert.ok(HTML.includes('<link rel="stylesheet" href="static/css/geoforest.css">\n</head>'), 'CSS poslije inline stilova');
  for (const f of ['static/js/tabovi.js', 'static/js/karte-tab.js', 'static/css/geoforest.css']) {
    assert.ok(R('sw.js').includes("'./" + f + "'"), 'SW: ' + f);
    assert.ok(R('android/copy-assets.sh').includes(f), 'APK: ' + f);
  }
  assert.ok(HTML.includes("if (window.USFKarteTab) USFKarteTab.render();"), '_khStat / _driveKarteRender osvježavaju tab');
});

t('tap targeti: tabovi 64 px, dugmad ≥ 48 px', () => {
  const css = R('static/css/geoforest.css');
  assert.ok(/\.gf-tabs button \{[^}]*min-height: 64px/.test(css));
  assert.ok(/--gf-tap: (\d+)px/.exec(css)[1] >= 48);
  assert.ok(/\.kt-a button, \.kt-akt \{[^}]*min-height: var\(--gf-tap\)/.test(css));
});

t('Postavke: 4 taba, iste opcije (ID-ovi), skok otvara tab, bez harmonike', () => {
  const pp = HTML.slice(HTML.indexOf('<div id="postavke-panel"'), HTML.indexOf('<!-- Sjekačke linije -->'));
  assert.ok(pp.includes('data-tabovi="postavke"'));
  const tabovi = ['app', 'prikaz', 'gps', 'podaci'];
  const sek = tab => { const a = pp.indexOf('<div class="gf-tab-sek" data-tab="' + tab + '">'); const b = pp.indexOf('<div class="gf-tab-sek"', a + 10); return pp.slice(a, b > 0 ? b : undefined); };
  const gdje = { app: ['set-update-card', 'set-korisnik-dno'], prikaz: ['set-s-razmjera', 'set-s-ui', 'ui-koord', 'ui-btnOblik', 'ui-btnZ', 'set-s-prikaz'],
    gps: ['set-s-gps', 'set-bat-btn', 'set-autostart', 'set-s-trag', 'set-trag-w', 'set-trag-op', 'set-trag-ac'],
    podaci: ['set-s-podaci', 'set-restore-input', 'set-s-karte', 'set-kes-plocice', 'set-kes-teren', 'protomaps-key', 'set-uid-txt'] };
  for (const tb of tabovi) for (const id of gdje[tb]) assert.ok(sek(tb).includes('id="' + id + '"'), tb + ': ' + id);
  assert.ok(!pp.includes('set-acc"') && !pp.includes('set-pin-zakljucaj'));
  const f = HTML.slice(HTML.indexOf('function _setSkok('), HTML.indexOf('function _setSkok(') + 300);
  assert.ok(f.includes('USFTabovi.otvoriZa(el)'));
  assert.ok(!HTML.includes("d.matches('details.set-acc')"), 'nema "samo jedna otvorena" harmonike');
});

t('tabovi.js: izbor se pamti po panelu, sekcije drugih tabova su sakrivene', () => {
  const js = R('static/js/tabovi.js');
  assert.ok(js.includes("'usf_tab_' + k") && js.includes("s.hidden = s.dataset.tab !== t") && js.includes("aria-selected"));
});

console.log('\n' + pass + ' prošlo, ' + (process.exitCode ? 'IMA PALIH' : '0 palo') + ' — karte tab');
