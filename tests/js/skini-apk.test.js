const assert = require('assert'), fs = require('fs');
const H = fs.readFileSync(__dirname + '/../../index.html', 'utf8'), J = fs.readFileSync(__dirname + '/../../android/app/src/main/java/ba/spd/geoforest/MainActivity.java', 'utf8');
assert.ok(H.includes('id="set-skini-btn"') && H.includes('function skiniApk()') && H.includes('AndroidUpdate.skiniApk'));
assert.ok(J.includes('public void skiniApk()') && J.includes('spremiUDownloads') && J.includes('"saved"'));
assert.ok(!/public void skiniApk\(\)[\s\S]{0,2500}instalirajApk/.test(J), 'skiniApk ne smije pokretati instalaciju');
console.log('ok — skini apk');
