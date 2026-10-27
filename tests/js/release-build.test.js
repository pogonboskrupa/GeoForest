'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/build-apk.yml'), 'utf8');
const builder = fs.readFileSync(path.join(root, 'android/build-apk.ps1'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const activity = fs.readFileSync(path.join(root, 'android/app/src/main/java/ba/spd/geoforest/MainActivity.java'), 'utf8');
const adaptiveIcon = fs.readFileSync(path.join(root, 'android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml'), 'utf8');
const roundAdaptiveIcon = fs.readFileSync(path.join(root, 'android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml'), 'utf8');
const insetIcon = fs.readFileSync(path.join(root, 'android/app/src/main/res/drawable/ic_launcher_foreground_inset.xml'), 'utf8');

assert.match(workflow, /APP_VERSION=.*sed/);
assert.match(workflow, /tag_name: v\$\{\{ env\.APP_VERSION \}\}/);
assert.doesNotMatch(workflow, /v1\.2\.4/);
assert.match(builder, /\[string\]\$Branch\s*=\s*"claude\/serene-tesla-piw1y5"/);
assert.match(builder, /ValidateSet\("claude\/serene-tesla-piw1y5"\)/);
assert.ok(workflow.includes("if: github.ref == 'refs/heads/claude/serene-tesla-piw1y5' && env.GEOFOREST_KEYSTORE != ''"), 'release samo s glavne grane');
assert.match(index, /id="set-update-progress"/);
assert.match(index, /function _azurirajStatus\(msg, pct, phase, downloaded, total\)/);
assert.match(activity, /\.apk\.part|apk\.getName\(\) \+ "\.part"/);
assert.match(activity, /postUpdate\("downloading"/);
assert.match(activity, /getPackageArchiveInfo/);
assert.match(adaptiveIcon, /@drawable\/ic_launcher_foreground_inset/);
assert.match(roundAdaptiveIcon, /@drawable\/ic_launcher_foreground_inset/);
assert.match(insetIcon, /android:insetLeft="0dp"/);

console.log('Release/build provjere: 11 prošlo, 0 palo');
