'use strict';
// Odjeli (granice iz geo/odjeli.kml ili KML-a učitanog kroz "Učitaj KML"):
// izvještaj po odjelu (teren: nagib, visina, ekspozicija) i izvoz u KML / GeoJSON / CSV.
// Oslanja se na globalne funkcije iz index.html (kmlLs, pkml, terrainSlopeClasses…).

// ── Izvoz ────────────────────────────────────────────────────────────
const _IZVOZ_MIME = { kml: 'application/vnd.google-earth.kml+xml', geojson: 'application/geo+json', csv: 'text/csv' };

function _xmlEsc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function _kmlBoja(hex, alfa) { const h = String(hex || '#f97316').replace('#', ''); return (alfa || 'ff') + h.slice(4, 6) + h.slice(2, 4) + h.slice(0, 2); }
function _kmlKoord(ring) { return ring.map(c => Number(c[0]).toFixed(6) + ',' + Number(c[1]).toFixed(6)).join(' '); }
function _kmlGeom(g) {
  if (!g) return '';
  if (g.type === 'Point') return `<Point><coordinates>${Number(g.coordinates[0]).toFixed(6)},${Number(g.coordinates[1]).toFixed(6)}</coordinates></Point>`;
  if (g.type === 'Polygon') return `<Polygon><outerBoundaryIs><LinearRing><coordinates>${_kmlKoord(g.coordinates[0])}</coordinates></LinearRing></outerBoundaryIs>`
    + g.coordinates.slice(1).map(r => `<innerBoundaryIs><LinearRing><coordinates>${_kmlKoord(r)}</coordinates></LinearRing></innerBoundaryIs>`).join('') + '</Polygon>';
  if (g.type === 'MultiPolygon') return '<MultiGeometry>' + g.coordinates.map(p => _kmlGeom({ type: 'Polygon', coordinates: p })).join('') + '</MultiGeometry>';
  return '';
}
// GeoJSON FeatureCollection → KML; svojstva idu u ExtendedData (čita ih i QGIS),
// `_boja` (ako postoji) postaje stil, a `naziv` ime placemarka.
function _gjUKml(fc, naziv) {
  const pm = (fc.features || []).map(f => {
    const p = f.properties || {};
    const stil = p._boja ? `<Style><LineStyle><color>${_kmlBoja(p._boja)}</color><width>2</width></LineStyle><PolyStyle><color>${_kmlBoja(p._boja, '66')}</color></PolyStyle></Style>` : '';
    const ext = Object.entries(p).filter(([k]) => !k.startsWith('_'))
      .map(([k, v]) => `<Data name="${_xmlEsc(k)}"><value>${_xmlEsc(v)}</value></Data>`).join('');
    return `<Placemark><name>${_xmlEsc(p.naziv ?? '')}</name>${stil}<ExtendedData>${ext}</ExtendedData>${_kmlGeom(f.geometry)}</Placemark>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${_xmlEsc(naziv)}</name>\n${pm}\n</Document></kml>`;
}
// UTF-8 BOM da Excel ispravno prikaže č/ć/š/ž; zarez kao separator, tačka za decimale (QGIS).
function _uCsv(kolone, redovi) {
  const e = v => { const s = v == null ? '' : String(v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return '\ufeff' + [kolone, ...redovi].map(r => r.map(e).join(',')).join('\n');
}
function _izvozFajl(fname, sadrzaj, mime, naslov) {
  // Binarni sadržaj (KMZ sa fotografijama) kao Blob: base64 kroz FileReader.
  if (sadrzaj instanceof Blob) {
    if (typeof AndroidShare !== 'undefined' && AndroidShare.shareFile) {
      const fr = new FileReader();
      fr.onload = () => { try { AndroidShare.shareFile(fname, 'data:' + mime + ';base64,' + String(fr.result).split(',')[1], naslov, naslov); } catch (e) { showToast('⚠ Dijeljenje nije uspjelo'); } };
      fr.readAsDataURL(sadrzaj); return;
    }
  } else if (typeof AndroidShare !== 'undefined' && AndroidShare.shareFile) {
    try { AndroidShare.shareFile(fname, 'data:' + mime + ';base64,' + btoa(unescape(encodeURIComponent(sadrzaj))), naslov, naslov); return; } catch (e) {}
  }
  const file = new File([sadrzaj], fname, { type: mime });
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: naslov }).catch(() => {});
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = fname; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  showToast('📥 Preuzeto: ' + fname);
}
function _izvozDugmad(sta, formati) {
  const oz = { kml: 'KML', geojson: 'GeoJSON', csv: 'CSV' };
  return `<div class="izvoz-red"><span>⤓ Izvoz</span>${(formati || ['kml', 'geojson', 'csv']).map(f => `<button onclick="_izvoz('${sta}','${f}')">${oz[f]}</button>`).join('')}</div>`;
}
async function _izvoz(sta, format) {
  try {
    const d = await _izvozPodaci(sta);
    if (!d || !d.fc.features.length && !(d.csv && d.csv.redovi.length)) { showToast('Nema podataka za izvoz u ovom prikazu'); return; }
    const baza = d.naziv.normalize('NFKD').replace(/[^\w\-]+/g, '_').replace(/_+/g, '_') + '_' + new Date().toISOString().slice(0, 10);
    if (format === 'kml') _izvozFajl(baza + '.kml', _gjUKml(d.fc, d.naziv), _IZVOZ_MIME.kml, d.naziv);
    else if (format === 'geojson') _izvozFajl(baza + '.geojson', JSON.stringify(d.fc), _IZVOZ_MIME.geojson, d.naziv);
    else _izvozFajl(baza + '.csv', _uCsv(d.csv.kolone, d.csv.redovi), _IZVOZ_MIME.csv, d.naziv);
  } catch (e) { showToast('⚠ Izvoz nije uspio: ' + (e && e.message || e)); }
}
const _fc = features => ({ type: 'FeatureCollection', features });
const _r1 = v => Math.round(v * 10) / 10;

async function _izvozPodaci(sta) {
  if (sta === 'odjel') return _izvozOdjel();
  return null;
}
// ── Odjeli: ugrađeni geo/odjeli.kml + KML-ovi iz "Učitaj KML" ────────────
async function _odjeliUcitajUgradjene() {
  try {
    if (typeof kmlLs === 'undefined' || kmlLs.some(k => k._ugradjeno)) return;
    const r = await fetch('geo/odjeli.kml');
    if (!r.ok) return;
    const doc = new DOMParser().parseFromString(await r.text(), 'text/xml');
    let s = null; try { s = JSON.parse(localStorage.getItem('usf_stil_ugradjeno') || 'null'); } catch (e) {} // stil iz Editora slojeva
    const col = (s && s.col) || '#e2e8f0', grp = pkml(doc, col, undefined, s && s.stil);
    grp.addTo(map);
    kmlLs.push({ id: 'kml_odjeli_ugradjeno', name: 'Odjeli (ugrađeno)', grp, col, stil: s && s.stil, vis: true, _ugradjeno: true });
    _kmlRegRender();
  } catch (e) {}
}
let _odjeliKes = null, _odjeliKesKljuc = '';
function _odjeliSvi() {
  if (typeof kmlLs === 'undefined') return [];
  const kljuc = kmlLs.map(k => k.id).join('|');
  if (_odjeliKes && _odjeliKesKljuc === kljuc) return _odjeliKes;
  const out = [];
  const walk = (l, izvor) => {
    if (!l) return;
    if (l._kmlIsPolygon && l.toGeoJSON) { try { out.push({ ime: l._kmlName || izvor, izvor, sloj: l, gj: l.toGeoJSON(), bbox: null }); } catch (e) {} return; }
    if (l.eachLayer) { try { l.eachLayer(x => walk(x, izvor)); } catch (e) {} }
  };
  kmlLs.forEach(k => walk(k.grp, k.name));
  out.forEach(o => { o.bbox = turf.bbox(o.gj); });
  _odjeliKes = out; _odjeliKesKljuc = kljuc;
  return out;
}

// ── Izvještaj odjela ─────────────────────────────────────────────────
// Nagib u izvještaju je u PROCENTIMA (tan × 100); klase i boje iste kao karta nagiba (terrainSlopeClasses).
const _odjPct = st => Math.tan(st * Math.PI / 180) * 100;
const _ODJ_STRANE = ['S', 'SI', 'I', 'JI', 'J', 'JZ', 'Z', 'SZ'];
// Ruža ekspozicije: 8 isječaka, dužina po udjelu (eksp[0..7] u %).
function _odjRuza(eksp) {
  const mx = Math.max(1, ...eksp.slice(0, 8)), R = 34, c = 46;
  const t = (az, r) => [(c + Math.sin(az * Math.PI / 180) * r).toFixed(1), (c - Math.cos(az * Math.PI / 180) * r).toFixed(1)].join(',');
  const isj = eksp.slice(0, 8).map((v, i) => { if (!v) return ''; const r = 4 + (R - 4) * v / mx, a = i * 45; return `<polygon points="${t(0, 0)} ${t(a - 20, r)} ${t(a, r)} ${t(a + 20, r)}" fill="${v === mx ? '#fbbf24' : '#4ade80'}" fill-opacity=".85"/>`; }).join('');
  const kr = [R / 2, R].map(r => `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#334155" stroke-width=".8"/>`).join('');
  const sl = _ODJ_STRANE.map((n, i) => { const [x, y] = t(i * 45, R + 8).split(','); return `<text x="${x}" y="${y}" font-size="${n.length > 1 ? 7 : 8.5}" fill="#94a3b8" text-anchor="middle" dominant-baseline="central">${n}</text>`; }).join('');
  return `<svg class="om-ruza" viewBox="0 0 92 92" width="92" height="92" aria-label="Ruža ekspozicije">${kr}${isj}${sl}</svg>`;
}
async function _odjelTeren(gj) {
  const d = await USFDem.ucitaj();
  const [w, s, e, n] = turf.bbox(gj);
  const x0 = Math.max(0, Math.floor((w - d.ox) / d.rx)), x1 = Math.min(d.W, Math.ceil((e - d.ox) / d.rx));
  const y0 = Math.max(0, Math.floor((n - d.oy) / d.ry)), y1 = Math.min(d.H, Math.ceil((s - d.oy) / d.ry));
  const korak = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, (x1 - x0) * (y1 - y0)) / 20000)));
  let broj = 0, hMin = Infinity, hMax = -Infinity, hSum = 0, nSum = 0, sek = 0;
  const klase = new Array(terrainSlopeClasses.length).fill(0), eksp = new Array(9).fill(0), nagibi = [];
  for (let iy = y0; iy < y1; iy += korak) {
    const lat = d.oy + (iy + 0.5) * d.ry;
    for (let ix = x0; ix < x1; ix += korak) {
      const h = d.data[iy * d.W + ix];
      if (h === USFDem.NODATA) continue;
      if (!turf.booleanPointInPolygon([d.ox + (ix + 0.5) * d.rx, lat], gj)) continue;
      const ne = USFDem.nagibEkspozicija(d, ix, iy, lat);
      if (!ne) continue;
      const pc = _odjPct(ne.nagib);
      broj++; hSum += h; nSum += pc; nagibi.push(pc); sek += 1 / Math.cos(ne.nagib * Math.PI / 180);
      if (h < hMin) hMin = h; if (h > hMax) hMax = h;
      klase[terrainSlopeClasses.findIndex(k => pc < k.max)]++;
      eksp[ne.nagib < 5 ? 8 : Math.floor((ne.eksp + 22.5) / 45) % 8]++;
    }
  }
  if (!broj) return { greska: 'odjel je van područja lokalnog DEM-a (5 općina)' };
  const pct = a => a.map(v => Math.round(v / broj * 100)), ep = pct(eksp);
  nagibi.sort((a, b) => a - b);
  const kv = q => _r1(nagibi[Math.min(nagibi.length - 1, Math.floor(q * nagibi.length))]), dom = ep.slice(0, 8).indexOf(Math.max(...ep.slice(0, 8)));
  // nagib* u %; stvarna (nagibna) površina = horizontalna × prosjek 1/cos(nagib)
  return { hMin, hMax, hSr: Math.round(hSum / broj), nagibSr: _r1(nSum / broj), nagibP10: kv(0.1), nagibP90: kv(0.9), nagibMax: _r1(nagibi[nagibi.length - 1]),
    faktor: sek / broj, klase: pct(klase), eksp: ep, dom: ep[dom] ? _ODJ_STRANE[dom] : null, domPct: ep[dom] || 0 };
}
let _odjelAkt = null, _odjelRez = null;
function _odjelModal() {
  let m = document.getElementById('odjel-modal');
  if (!m) {
    m = document.createElement('div'); m.id = 'odjel-modal';
    m.innerHTML = '<div class="om-card"><div id="odjel-modal-body"></div></div>';
    m.addEventListener('click', e => { if (e.target === m) _odjelZatvori(); });
    document.body.appendChild(m);
  }
  return m;
}
function _odjelZatvori() { const m = document.getElementById('odjel-modal'); if (m) m.classList.remove('show'); }
// Slika odjela u razmjeri: odjel istaknut, susjedni poligoni istog sloja u obuhvatu tanko s nazivima.
// Oznaka za sliku: ODJEL (+ ODSJEK) iz atributa KML-a; bez atributa ostaje naziv objekta.
function _odjelOznaka(sloj, rezerva) {
  const ext = (sloj && sloj._kmlExtData) || {}, uzmi = k => { const kk = Object.keys(ext).find(x => x.toUpperCase() === k); return kk && ext[kk] != null ? String(ext[kk]).trim() : ''; };
  const odj = uzmi('ODJEL'), ods = uzmi('ODSJEK');
  return odj ? odj + (ods ? ' · ' + ods : '') : rezerva;
}
function _odjelSlika(stamp, gj, ime) {
  if (!window.USFSlika) { showToast('⚠ Izvoz slike nije dostupan'); return; }
  const o = stamp != null ? _odjeliSvi().find(x => x.sloj && L.stamp(x.sloj) === stamp) : null;
  const g = o ? o.gj : gj, naziv = o ? o.ime : ime || 'Odjel'; if (!g) return;
  const prsteni = gg => { const geo = gg.geometry || gg; return (geo.type === 'MultiPolygon' ? geo.coordinates : [geo.coordinates]).map(p => p[0].map(([lo, la]) => [la, lo])); };
  const glavni = prsteni(g).map((ring, i) => ({ ring, boja: '#000000', sirina: 9, crta: [30, 14], ispuna: 'rgba(15,23,42,.07)', glavni: true, natpis: i ? '' : _odjelOznaka(o && o.sloj, naziv) }));
  const b = turf.bbox(g), m = Math.max(b[2] - b[0], b[3] - b[1]) * 0.6, susj = [];
  // granice iz karte: svi poligoni slojeva koji su trenutno na karti (i providni), ne samo isti sloj
  if (o) _odjeliSvi().filter(x => x !== o && x.sloj._map && x.bbox[0] < b[2] + m && x.bbox[2] > b[0] - m && x.bbox[1] < b[3] + m && x.bbox[3] > b[1] - m).slice(0, 400)
    .forEach(x => prsteni(x.gj).forEach((ring, i) => susj.push({ ring, boja: '#000000', sirina: 9, crta: [30, 14], rub: true, natpis: i ? '' : _odjelOznaka(x.sloj, x.ime) })));
  const ha = _r1(turf.area(g) / 1e4);
  let obim = null; try { obim = Math.round(turf.length(turf.polygonToLine(g), { units: 'kilometers' }) * 100) / 100; } catch (e) {}
  // slika bez teksta: korisnik po želji upiše broj odjela koji ide gore u sredinu (prazno = bez natpisa, Odustani = ništa)
  const natpisGore = prompt('Natpis na vrhu slike (npr. broj odjela).\nOstavi prazno za sliku bez ikakvog teksta:', '');
  if (natpisGore === null) return;
  USFSlika.sacuvaj({ cista: true, natpisGore: natpisGore.trim(), naslov: '📊 ' + (/^odjel/i.test(naziv) ? naziv : 'Odjel ' + naziv), ime: 'odjel_' + naziv, podnaslov: o ? o.izvor : '', poligoni: susj.concat(glavni),
    legenda: [{ boja: '#000000', t: 'odjel', tip: 'isprek' }].concat(susj.length ? [{ boja: '#000000', t: 'granice iz karte (susjedni odjeli/odsjeci)', tip: 'isprek' }] : []),
    info: ['Površina ' + String(ha).replace('.', ',') + ' ha' + (obim != null ? ' · obim ' + String(obim).replace('.', ',') + ' km' : '')] });
}
async function _odjelIzvjestaj(stamp) {
  const o = _odjeliSvi().find(x => L.stamp(x.sloj) === stamp);
  if (o) return _odjelIzvjestajZa(o);
}
// Izvještaj za proizvoljnu geometriju (npr. više spojenih odsjeka jednog odjela).
function _odjelIzvjestajGj(gj, ime, izvor) {
  if (!gj) return;
  return _odjelIzvjestajZa({ ime, izvor: izvor || 'spojeni odsjeci', sloj: null, gj, bbox: turf.bbox(gj) });
}
async function _odjelIzvjestajZa(o) {
  try { map.closePopup(); } catch (e) {}
  _odjelAkt = o;
  _odjelRez = { ime: o.ime, izvor: o.izvor, ha: _r1(turf.area(o.gj) / 1e4), ucitava: true };
  try { _odjelRez.obim = Math.round(turf.length(turf.polygonToLine(o.gj), { units: 'kilometers' }) * 100) / 100; } catch (e) {}
  try { const [lo, la] = turf.centroid(o.gj).geometry.coordinates, m = typeof wgsToMGI5 === 'function' ? wgsToMGI5(la, lo) : null; _odjelRez.centar = m ? 'MGI5 Y ' + m.y + ', X ' + m.x : la.toFixed(5) + ', ' + lo.toFixed(5); } catch (e) {}
  _odjelModal().classList.add('show');
  _odjelRender();
  const teren = await _odjelTeren(o.gj).catch(e => ({ greska: e.message }));
  if (_odjelAkt !== o) return;
  Object.assign(_odjelRez, { teren, ucitava: false });
  _odjelRender();
}
function _odjelRender() {
  const el = document.getElementById('odjel-modal-body'), r = _odjelRez;
  if (!el || !r) return;
  const kartica = (naslov, sadrzaj) => `<div class="om-sek"><div class="om-nas">${naslov}</div>${sadrzaj}</div>`;
  const red = (l, v) => `<div class="om-red"><span>${l}</span><b>${v}</b></div>`;
  const greska = g => `<div class="om-gr">${_escHtml(g)}</div>`;
  const cekaj = '<div class="om-gr">⏳ računam…</div>';
  const T = r.teren && !r.teren.greska ? r.teren : null, fmt1 = v => String(v).replace('.', ',');
  const kpi = (v, l) => `<div class="om-kpi"><b>${v}</b><small>${l}</small></div>`;
  const kpis = `<div class="om-kpis">${kpi(fmt1(r.ha) + ' ha', 'površina')}${kpi(T ? fmt1(_r1(r.ha * T.faktor)) + ' ha' : '…', 'stvarna (po nagibu)')}${kpi(T ? fmt1(T.nagibSr) + ' %' : '…', 'prosječan nagib')}${kpi(r.obim != null ? fmt1(r.obim) + ' km' : '—', 'obim')}</div>`;
  let teren = cekaj;
  if (r.teren) teren = r.teren.greska ? greska(r.teren.greska)
    : red('Prosječan nagib', `<span class="om-v">${fmt1(T.nagibSr)} %</span>`)
      + red('Raspon nagiba (80 % površine)', `${fmt1(T.nagibP10)} – ${fmt1(T.nagibP90)} %`) + red('Najstrmije', fmt1(T.nagibMax) + ' %')
      + `<div class="om-traka">${terrainSlopeClasses.map((k, i) => T.klase[i] ? `<i style="flex:${T.klase[i]};background:${k.color}" title="${k.label}"></i>` : '').join('')}</div>`
      + `<div class="om-leg">${terrainSlopeClasses.map((k, i) => `<span><i style="background:${k.color}"></i>${k.label} <b>${T.klase[i]} % pov.</b></span>`).join('')}</div>`
      + `<div class="om-dva"><div>${red('Nadmorska visina', `${T.hMin}–${T.hMax} m`) + red('Prosječna visina', T.hSr + ' m') + red('Visinska razlika', (T.hMax - T.hMin) + ' m')
        + red('Dominantna ekspozicija', T.dom ? `${T.dom} (${T.domPct} %)` : 'ravno') + (T.eksp[8] ? red('Ravno (< 9 %)', T.eksp[8] + ' %') : '')}</div>${_odjRuza(T.eksp)}</div>`;
  el.innerHTML = `<div class="om-head"><div><div class="om-ime">📊 ${_escHtml(r.ime)}</div><div class="om-pod">${_escHtml(r.izvor)}${r.centar ? ' · centar ' + r.centar : ''}</div></div><button class="om-x" onclick="_odjelZatvori()">✕</button></div>
    ${kpis}${kartica('⛰ Teren', teren)}
    <div class="om-akcije"><button class="om-btn" onclick="_odjelSlikaAkt()">🖼 Sačuvaj sliku</button></div>
    ${_izvozDugmad('odjel', ['kml', 'csv'])}`;
}
function _odjelSlikaAkt() { const o = _odjelAkt; if (o) _odjelSlika(o.sloj ? L.stamp(o.sloj) : null, o.gj, o.ime); }
function _izvozOdjel() {
  const r = _odjelRez, o = _odjelAkt;
  if (!r || !o) return null;
  const s = [['odjel', r.ime], ['izvor', r.izvor], ['povrsina_ha', r.ha]];
  if (r.obim != null) s.push(['obim_km', r.obim]);
  if (r.centar) s.push(['centar', r.centar]);
  if (r.teren && !r.teren.greska) {
    s.push(['povrsina_stvarna_ha', _r1(r.ha * r.teren.faktor)], ['visina_min_m', r.teren.hMin], ['visina_max_m', r.teren.hMax], ['visina_sr_m', r.teren.hSr],
      ['nagib_sr_pct', r.teren.nagibSr], ['nagib_p10_pct', r.teren.nagibP10], ['nagib_p90_pct', r.teren.nagibP90], ['nagib_max_pct', r.teren.nagibMax], ['ekspozicija_dominantna', r.teren.dom || 'ravno']);
    terrainSlopeClasses.forEach((k, i) => s.push(['nagib_' + k.label.replace(' %', '').replace('>', 'preko_') + 'pct_udio', r.teren.klase[i]]));
    ['S', 'SI', 'I', 'JI', 'J', 'JZ', 'Z', 'SZ', 'ravno'].forEach((t, i) => s.push(['ekspozicija_' + t + '_pct', r.teren.eksp[i]]));
  }
  const props = { naziv: r.ime, _boja: '#e2e8f0' };
  s.forEach(([k, v]) => { props[k] = v; });
  return { naziv: /^odjel/i.test(r.ime) ? r.ime : 'Odjel ' + r.ime, fc: _fc([{ type: 'Feature', geometry: o.gj.geometry, properties: props }]), csv: { kolone: ['pokazatelj', 'vrijednost'], redovi: s } };
}

if (typeof window !== 'undefined' && typeof map !== 'undefined') {
  _odjeliUcitajUgradjene();
}
if (typeof module !== 'undefined') module.exports = { _gjUKml, _uCsv, _kmlGeom };
