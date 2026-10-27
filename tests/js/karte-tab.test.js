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
  const gdje = { app: ['set-update-card'], prikaz: ['set-s-sablon', 'set-sablon', 'set-s-razmjera', 'set-razmjera', 'set-s-ui', 'ui-koord', 'ui-btnOblik', 'ui-btnZ', 'set-s-prikaz'],
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

t('Meni: velike kartice za radne tokove, pločice za ostalo, tap >= 48 px', () => {
  const css = R('static/css/geoforest.css');
  assert.ok(/#meni-panel \.meni-card \{[^}]*min-height: 84px/.test(css));
  assert.ok(css.includes('#meni-panel section.meni-grp:nth-of-type(n+2) { display: grid; grid-template-columns: 1fr 1fr'));
  assert.ok(/#meni-panel \.meni-set \{[^}]*min-height: var\(--gf-tap\)/.test(css));
});

t('Korisnik aplikacije je uklonjen (kod, HTML, font)', () => {
  for (const x of ['set-korisnik', 'set-profil', 'meni-korisnik', '_korisnikUi', 'Ko koristi aplikaciju', 'Dancing Script', 'kor-ime']) assert.ok(!HTML.includes(x), x);
  assert.ok(!fs.existsSync(path.join(__dirname, '../../static/fonts')));
  assert.ok(!R('sw.js').includes('static/fonts') && !R('android/copy-assets.sh').includes('static/fonts'));
});

t('donji bar: SVG ikone, 60 px, natpis uvijek vidljiv, aktivna stavka puna zelena', () => {
  const nav = HTML.slice(HTML.indexOf('<nav id="main-tabs"'), HTML.indexOf('</nav>', HTML.indexOf('<nav id="main-tabs"')));
  assert.strictEqual((nav.match(/class="mtab( active)?"/g) || []).length, 4);
  assert.strictEqual((nav.match(/<svg/g) || []).length, 4);
  assert.ok(!/\p{Extended_Pictographic}/u.test(nav), 'bez emoji ikona');
  ['Mapa', 'Karte', 'Meni', 'Postavke'].forEach(n => assert.ok(nav.includes('</span>' + n + '</button>'), n));
  const css = R('static/css/geoforest.css');
  assert.ok(/#main-tabs \.mtab \{[^}]*min-height: 60px/.test(css) && /#main-tabs \.mtab\.active \{[^}]*background: var\(--gf-zel-jak\)/.test(css));
});

t('šabloni interfejsa: 4 šablona, primjena mijenja samo izgled (ne koordinatni sistem), prepoznaje aktivni', () => {
  const P = require('../../static/js/postavke.js');
  assert.deepStrictEqual(P.SABLONI.map(s => s.id), ['standard', 'teren', 'noc', 'kompakt']);
  const zad = { tema: 'tamna', bdgA: 55, bdgFs: 11, bdgOut: 'tanak', blur: 0, btnA: 86, btnZ: 100, btnOblik: 'zaobljeno', btnIk: 'normalne', btnStil: 'staklo', koord: 'wgs', bdgElev: false };
  assert.strictEqual(P.aktivniSablon(zad).id, 'standard');
  assert.strictEqual(P.aktivniSablon({ ...zad, bdgA: 60 }), null, 'ručna izmjena = prilagođeno');
  const teren = P.SABLONI.find(s => s.id === 'teren').v;
  assert.ok(teren.tema === 'svijetla' && teren.btnZ >= 120 && teren.bdgFs >= 14);
  for (const s of P.SABLONI) assert.ok(!('koord' in s.v) && !('bdgElev' in s.v) && !('bdgMgi' in s.v) && !('bdgRz' in s.v), s.id + ' ne dira koordinate');
  const kljucevi = Object.keys(P.SABLONI[0].v).sort();
  for (const s of P.SABLONI) assert.deepStrictEqual(Object.keys(s.v).sort(), kljucevi);
});

t('prikaz po razmjeri: tragovi, KML, sjekačke linije, tačke, mjerenja; sjekačke poštuju razmjeru osim dok traje vodič/crtanje', () => {
  const P = require('../../static/js/postavke.js');
  assert.strictEqual(P.zaokruzi(31234), 31000); assert.strictEqual(P.zaokruzi(10), 500); assert.strictEqual(P.zaokruzi(9e9), 5000000);
  const js = R('static/js/postavke.js');
  for (const k of ["'tragovi'", "'kml'", "'sjek'", "'slike'", "'mjerenja'"]) assert.ok(js.includes(k), k);
  assert.ok(HTML.includes("sjek: 0, mjerenja: 25000") && HTML.includes("sjek: false, mjerenja: false") && HTML.includes("USFSjek.osvjezi()"));
  const sj = R('static/js/sjekacke.js');
  assert.ok(sj.includes("_razmjeraSkriva('sjek') && !vodic && !crt && !ured") && sj.includes('osvjezi: () => crtaj()'));
  assert.ok(sj.includes('p.vidljiv !== false && !skriv') && sj.includes('!sakrivenoRazmjerom()'), 'crtanje i dodir');
  assert.ok(R('static/js/postavke.js').includes('Sada sakriveno') && R('static/js/postavke.js').includes('_setRazmjeraTrenutna'));
  for (const f of ['static/js/postavke.js']) { assert.ok(HTML.includes('<script src="' + f + '"></script>')); assert.ok(R('sw.js').includes("'./" + f + "'") && R('android/copy-assets.sh').includes(f)); }
});

t('šabloni dugmadi na mapi: 5 stilova, pregled = stvarne vrijednosti, CSS za svaki, stil na <html>', () => {
  const P = require('../../static/js/postavke.js');
  assert.deepStrictEqual(P.BTN_SABLONI.map(s => s.id), ['staklo', 'cvrsto', 'kontrast', 'akcent', 'minimal']);
  const zad = { btnStil: 'staklo', btnA: 86, btnZ: 100, btnOblik: 'zaobljeno', btnIk: 'normalne', tema: 'tamna' };
  assert.strictEqual(P.aktivniBtn(zad).id, 'staklo');
  assert.strictEqual(P.aktivniBtn({ ...zad, btnZ: 110 }), null);
  assert.ok(P.BTN_SABLONI.find(s => s.id === 'kontrast').v.btnZ >= 120 && P.BTN_SABLONI.find(s => s.id === 'kontrast').v.btnA === 100);
  const css = R('static/css/geoforest.css');
  for (const id of ['cvrsto', 'kontrast', 'akcent', 'minimal']) assert.ok(css.includes('html[data-btn-stil="' + id + '"]') && css.includes('.bs-pr[data-bs-pr="' + id + '"]'), id);
  assert.ok(!css.includes('html[data-btn-stil="staklo"]'), 'staklo = postojeći izgled');
  assert.ok(HTML.includes("btnStil: 'staklo'") && HTML.includes("document.documentElement.dataset.btnStil = u.btnStil || 'staklo'") && HTML.includes('id="set-dugmad-sab"'));
  for (const s of P.SABLONI) assert.ok(P.BTN_SABLONI.some(b => b.id === s.v.btnStil), 'šablon interfejsa ' + s.id + ' ima poznat stil dugmadi');
});

t('donji bar je niži (50 px), --dock-b 66 px', () => {
  assert.ok(/#main-tabs \.mtab \{[^}]*min-height: 50px/.test(R('static/css/geoforest.css')));
  assert.ok(HTML.includes('--dock-b: calc(66px + env(safe-area-inset-bottom, 0px));'));
});

t('modali i plutajući prozori: ručica, tap >= 52 px, tekst >= 14 px (Mjerenja, Tragovi, Lokacija, snimanje, dijalozi, kartica, tačka)', () => {
  const css = R('static/css/geoforest.css');
  const blok = css.slice(css.indexOf('Modali i plutajući prozori (v1.0.5)'));
  for (const sel of ['#msr-panel .msr-btns button', '.treg-btns button', '#ab-loc-popup .loc-btn', '.dlg-btn-ok, .dlg-btn-cancel, .dlg-action-btn', '.pk-akc button', '#tk-sheet .tk-btn', '#rec-bar .rb-akc button'])
    assert.ok(blok.includes(sel), sel);
  assert.ok(/#msr-panel::before, #ab-loc-popup::before, #tragovi-panel::before/.test(blok), 'ručica');
  assert.ok(/\.dlg-btn-ok, \.dlg-btn-cancel, \.dlg-action-btn \{ min-height: 56px/.test(blok));
  assert.ok(/#msr-panel \.msr-modes button \{ min-height: 66px/.test(blok) && /\.treg-btns button \{ min-height: 56px/.test(blok));
  assert.ok(/\.loc-switch \{ width: 56px; height: 32px/.test(blok), 'prekidači za rukavice');
});

t('Mjerenja, Tragovi i Nova tačka su u modalu Moja lokacija, ne na karti', () => {
  const pop = HTML.slice(HTML.indexOf('<div id="ab-loc-popup">'), HTML.indexOf('<!-- Traka aktivnog snimanja'));
  const fabs = HTML.slice(HTML.indexOf('<div id="map-fabs">'), HTML.indexOf('<!-- Mjerenja — plutajući'));
  for (const id of ['ab-msr', 'ab-tragovi', 'ab-tacka']) {
    assert.ok(pop.includes('id="' + id + '"'), id + ' u modalu');
    assert.ok(!fabs.includes('id="' + id + '"'), id + ' nije na karti');
  }
  assert.ok(fabs.includes('id="ab-loc"') && !fabs.includes('fab-pill'));
  assert.ok(/_toggleLocPopup\(\);_toggleMsrPanel\(\)/.test(pop) && /_toggleLocPopup\(\);openTragoviPanel\(\)/.test(pop) && /_toggleLocPopup\(\);USFTacke\.dodaj\(\)/.test(pop), 'modal se zatvara pri otvaranju alata');
  assert.ok(!/btnPoz|btnVis/.test(HTML), 'opcija položaja dugmadi je uklonjena');
});

t('mjerenje: dok se crta uska traka bez statistike; poslije Završi kartica s podacima', () => {
  const css = R('static/css/geoforest.css');
  assert.ok(/#msr-panel\.active \.msr-stats, #msr-panel\.active \.msr-hint \{ display: none/.test(css));
  const f = HTML.slice(HTML.indexOf('function _msrRegAddFromActive'), HTML.indexOf('// ── Razmjera karte'));
  assert.ok(f.includes("classList.remove('show')") && f.includes('_msrOpenPopupNa(entry'));
});

console.log('\n' + pass + ' prošlo, ' + (process.exitCode ? 'IMA PALIH' : '0 palo') + ' — karte tab');
