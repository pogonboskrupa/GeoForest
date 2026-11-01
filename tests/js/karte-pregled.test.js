const fs = require('fs'), assert = require('assert');
const H = fs.readFileSync('index.html', 'utf8');
assert(H.includes('id="kh-pregled"') && H.includes('id="kh-offline-kartica"') && H.includes('id="kh-server"'));
const f = H.slice(H.indexOf('function _khStat() {'), H.indexOf('function _khKmlTrazi()'));
// „Na karti sada” (v1.3.5): podloga, offline karta, slojevi, teren; dodir otvara odgovarajući tab
for (const t of ['Na karti sada', "'Podloga'", "'Offline karta'", "'Slojevi'", "'Teren'", "USFTabovi.izaberi('karte','"]) assert(f.includes(t), t);
assert(f.includes('_khKmlTrazi()') && f.includes('_kedListaOtvori()'), 'preglednik i stil slojeva su alati u kartici Moji slojevi');
assert(!H.includes('function _khObavijest') && !H.includes('Razumijem</button>'), 'bez onboarding kartice');
assert(!f.includes('_tematski'));
assert(/\.kh-sada \.kh-pl\.on/.test(fs.readFileSync('static/css/geoforest.css', 'utf8')));
console.log('karte-pregled ok');
