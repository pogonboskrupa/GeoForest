// Doznaka stabala: projekat = odjel (poligon iz KML-a, površina odatle) + pojasevi (tragovi) kojima se kreće projektant
// kad doznačuje stabla. Pojas se snima GPS-om (native GpsService, radi i pod zaključanim ekranom) ili uvozi iz KML-a;
// svaki projektant ima svoju boju. Prostor odjela se dijeli između pojaseva po najbližem pojasu: sredina između dva
// susjedna pojasa je isprekidana linija, polovina prostora ide boji jednog, polovina boji drugog pojasa, a prvi (i zadnji)
// pojas boji sve do granice poligona.
// localStorage `usf_doznaka`: { akt, projekti: [{ id, naziv, odjel, ring, ha, vis, projektanti: {ime: boja}, tragovi: [{ id, projektant, boja, pts, t, izvor }], t }] }.
(function () {
  'use strict';
  const KLJUC = 'usf_doznaka', KLJUC_SNIMA = 'usf_doz_snima', KLJUC_PROJ = 'usf_doz_projektant', BG_ID = 'doznaka';
  const PALETA = ['#f97316', '#38bdf8', '#a78bfa', '#f43f5e', '#22c55e', '#eab308', '#14b8a6', '#ec4899'];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const toast = t => { if (typeof showToast === 'function') showToast(t); };
  const fmt = (n, d = 0) => Number(n).toFixed(d).replace('.', ',');
  const fmtM = m => (m >= 1000 ? fmt(m / 1000, 2) + ' km' : Math.round(m) + ' m');
  const T = () => (typeof turf !== 'undefined' ? turf : null);

  // ── Geometrija: lokalna ravan u metrima (Voronoi mora raditi u metrima, ne u stepenima) ──
  const RZ = 6371008.8, rad = x => x * Math.PI / 180;
  function ravan(la0, lo0) {
    const ky = RZ * rad(1), kx = ky * Math.cos(rad(la0));
    return { fw: q => [(q[1] - lo0) * kx, (q[0] - la0) * ky], bw: p => [la0 + p[1] / ky, lo0 + p[0] / kx] };
  }
  const duzinaXY = l => { let d = 0; for (let i = 1; i < l.length; i++) d += Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1]); return d; };
  const duzinaLL = pts => { if (!pts || pts.length < 2) return 0; const P = ravan(pts[0][0], pts[0][1]); return duzinaXY(pts.map(P.fw)); };
  function povrsinaXY(r) { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; }
  function povrsinaLL(ring) { if (!ring || ring.length < 3) return 0; const P = ravan(ring[0][0], ring[0][1]); return povrsinaXY(ring.map(P.fw)); }
  const zatvori = r => (r.length && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1]) ? r.concat([r[0]]) : r);
  // tačke na polilinji svakih ≤ korak m (uključujući tjemena)
  function uzorak(l, korak) {
    const out = [];
    for (let i = 0; i < l.length; i++) {
      out.push(l[i]);
      if (i + 1 < l.length) {
        const d = Math.hypot(l[i + 1][0] - l[i][0], l[i + 1][1] - l[i][1]), n = Math.floor(d / korak);
        for (let k = 1; k <= n; k++) { const f = k * korak / d; if (f < 1) out.push([l[i][0] + (l[i + 1][0] - l[i][0]) * f, l[i][1] + (l[i + 1][1] - l[i][1]) * f]); }
      }
    }
    return out;
  }
  function unija(lista) {
    const t = T();
    while (lista.length > 1) { const n = []; for (let i = 0; i < lista.length; i += 2) n.push(i + 1 < lista.length ? (t.union(lista[i], lista[i + 1]) || lista[i]) : lista[i]); lista = n; }
    return lista[0];
  }
  const prstenovi = f => (!f ? [] : f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : []);

  // Podjela poligona (ring [[la, lo]]) između pojaseva (tragovi [[la, lo]…]) po najbližem pojasu.
  // → { regije: [{ i, poligoni: [[prsten[[la, lo]]…]], ha }], crte: [[[la, lo]…]], ha }
  function podijeli(ring, tragovi, opc) {
    const t = T(), maxT = (opc && opc.maxTacaka) || 1400;
    const valjani = tragovi.map((tr, i) => ({ tr, i })).filter(x => x.tr && x.tr.length >= 2);
    if (!t || !ring || ring.length < 3 || !valjani.length) return { regije: [], crte: [], ha: 0 };
    const P = ravan(ring[0][0], ring[0][1]), poli = zatvori(ring.map(P.fw));
    const polF = t.polygon([poli]), ha = povrsinaXY(poli) / 10000;
    const bw = r => r.map(P.bw);
    const izlaz = (i, f) => { const pol = prstenovi(f); return { i, poligoni: pol.map(rs => rs.map(bw)), ha: pol.reduce((a, rs) => a + povrsinaXY(rs[0]) - rs.slice(1).reduce((b, h) => b + povrsinaXY(h), 0), 0) / 10000 }; };
    if (valjani.length === 1) return { regije: [izlaz(valjani[0].i, polF)], crte: [], ha };
    const xy = valjani.map(v => v.tr.map(P.fw)), ukupno = xy.reduce((a, l) => a + duzinaXY(l), 0), korak = Math.max(6, ukupno / maxT);
    const tacke = [], vidjeno = new Set();
    xy.forEach((l, k) => uzorak(l, korak).forEach(q => {
      const kl = Math.round(q[0] * 5) + ':' + Math.round(q[1] * 5);
      if (!vidjeno.has(kl)) { vidjeno.add(kl); tacke.push({ q, k }); }
    }));
    if (tacke.length < 3) return { regije: [izlaz(valjani[0].i, polF)], crte: [], ha };
    let xs = poli.map(q => q[0]), ys = poli.map(q => q[1]);
    const bbox = [Math.min(...xs) - 200, Math.min(...ys) - 200, Math.max(...xs) + 200, Math.max(...ys) + 200];
    const vor = t.voronoi(t.featureCollection(tacke.map(a => t.point(a.q))), { bbox });
    const poTragu = valjani.map(() => []);
    vor.features.forEach((c, j) => { if (c && c.geometry && tacke[j]) poTragu[tacke[j].k].push(c); });
    const regije = [];
    poTragu.forEach((cells, k) => {
      if (!cells.length) return;
      let f = null;
      try { f = t.intersect(unija(cells), polF); } catch (e) { f = null; }
      if (f) { let fs = f; try { fs = t.simplify(f, { tolerance: 1, highQuality: false, mutate: false }); } catch (e) {} regije.push({ k, f, fs }); } // fs samo za sredinu (manje tjemena)
    });
    // isprekidana sredina: segmenti granice regije čija druga strana pripada DRUGOJ regiji (i bez dupliranja susjeda)
    const crte = [];
    const uRegiji = (q, r) => { try { return t.booleanPointInPolygon(t.point(q), r.fs); } catch (e) { return false; } };
    regije.forEach(r => {
      let tek = [];
      const stani = () => { if (tek.length > 1) crte.push(tek.map(P.bw)); tek = []; };
      prstenovi(r.fs).forEach(rs => rs.forEach(prs => {
        for (let s = 0; s + 1 < prs.length; s++) {
          const a = prs[s], b = prs[s + 1], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy);
          if (d < 1e-6) continue;
          const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], nx = -dy / d * 0.5, ny = dx / d * 0.5;
          const p1 = [m[0] + nx, m[1] + ny], p2 = [m[0] - nx, m[1] - ny], van = uRegiji(p1, r) ? p2 : p1;
          const drugi = regije.find(o => o !== r && uRegiji(van, o));
          if (drugi && r.k < drugi.k) { if (!tek.length) tek.push(a); tek.push(b); } else stani();
        }
        stani();
      }));
    });
    return { regije: regije.map(r => izlaz(valjani[r.k].i, r.f)), crte, ha };
  }

  // ── KML: izvoz pojaseva i uvoz ──
  const bojaKml = h => 'ff' + h.slice(5, 7) + h.slice(3, 5) + h.slice(1, 3);
  const uB64 = s => btoa(unescape(encodeURIComponent(s)));
  const izB64 = s => decodeURIComponent(escape(atob(s)));
  function kmlTragovi(p, tragovi, sa_odjelom) {
    const k = q => q[1].toFixed(7) + ',' + q[0].toFixed(7) + ',0';
    const boje = [...new Set(tragovi.map(t => t.boja))];
    const stilovi = boje.map(b => `<Style id="s${b.slice(1)}"><LineStyle><color>${bojaKml(b)}</color><width>4</width></LineStyle></Style>`).join('');
    const pm = tragovi.map((t, i) => {
      const meta = uB64(JSON.stringify({ projektant: t.projektant, boja: t.boja, projekat: p.naziv, t: t.t }));
      return `<Placemark><name>${esc(t.projektant)} · pojas ${i + 1}</name><styleUrl>#s${t.boja.slice(1)}</styleUrl><ExtendedData><Data name="usf_doznaka"><value>${meta}</value></Data></ExtendedData><LineString><tessellate>1</tessellate><coordinates>${t.pts.map(k).join(' ')}</coordinates></LineString></Placemark>`;
    }).join('\n');
    const odjel = sa_odjelom && p.ring ? `<Style id="odjel"><LineStyle><color>ff8ae6fd</color><width>2</width></LineStyle><PolyStyle><fill>0</fill></PolyStyle></Style><Placemark><name>${esc(p.odjel || p.naziv)}</name><styleUrl>#odjel</styleUrl><Polygon><outerBoundaryIs><LinearRing><coordinates>${zatvori(p.ring).map(k).join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>` : '';
    return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc('Doznaka · ' + p.naziv)}</name>${stilovi}${odjel}\n${pm}\n</Document></kml>`;
  }
  // Sve LineString linije iz KML dokumenta: [{ ime, pts: [[la, lo]], meta }]
  function linijeIzKml(doc) {
    const out = [];
    for (const pm of Array.from(doc.getElementsByTagName('Placemark'))) {
      let meta = null;
      const dv = Array.from(pm.getElementsByTagName('Data')).find(d => d.getAttribute('name') === 'usf_doznaka');
      if (dv) { try { meta = JSON.parse(izB64(dv.getElementsByTagName('value')[0].textContent.trim())); } catch (e) { meta = null; } }
      const ime = ((pm.getElementsByTagName('name')[0] || {}).textContent || '').trim();
      for (const ls of Array.from(pm.getElementsByTagName('LineString'))) {
        const c = ls.getElementsByTagName('coordinates')[0]; if (!c) continue;
        const pts = c.textContent.trim().split(/\s+/).map(s => s.split(',').map(Number)).filter(a => a.length >= 2 && Number.isFinite(a[0]) && Number.isFinite(a[1])).map(a => [a[1], a[0]]);
        if (pts.length >= 2) out.push({ ime, pts, meta });
      }
    }
    return out;
  }

  // ── Stanje ──
  function citaj() {
    try { const v = JSON.parse(localStorage.getItem(KLJUC) || 'null'); if (v && Array.isArray(v.projekti)) return v; } catch (e) {}
    return { akt: null, projekti: [] };
  }
  let S = citaj();
  const pisi = () => { try { localStorage.setItem(KLJUC, JSON.stringify(S)); return true; } catch (e) { toast('⚠ Nema mjesta za spremanje doznake'); return false; } };
  const nadji = id => S.projekti.find(p => p.id === id);
  const aktivni = () => nadji(S.akt);
  const slijedecaBoja = p => PALETA.find(b => !Object.values(p.projektanti || {}).includes(b)) || PALETA[Object.keys(p.projektanti || {}).length % PALETA.length];
  function bojaProjektanta(p, ime) { p.projektanti = p.projektanti || {}; if (!p.projektanti[ime]) p.projektanti[ime] = slijedecaBoja(p); return p.projektanti[ime]; }

  // ── Karta (samo u aplikaciji; u testu nema `map`) ──
  const imaKartu = () => typeof map !== 'undefined' && typeof L !== 'undefined';
  let slojevi = null, snimaSloj = null, racunaTimer = null;
  function pane() {
    if (!map.getPane('doznakaPane')) { map.createPane('doznakaPane'); const pn = map.getPane('doznakaPane'); pn.style.zIndex = '413'; pn.style.pointerEvents = 'none'; }
    return 'doznakaPane';
  }
  function crtaj() {
    if (!imaKartu()) return;
    if (slojevi) { map.removeLayer(slojevi); slojevi = null; }
    slojevi = L.layerGroup();
    const rend = L.canvas({ pane: pane(), padding: 0.4 });
    S.projekti.filter(p => p.vis !== false).forEach(p => {
      if (p.ring) L.polygon(p.ring, { pane: pane(), renderer: rend, color: '#fde68a', weight: 2, fill: false, interactive: false }).addTo(slojevi);
      const pod = p._pod;
      if (pod) {
        pod.regije.forEach((r, n) => {
          const t = p.tragovi[r.i]; if (!t) return;
          r.poligoni.forEach(rs => L.polygon(rs, { pane: pane(), renderer: rend, stroke: false, fillColor: t.boja, fillOpacity: n % 2 ? 0.26 : 0.4, interactive: false }).addTo(slojevi));
        });
        pod.crte.forEach(c => {
          L.polyline(c, { pane: pane(), renderer: rend, color: '#fff', weight: 4, opacity: 0.85, interactive: false }).addTo(slojevi);
          L.polyline(c, { pane: pane(), renderer: rend, color: '#111', weight: 2, dashArray: '8 6', interactive: false }).addTo(slojevi);
        });
      }
      p.tragovi.forEach(t => L.polyline(t.pts, { pane: pane(), renderer: rend, color: t.boja, weight: 3, opacity: 1, interactive: false }).addTo(slojevi));
    });
    slojevi.addTo(map);
  }
  // Preračun podjele je skup (Voronoi + unije): odgođen i samo kad se promijene pojasevi
  function preracunaj(p, odmah) {
    const potpis = p.tragovi.map(t => t.id + ':' + t.pts.length).join('|') + '#' + (p.ring ? p.ring.length : 0);
    if (p._pot === potpis && p._pod) return;
    p._pot = potpis; p._racuna = true;
    const posao = () => {
      try { p._pod = podijeli(p.ring, p.tragovi.map(t => t.pts)); } catch (e) { p._pod = null; toast('⚠ Podjela pojaseva: ' + e.message); }
      p._racuna = false; crtaj(); render();
    };
    if (odmah) posao(); else { clearTimeout(racunaTimer); racunaTimer = setTimeout(posao, 30); }
  }

  // ── Snimanje pojasa ──
  let snima = null;
  function snimaPisi() { if (snima) try { localStorage.setItem(KLJUC_SNIMA, JSON.stringify({ pid: snima.pid, ime: snima.ime, boja: snima.boja, pts: snima.pts, zadT: snima.zadT })); } catch (e) {} }
  function tackaDodaj(la, lo, ac, t) {
    if (!snima || !(ac <= 20) || !(t > snima.zadT)) return false;
    const z = snima.pts[snima.pts.length - 1];
    if (z && duzinaLL([z, [la, lo]]) < 3) return false;
    snima.pts.push([la, lo]); snima.zadT = t;
    if (++snima.nes >= 5) { snima.nes = 0; snimaPisi(); }
    return true;
  }
  function nativno(pts) { let n = 0; for (const q of pts) if (tackaDodaj(q.la, q.lo, Number.isFinite(q.ac) ? q.ac : 99, q.t)) n++; if (n) snimaOsvjezi(); }
  function snimaOsvjezi() {
    if (imaKartu() && snima) {
      if (!snimaSloj) snimaSloj = L.polyline([], { pane: pane(), color: snima.boja, weight: 4, dashArray: '2 7', lineCap: 'round', interactive: false }).addTo(map);
      snimaSloj.setLatLngs(snima.pts); snimaSloj.setStyle({ color: snima.boja });
    }
    const bar = document.getElementById('doz-bar'); if (!bar) return;
    bar.classList.toggle('show', !!snima);
    if (!snima) return;
    const gps = typeof lastP !== 'undefined' && lastP && Number.isFinite(lastP.la) ? lastP : null;
    bar.style.setProperty('--c', snima.boja);
    bar.innerHTML = `<div class="db-top"><i></i><b>${esc(snima.ime)}</b><span>${fmtM(duzinaLL(snima.pts))}${gps ? ' · GPS ±' + Math.round(gps.ac || 0) + ' m' : ' · čekam GPS…'}</span></div>
      <div class="db-dug"><button data-a="kraj">✓ Završi pojas</button><button data-a="odbaci">✕ Odbaci</button></div>`;
  }
  function snimaTik() {
    if (!snima) return;
    const gps = typeof lastP !== 'undefined' && lastP && Number.isFinite(lastP.la) ? lastP : null;
    if (gps && !snima.nat && tackaDodaj(gps.la, gps.lo, gps.ac || 99, Date.now())) { /* crta se ispod */ }
    snimaOsvjezi();
  }
  function snimaPocni(p, ime, boja, stari) {
    const bg = typeof window !== 'undefined' ? window.usfPozadina : null;
    if (typeof gpsOn !== 'undefined' && !gpsOn && typeof startGPS === 'function') startGPS();
    snima = { pid: p.id, ime, boja, pts: stari ? stari.pts : [], zadT: stari ? stari.zadT : Date.now(), nes: 0, nat: !!(bg && bg.nativno()), tik: setInterval(snimaTik, 1000) };
    if (bg) bg.pocni(BG_ID, 'Doznaka stabala · ' + ime, nativno);
    snimaPisi(); snimaOsvjezi();
    if (typeof switchMainTab === 'function') switchMainTab('karta');
    if (imaKartu() && p.ring) map.fitBounds(L.latLngBounds(p.ring).pad(0.2), { maxZoom: 18 });
  }
  function snimaGasi() {
    if (!snima) return;
    clearInterval(snima.tik);
    const bg = window.usfPozadina; if (bg) bg.zavrsi(BG_ID);
    try { localStorage.removeItem(KLJUC_SNIMA); } catch (e) {}
    if (snimaSloj && imaKartu()) { map.removeLayer(snimaSloj); snimaSloj = null; }
    snima = null; snimaOsvjezi();
  }
  async function snimaKraj() {
    if (!snima) return;
    const bg = window.usfPozadina; if (bg) { try { await bg.dopuni(); } catch (e) {} }
    const s = snima, p = nadji(s.pid), d = duzinaLL(s.pts);
    snimaGasi();
    if (!p) return;
    if (s.pts.length < 2 || d < 20) { toast('⚠ Pojas je prekratak (' + Math.round(d) + ' m) — nije sačuvan'); render(); return; }
    p.tragovi.push({ id: uid(), projektant: s.ime, boja: bojaProjektanta(p, s.ime), pts: s.pts, t: Date.now(), izvor: 'gps' });
    p.t = Date.now(); pisi(); preracunaj(p); crtaj(); render();
    toast('✅ Pojas sačuvan · ' + fmtM(d));
    if (typeof switchMainTab === 'function') { _otvoriPanel(); }
  }
  async function snimaOdbaci() {
    if (!snima) return;
    if (typeof _dlgConfirm === 'function' && !await _dlgConfirm('Odbaciti snimljeni pojas (' + fmtM(duzinaLL(snima.pts)) + ')?', { title: 'Odbaci pojas', danger: true, okLabel: 'Odbaci' })) return;
    snimaGasi(); render();
  }

  // ── Panel ──
  const panelOtvoren = () => { const el = typeof document !== 'undefined' && document.getElementById('doznaka-panel'); return !!(el && el.classList.contains('show')); };
  function _otvoriPanel() { if (typeof _openStubPanel === 'function') _openStubPanel('doznaka-panel', 'meni'); render(); }
  const el = () => document.getElementById('doz-body');
  let izbor = null; // { q, naziv } dok se bira poligon odjela

  function izvoriPoligona() {
    const out = [], vidjen = new Set();
    const dodaj = (ring, ime, sloj) => { if (ring.length >= 3) out.push({ ring, ime, sloj }); };
    try { _kmlPoligoniOdabir().forEach(o => { vidjen.add(o.kljuc); dodaj(o.ring, (typeof _odjelOznaka === 'function' ? _odjelOznaka(o) : '') || o.naziv || ('Odjel ' + o.odjel), o.sloj); }); } catch (e) {}
    try {
      kmlLs.forEach(k => {
        if (!k || !k.grp || k.samoOdabir || _kmlJePoligonski(k.name)) return;
        _kmlObjekti(k).forEach(l => { if (!l._kmlIsPolygon) return; let r = []; try { r = _kmlPrsten(l).map(q => [q.lat, q.lng]); } catch (e) {} dodaj(r, l._kmlName || k.name, k.name); });
      });
    } catch (e) {}
    return out;
  }

  function projektHtml(p) {
    const pod = p._pod, poPr = {};
    p.tragovi.forEach((t, i) => { const o = poPr[t.projektant] = poPr[t.projektant] || { boja: t.boja, n: 0, km: 0, ha: 0 }; o.n++; o.km += duzinaLL(t.pts); const r = pod && pod.regije.find(x => x.i === i); if (r) o.ha += r.ha; });
    const imena = Object.keys(poPr);
    const red = imena.map(i => `<div class="dz-proj"><button class="dz-boja" style="--c:${esc(poPr[i].boja)}" data-a="boja" data-ime="${esc(i)}" aria-label="Promijeni boju: ${esc(i)}"></button><div><b>${esc(i)}</b><small>${poPr[i].n} ${poPr[i].n === 1 ? 'pojas' : 'pojasa'} · ${fmtM(poPr[i].km)}</small></div><span>${pod ? fmt(poPr[i].ha, 2) + ' ha' + (p.ha ? ' · ' + Math.round(poPr[i].ha / p.ha * 100) + ' %' : '') : '…'}</span></div>`).join('');
    const tr = p.tragovi.map((t, i) => { const r = pod && pod.regije.find(x => x.i === i);
      return `<div class="dz-trag" style="--c:${esc(t.boja)}" data-id="${esc(t.id)}"><div class="dz-t-i"><b>${esc(t.projektant)} · pojas ${i + 1}</b><small>${fmtM(duzinaLL(t.pts))} · ${t.izvor === 'kml' ? 'uvezeno' : 'GPS'} · ${new Date(t.t).toLocaleDateString('bs')}${r ? ' · ' + fmt(r.ha, 2) + ' ha' : ''}</small></div>
        <div class="dz-t-a"><button data-a="tzoom" aria-label="Na karti">🔍</button><button data-a="tim" aria-label="Projektant">✏</button><button data-a="tsend" aria-label="Pošalji">📤</button><button data-a="tbris" aria-label="Obriši">🗑</button></div></div>`; }).join('');
    return `<section class="ng-card dz-kar">
      <div class="dz-kpi"><div><b>${fmt(p.ha, 2)} ha</b><span>površina odjela</span></div><div><b>${p.tragovi.length}</b><span>pojaseva</span></div><div><b>${pod ? fmt(pod.regije.reduce((a, r) => a + r.ha, 0), 2) + ' ha' : p._racuna ? '⏳' : '—'}</b><span>obuhvaćeno</span></div></div>
      <div class="sl-dug"><button class="zp-glavno" data-a="snimi">▶ Snimi pojas (GPS)</button></div>
      <div class="sl-dug"><button data-a="uvezi">📥 Uvezi trag (KML)</button><button data-a="posalji" ${p.tragovi.length ? '' : 'disabled'}>📤 Pošalji sve</button></div>
      <input type="file" id="doz-fajl" accept=".kml,application/vnd.google-earth.kml+xml,text/xml" hidden>
      ${red ? `<h4 class="dz-h">Projektanti</h4>${red}` : ''}
      ${tr ? `<h4 class="dz-h">Pojasevi</h4>${tr}` : '<p class="uk-izvor">Još nema pojaseva. Pokreni snimanje i kreći se onuda kuda doznačuješ stabla, ili uvezi KML trag.</p>'}
      <p class="uk-izvor">Prostor odjela se dijeli po najbližem pojasu: sredina između susjednih pojaseva je isprekidana linija, svaka polovina dobija boju svog projektanta, a prvi pojas boji sve do granice odjela.</p></section>`;
  }
  function izborHtml() {
    const q = (izbor.q || '').toLowerCase().trim(), izv = izvoriPoligona();
    const l = izv.filter(o => !q || (o.ime + ' ' + o.sloj).toLowerCase().includes(q)).slice(0, 80);
    return `<section class="ng-card dz-kar"><h3>Odaberi odjel za „${esc(izbor.naziv)}”</h3>
      <input id="doz-trazi" class="kh-trazi" type="search" placeholder="🔎 Traži odjel…" value="${esc(izbor.q || '')}">
      <div class="dz-izb">${l.length ? l.map(o => `<button data-a="izaberi" data-k="${izv.indexOf(o)}"><b>${esc(o.ime)}</b><small>${esc(o.sloj)} · ${fmt(povrsinaLL(o.ring) / 10000, 2)} ha</small></button>`).join('') : '<p class="uk-izvor">Nema poligona. Učitaj sloj „Granice taksacije” (Karte → Server) ili svoj KML s poligonima.</p>'}</div>
      <div class="sl-dug"><button data-a="izbor-x">Odustani</button></div></section>`;
  }
  function render() {
    const e = typeof document !== 'undefined' && el(); if (!e) return;
    const st = document.getElementById('mc-stat-doznaka'); if (st) st.textContent = S.projekti.length ? String(S.projekti.length) : '';
    if (!panelOtvoren()) return;
    if (izbor) { e.innerHTML = izborHtml(); const t = document.getElementById('doz-trazi'); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } return; }
    const lista = S.projekti.map(p => `<div class="dz-pr${p.id === S.akt ? ' akt' : ''}" data-id="${esc(p.id)}"><button class="dz-pr-i" data-a="otvori"><b>${esc(p.naziv)}</b><small>${esc(p.odjel || '')} · ${fmt(p.ha, 2)} ha · ${p.tragovi.length} ${p.tragovi.length === 1 ? 'pojas' : 'pojasa'}</small></button>
      <button data-a="zoom" aria-label="Na karti">🔍</button><button data-a="vid" aria-label="Prikaži/sakrij">${p.vis === false ? '🙈' : '👁'}</button><button data-a="bris" aria-label="Izbriši">🗑</button></div>`).join('');
    const p = aktivni();
    e.innerHTML = `<section class="ng-card dz-uvod"><h3>Doznaka stabala</h3><p class="uk-izvor">Napravi projekat, izaberi poligon odjela (iz njega dolazi površina), pa na terenu snimaj pojaseve kojima se kreće projektant.</p>
      <div class="sl-dug"><button class="zp-glavno" data-a="novi">＋ Novi projekat</button></div>${lista ? `<div class="dz-lista">${lista}</div>` : ''}</section>${p ? projektHtml(p) : ''}`;
    if (p && !p._pod && !p._racuna && p.tragovi.length) preracunaj(p);
  }

  async function novi() {
    const v = typeof _dlgPrompt === 'function' ? await _dlgPrompt('Naziv projekta doznake', 'Doznaka ' + (S.projekti.length + 1), { title: '🌲 Novi projekat', okLabel: 'Dalje' }) : prompt('Naziv projekta', 'Doznaka');
    if (v == null || !String(v).trim()) return;
    izbor = { q: '', naziv: String(v).trim() }; render();
  }
  function izaberiOdjel(idx) {
    const o = izvoriPoligona()[idx]; if (!o || !izbor) return;
    const p = { id: uid(), naziv: izbor.naziv, odjel: o.ime, ring: o.ring, ha: povrsinaLL(o.ring) / 10000, vis: true, projektanti: {}, tragovi: [], t: Date.now() };
    S.projekti.unshift(p); S.akt = p.id; izbor = null; pisi(); crtaj(); render(); zoom(p.id);
    toast('🌲 Projekat „' + p.naziv + '” · ' + fmt(p.ha, 2) + ' ha');
  }
  function zoom(id) { const p = nadji(id); if (p && p.ring && imaKartu()) { if (typeof switchMainTab === 'function') switchMainTab('karta'); map.fitBounds(L.latLngBounds(p.ring).pad(0.15), { maxZoom: 18 }); } }
  const zapamtiProjektanta = ime => { try { localStorage.setItem(KLJUC_PROJ, ime); } catch (e) {} };
  const zadnjiProjektant = () => { try { return localStorage.getItem(KLJUC_PROJ) || ''; } catch (e) { return ''; } };
  async function pitajProjektanta(naslov, zad) {
    const v = typeof _dlgPrompt === 'function' ? await _dlgPrompt('Ime projektanta (svaki projektant dobija svoju boju)', zad || zadnjiProjektant(), { title: naslov, okLabel: 'Spremi' }) : prompt('Projektant', zad || '');
    const ime = v == null ? '' : String(v).trim().slice(0, 40);
    return ime || null;
  }
  async function snimi() {
    const p = aktivni(); if (!p || snima) { if (snima) toast('⏺ Snimanje pojasa je već u toku'); return; }
    const ime = await pitajProjektanta('▶ Snimanje pojasa'); if (!ime) return;
    zapamtiProjektanta(ime); snimaPocni(p, ime, bojaProjektanta(p, ime)); pisi();
  }
  async function izKml(doc, force) {
    const lin = linijeIzKml(doc), oznaceno = lin.filter(l => l.meta);
    if (!lin.length || (!force && !oznaceno.length)) return false;
    const p = aktivni();
    if (!p) { if (!force) { toast('ℹ KML je trag doznake — prvo napravi projekat u Doznaci stabala'); } else toast('⚠ Prvo napravi projekat'); return !force ? false : true; }
    const sug = (oznaceno[0] && oznaceno[0].meta.projektant) || zadnjiProjektant() || '';
    if (!force && typeof _dlgConfirm === 'function' && !await _dlgConfirm('Trag doznake (' + lin.length + (lin.length === 1 ? ' pojas' : ' pojasa') + ') uvesti u projekat „' + p.naziv + '”?\n\nOdustani = običan KML sloj.', { title: '🌲 Doznaka stabala', okLabel: 'Uvezi' })) return false;
    const ime = await pitajProjektanta('📥 Projektant tog traga', sug); if (!ime) return true;
    zapamtiProjektanta(ime);
    const boja = bojaProjektanta(p, ime);
    lin.forEach(l => p.tragovi.push({ id: uid(), projektant: ime, boja, pts: l.pts, t: Date.now(), izvor: 'kml' }));
    p.t = Date.now(); pisi(); preracunaj(p); crtaj(); render(); _otvoriPanel();
    toast('📥 Uvezeno ' + lin.length + (lin.length === 1 ? ' pojas' : ' pojasa') + ' · ' + ime);
    return true;
  }
  function posalji(p, tragovi, ime) {
    if (typeof _izvozFajl !== 'function') { toast('⚠ Izvoz nije dostupan'); return; }
    const kml = kmlTragovi(p, tragovi, tragovi.length === p.tragovi.length);
    const f = (ime || p.naziv).normalize('NFKD').replace(/[^\w-]+/g, '_');
    _izvozFajl('doznaka_' + f + '.kml', kml, 'application/vnd.google-earth.kml+xml', 'Doznaka stabala · ' + p.naziv + ' — trag doznake (otvori u GeoForest)');
  }
  const trag = (p, id) => p.tragovi.find(t => t.id === id);

  async function akcija(a, cvor) {
    const pr = cvor.closest('.dz-pr'), tr = cvor.closest('.dz-trag'), p = pr ? nadji(pr.dataset.id) : aktivni();
    if (a === 'novi') return novi();
    if (a === 'izbor-x') { izbor = null; return render(); }
    if (a === 'izaberi') return izaberiOdjel(+cvor.dataset.k);
    if (!p) return;
    if (a === 'otvori') { S.akt = p.id; pisi(); render(); return; }
    if (a === 'zoom') return zoom(p.id);
    if (a === 'vid') { p.vis = p.vis === false; pisi(); crtaj(); return render(); }
    if (a === 'bris') {
      if (typeof _dlgConfirm === 'function' && !await _dlgConfirm('Izbrisati projekat „' + p.naziv + '” sa svim pojasevima?', { title: 'Izbriši projekat', danger: true, okLabel: 'Izbriši' })) return;
      S.projekti = S.projekti.filter(x => x.id !== p.id); if (S.akt === p.id) S.akt = (S.projekti[0] || {}).id || null; pisi(); crtaj(); return render();
    }
    if (a === 'snimi') return snimi();
    if (a === 'uvezi') { const f = document.getElementById('doz-fajl'); if (f) f.click(); return; }
    if (a === 'posalji') return posalji(p, p.tragovi);
    if (a === 'boja') {
      const ime = cvor.dataset.ime, tren = p.projektanti[ime], n = PALETA[(PALETA.indexOf(tren) + 1) % PALETA.length];
      p.projektanti[ime] = n; p.tragovi.forEach(t => { if (t.projektant === ime) t.boja = n; });
      pisi(); crtaj(); return render();
    }
    const t = tr && trag(p, tr.dataset.id); if (!t) return;
    if (a === 'tzoom' && imaKartu()) { switchMainTab('karta'); map.fitBounds(L.latLngBounds(t.pts).pad(0.3), { maxZoom: 19 }); return; }
    if (a === 'tsend') return posalji(p, [t], t.projektant);
    if (a === 'tim') {
      const ime = await pitajProjektanta('✏ Projektant', t.projektant); if (!ime) return;
      t.projektant = ime; t.boja = bojaProjektanta(p, ime); pisi(); crtaj(); return render();
    }
    if (a === 'tbris') {
      if (typeof _dlgConfirm === 'function' && !await _dlgConfirm('Obrisati pojas (' + fmtM(duzinaLL(t.pts)) + ')?', { title: 'Obriši pojas', danger: true, okLabel: 'Obriši' })) return;
      p.tragovi = p.tragovi.filter(x => x !== t); p._pot = null; p._pod = null; pisi(); preracunaj(p); crtaj(); render();
    }
  }
  function veze() {
    const tijelo = el(); if (!tijelo) return;
    tijelo.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b && !b.disabled) akcija(b.dataset.a, b); });
    tijelo.addEventListener('input', e => { if (e.target.id === 'doz-trazi' && izbor) { izbor.q = e.target.value; render(); } });
    tijelo.addEventListener('change', async e => {
      if (e.target.id !== 'doz-fajl' || !e.target.files[0]) return;
      const f = e.target.files[0]; e.target.value = '';
      try { const doc = typeof _kmlParseDoc === 'function' ? _kmlParseDoc(await f.text()) : new DOMParser().parseFromString(await f.text(), 'text/xml'); if (!await izKml(doc, true)) toast('⚠ U KML-u nema linija (traga)'); }
      catch (er) { toast('⚠ KML nije učitan: ' + er.message); }
    });
    const bar = document.createElement('div'); bar.id = 'doz-bar'; bar.setAttribute('role', 'status'); document.body.appendChild(bar);
    bar.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (!b) return; if (b.dataset.a === 'kraj') snimaKraj(); else snimaOdbaci(); });
  }
  function nastavi() { // snimanje prekinuto ubijanjem aplikacije: nastavi s onim što je sačuvano
    let z; try { z = JSON.parse(localStorage.getItem(KLJUC_SNIMA) || 'null'); } catch (e) { z = null; }
    const p = z && nadji(z.pid); if (!p || !Array.isArray(z.pts)) { try { localStorage.removeItem(KLJUC_SNIMA); } catch (e) {} return; }
    snimaPocni(p, z.ime, z.boja, z); toast('⏺ Nastavljeno snimanje pojasa · ' + z.ime);
  }
  function init() {
    if (typeof document === 'undefined' || typeof map === 'undefined') return;
    veze(); crtaj(); render();
    S.projekti.forEach(p => { if (p.tragovi.length > 1) preracunaj(p); });
    setTimeout(nastavi, 1500);
  }

  if (typeof window !== 'undefined') {
    window.USFDoz = { otvori() { _otvoriPanel(); }, izKml, osvjezi: () => { crtaj(); render(); }, geo: { podijeli, ravan, povrsinaLL, duzinaLL, uzorak } };
    if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init(); }
  }
  if (typeof module !== 'undefined') module.exports = { ravan, uzorak, podijeli, povrsinaLL, duzinaLL, kmlTragovi, linijeIzKml, bojaKml, PALETA };
})();
