'use strict';
// GeoForest je ZASEBNA app: vlastiti naziv, package, update URL i keš — ne smije se poklopiti s Grmeč Navigatorom.
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const R = f => fs.readFileSync(path.join(__dirname, '../..', f), 'utf8');
let pass = 0;
const t = (ime, fn) => { try { fn(); pass++; console.log('  ✔ ' + ime); } catch (e) { console.error('  ✘ ' + ime + '\n      ' + e.message); process.exitCode = 1; } };
console.log('Identitet aplikacije (GeoForest):');

t('naziv: title, manifest, Android app_name, Postavke', () => {
  const H = R('index.html');
  assert.ok(H.includes('<title>GeoForest</title>') && H.includes('<h3>GeoForest</h3>'));
  assert.ok(!/Grmeč Navigator<|Una Sana Forest/i.test(H));
  const m = JSON.parse(R('manifest.json'));
  assert.strictEqual(m.name, 'GeoForest'); assert.strictEqual(m.short_name, 'GeoForest');
  assert.ok(R('android/app/src/main/res/values/strings.xml').includes('<string name="app_name">GeoForest</string>'));
});

t('package ba.spd.geoforest (namespace, applicationId, Java izvori)', () => {
  const g = R('android/app/build.gradle');
  assert.ok(g.includes("namespace 'ba.spd.geoforest'") && g.includes('applicationId "ba.spd.geoforest"') && g.includes('applicationIdSuffix ".debug"'));
  const dir = path.join(__dirname, '../../android/app/src/main/java/ba/spd/geoforest');
  for (const f of ['MainActivity', 'GpsService', 'IzborFajla', 'KopijaKarte', 'NativeGpsBuffer', 'SqliteTileMath'])
    assert.ok(fs.readFileSync(path.join(dir, f + '.java'), 'utf8').startsWith('package ba.spd.geoforest;'), f);
  assert.ok(!fs.existsSync(path.join(__dirname, '../../android/app/src/main/java/ba/spd/usf')), 'stari package obrisan');
  assert.ok(R('android/app/src/main/AndroidManifest.xml').includes('${applicationId}.fileprovider'));
});

t('potpis: bez commit-ovanog ključa i lozinke, CI čita GitHub Secrets', () => {
  const g = R('android/app/build.gradle');
  assert.ok(!/unasanaforest|storePassword\s+'/.test(g), 'nema fiksne lozinke u build.gradle');
  assert.ok(g.includes("System.getenv('GEOFOREST_KEYSTORE')"));
  assert.ok(!fs.existsSync(path.join(__dirname, '../../android/app/unasanaforest-debug.keystore')));
  const w = R('.github/workflows/build-apk.yml');
  assert.ok(w.includes('secrets.GEOFOREST_KEYSTORE_B64') && w.includes('secrets.GEOFOREST_STORE_PASSWORD'));
  assert.ok(R('android/.gitignore').includes('*.keystore') && !R('android/.gitignore').includes('!app/'));
});

t('auto-update čita releases OVOG repoa', () => {
  const a = R('android/app/src/main/java/ba/spd/geoforest/MainActivity.java');
  assert.ok(a.includes('https://api.github.com/repos/pogonboskrupa/GeoForest/releases?per_page=1'));
  assert.ok(!/forest-una-sana/i.test(a));
});

t('GPS obavijest: kanal i wakelock s prefiksom geoforest_', () => {
  const g = R('android/app/src/main/java/ba/spd/geoforest/GpsService.java');
  assert.ok(g.includes('CHANNEL_ID = "geoforest_gps_recording"') && g.includes('"GeoForest · GPS snimanje"') && g.includes('"geoforest:gps_recording"'));
});

t('verzija sinhrona: APP_VER, sw.js, terrain-layers, build-apk.yml', () => {
  const v = R('index.html').match(/^const APP_VER = 'v([^']+)';/m)[1];
  assert.ok(R('sw.js').includes(`const APP_VERSION = '${v}';`));
  assert.ok(R('.github/workflows/build-apk.yml').includes('# APK_RELEASE_VERSION=' + v));
  const tl = R('static/js/terrain-layers.js');
  assert.ok(tl.includes(`'v${v}'`) && tl.includes(`'GeoForest v${v}'`));
});

t('service worker: keš bez usf- prefiksa, isti naziv pločica u index.html', () => {
  const sw = R('sw.js');
  assert.ok(sw.includes("'geoforest-app-v' + APP_VERSION") && sw.includes("'geoforest-tiles-v1'") && !/'usf-/.test(sw));
  assert.ok(R('index.html').includes("const TILE_CACHE_NAME = 'geoforest-tiles-v1';"));
});

t('rezervna kopija: piše geoforest, prima i Grmeč Navigator', () => {
  const H = R('index.html');
  assert.ok(H.includes("JSON.stringify({ app: 'geoforest',") && H.includes("const _KOPIJA_APP = ['geoforest', 'grmec-navigator'];"));
});

console.log('\n' + pass + ' prošlo, ' + (process.exitCode ? 'IMA PALIH' : '0 palo') + ' — identitet');
