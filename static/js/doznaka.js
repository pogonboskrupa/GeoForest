// Doznaka stabala: projekat = odjel (poligon iz KML-a, površina odatle) + pojasevi (tragovi) kojima se kreće projektant
// kad doznačuje stabla. Pojas se snima GPS-om (native GpsService, radi i pod zaključanim ekranom) ili uvozi iz KML-a;
// svaki projektant ima svoju boju. Prostor odjela se dijeli između pojaseva po najbližem pojasu: sredina između dva
// susjedna pojasa je isprekidana linija, polovina prostora ide boji jednog, polovina boji drugog pojasa, a prvi (i zadnji)
// pojas boji sve do granice poligona.
// localStorage `usf_doznaka`: { akt, projekti: [{ id, naziv, odjel, ring, ha, vis, projektanti: {ime: boja}, tragovi: [{ id, projektant, boja, pts, t, izvor }], t }] }.
(function () {
  'use strict';
  const KLJUC = 'usf_doznaka', KLJUC_SNIMA = 'usf_doz_snima', BG_ID = 'doznaka';
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
      return `<Placemark><name>${esc(t.projektant)} · pojas ${i + 1}</name><description>${esc('Doznaku radio: ' + t.projektant + ' · ' + (p.odjel || p.naziv) + (t.t ? ' · ' + new Date(t.t).toLocaleDateString('bs') : ''))}</description><styleUrl>#s${t.boja.slice(1)}</styleUrl><ExtendedData><Data name="usf_doznaka"><value>${meta}</value></Data></ExtendedData><LineString><tessellate>1</tessellate><coordinates>${t.pts.map(k).join(' ')}</coordinates></LineString></Placemark>`;
    }).join('\n');
    const odjel = sa_odjelom && p.ring ? `<Style id="odjel"><LineStyle><color>ff8ae6fd</color><width>2</width></LineStyle><PolyStyle><fill>0</fill></PolyStyle></Style><Placemark><name>${esc(p.odjel || p.naziv)}</name><styleUrl>#odjel</styleUrl><Polygon><outerBoundaryIs><LinearRing><coordinates>${zatvori(p.ring).map(k).join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>` : '';
    return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc('Doznaka · ' + p.naziv)}</name><description>${esc('Doznaku radio: ' + [...new Set(tragovi.map(t => t.projektant))].join(', '))}</description>${stilovi}${odjel}\n${pm}\n</Document></kml>`;
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
  const pisi = () => { try { localStorage.setItem(KLJUC, JSON.stringify(S, (k, v) => (k[0] === '_' ? undefined : v))); return true; } catch (e) { toast('⚠ Nema mjesta za spremanje doznake'); return false; } };
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
      if (p.stabla && p.stabla.length) {
        const st = stil(p);
        (p.pojasi || []).forEach(q => L.polyline(q.ids.map(i => [p.stabla[i].la, p.stabla[i].lo]), { pane: pane(), renderer: rend, color: st.boja || bojaR(p, q.r), weight: st.w, opacity: st.op / 100, dashArray: STIL_CRTE[st.crta] || null, lineCap: 'round', interactive: false }).addTo(slojevi));
        if (p.stabVid !== false) p.stabla.forEach(x => L.circleMarker([x.la, x.lo], { pane: pane(), renderer: rend, radius: 3, color: '#fff', weight: 1, fillColor: bojaR(p, x.r), fillOpacity: 1, interactive: false }).addTo(slojevi));
      }
    });
    slojevi.addTo(map);
    stablaOznake();
  }
  // ── Doznačena stabla (KML) i pojasi od brojeva ──
  let tab = 'poj', oznSloj = null, stilOtv = false;
  const STIL_ZAD = { w: 2, crta: 'puna', op: 95, boja: '' }, STIL_CRTE = { puna: null, isprek: '10 8', tack: '2 7' };
  const stil = p => ({ ...STIL_ZAD, ...(p.stil || {}) });
  const ST = () => window.USFDozStabla;
  const bojaR = (p, r) => (r ? ((p.projektanti || {})[r] || PALETA[[...r].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETA.length]) : '#94a3b8');
  // Brojevi stabala uz tačke (zoom ≥ 17, najviše 150 u pogledu)
  function stablaOznake() {
    if (!imaKartu()) return;
    if (oznSloj) { map.removeLayer(oznSloj); oznSloj = null; }
    const p = aktivni(); if (!p || p.vis === false || p.stabBr === false || !p.stabla || !p.stabla.length || map.getZoom() < 16) return;
    const v = map.getBounds(), kept = []; oznSloj = L.layerGroup();
    // razrijeđeno: natpis tek ako je od prethodnog udaljen ≥ 30 px (brojevi se ne gomilaju na manjem zumu)
    p.stabla.filter(x => v.contains([x.la, x.lo])).forEach(x => {
      if (kept.length >= 250) return;
      const q = map.latLngToContainerPoint([x.la, x.lo]);
      if (kept.some(k => Math.abs(k.x - q.x) < 30 && Math.abs(k.y - q.y) < 16)) return;
      kept.push(q);
      L.marker([x.la, x.lo], { pane: pane(), interactive: false, icon: L.divIcon({ className: 'dz-br', html: esc(x.t != null && x.t !== '' ? x.t : x.n), iconSize: [30, 14], iconAnchor: [-5, 7] }) }).addTo(oznSloj);
    });
    oznSloj.addTo(map);
  }
  function stilHtml(p) {
    const st = stil(p), ch = (k, v, t, on) => `<button data-a="stil" data-k="${k}" data-v="${esc(v)}" class="${on ? 'on' : ''}">${t}</button>`;
    return `<div class="dz-stil">
      <div class="dz-sr"><b>Debljina</b><div class="dz-chips">${[1, 2, 3, 5, 8].map(v => ch('w', v, v, st.w === v)).join('')}</div></div>
      <div class="dz-sr"><b>Crta</b><div class="dz-chips">${[['puna', '━'], ['isprek', '╍'], ['tack', '┈']].map(([v, t]) => ch('crta', v, t, st.crta === v)).join('')}</div></div>
      <div class="dz-sr"><b>Prozirnost</b><div class="dz-chips">${[30, 60, 100].map(v => ch('op', v, v + ' %', st.op === v || (v === 100 && st.op > 95) )).join('')}</div></div>
      <div class="dz-sr"><b>Boja</b><div class="dz-chips dz-boje">${ch('boja', '', 'Po projektantu', !st.boja)}${PALETA.map(b => `<button data-a="stil" data-k="boja" data-v="${b}" class="dz-sw${st.boja === b ? ' on' : ''}" style="--c:${b}" aria-label="Boja ${b}"></button>`).join('')}</div></div></div>`;
  }
  function stablaHtml(p) {
    const s = p.stabla || [], po = p.pojasi || [], pr = p.stabPrag || 50, grupe = new Map();
    s.forEach(x => { const k = (x.r || '—') + (x.d ? ' · ' + x.d : ''); const o = grupe.get(k) || grupe.set(k, { n: 0, a: Infinity, b: -Infinity }).get(k); o.n++; if (x.n != null) { o.a = Math.min(o.a, x.n); o.b = Math.max(o.b, x.n); } });
    const gr = [...grupe].map(([k, o]) => `<div class="dz-trag" style="--c:#94a3b8"><div class="dz-t-i"><b>${esc(k)}</b><small>${o.n} stabala${isFinite(o.a) ? ' · br. ' + o.a + '–' + o.b : ''}</small></div></div>`).join('');
    const poR = new Map();
    po.forEach(q => { if (!q.r) return; const o = poR.get(q.r) || poR.set(q.r, { r: q.r, sig: q.sig, n: 0, st: 0, dug: 0, a: Infinity, b: -Infinity }).get(q.r); o.n++; o.st += q.ids.length; o.dug += q.dug; q.ids.forEach(i => { const n = s[i].n; if (n != null) { o.a = Math.min(o.a, n); o.b = Math.max(o.b, n); } }); });
    const prj = [...poR.values()].map(o => `<div class="dz-proj"><button class="dz-boja" style="--c:${esc(bojaR(p, o.r))}" data-a="boja" data-ime="${esc(o.r)}" aria-label="Promijeni boju: ${esc(o.r)}"></button><div><b>${esc(o.r)}</b><small>${o.n} ${o.n === 1 ? 'pojas' : 'pojasa'} · ${o.st} stabala${isFinite(o.a) ? ' · br. ' + o.a + '–' + o.b : ''} · ${fmtM(o.dug)}</small></div><button data-a="prime" data-ime="${esc(o.r)}" aria-label="Preimenuj">✏</button></div>`).join('');
    const raspon = q => { const b = q.ids.map(i => s[i].n).filter(n => n != null); return b.length ? ' · br. ' + Math.min(...b) + '–' + Math.max(...b) : ''; };
    const pj = po.map((q, i) => `<div class="dz-trag dz-poj" style="--c:${esc(bojaR(p, q.r))}" data-i="${i}"><div class="dz-t-i"><b>Pojas ${i + 1}${q.r ? ' · ' + esc(q.r) : ''}</b><small>${q.ids.length} stabala${raspon(q)} · ${fmtM(q.dug)}${q.d ? ' · ' + esc(q.d) : ''}</small></div>
      <div class="dz-t-a"><button data-a="pzoom" aria-label="Na karti">🔍</button><button data-a="pdodaj" aria-label="U pojaseve projekta" ${q.dodan ? 'disabled' : ''}>${q.dodan ? '✓' : '➕'}</button></div></div>`).join('');
    return `<section class="ng-card dz-kar">
      <div class="dz-kpi"><div><b>${s.length}</b><span>stabala</span></div><div><b>${grupe.size}</b><span>grupa</span></div><div><b>${po.length}</b><span>pojasa</span></div></div>
      <div class="sl-dug"><button class="zp-glavno" data-a="stuvezi">📥 Uvezi stabla (KML)</button></div>
      <input type="file" id="doz-stabla-fajl" accept=".kml,application/vnd.google-earth.kml+xml,text/xml" hidden>
      ${s.length ? `<div class="dz-chips" role="group" aria-label="Najveći razmak u pojasu">${[30, 50, 80].map(v => `<button data-a="prag" data-v="${v}" class="${pr === v ? 'on' : ''}">${v} m</button>`).join('')}</div>
      ${bezOznaka(p) ? `<label class="dz-korak"><span>Pločica po inženjeru</span><input id="doz-blok" type="number" inputmode="numeric" min="1" value="${p.stabBlok || 300}"></label>` : ''}
      <div class="sl-dug"><button class="zp-glavno" data-a="pojas">🔗 Pojas</button></div>
      <div class="sl-dug"><button data-a="pdodajsve" ${po.length ? '' : 'disabled'}>➕ Sve u pojaseve projekta</button></div>
      <div class="sl-dug dz-tgl"><button data-a="stvid" class="${p.stabVid === false ? '' : 'on'}">👁 Stabla</button><button data-a="stbr" class="${p.stabBr === false ? '' : 'on'}">🔢 Brojevi</button><button data-a="stilot" class="${stilOtv ? 'on' : ''}">🎨 Linije</button><button data-a="stukloni" aria-label="Ukloni stabla">🗑</button></div>
      ${stilOtv ? stilHtml(p) : ''}
      ${bezOznaka(p) && (p.stabBl || []).length ? `<h4 class="dz-h">Inženjeri (blokovi pločica)</h4>${blokHtml(p)}` : prj ? `<h4 class="dz-h">Projektanti</h4>${prj}` : gr ? `<h4 class="dz-h">Grupe</h4>${gr}` : ''}${pj ? `<h4 class="dz-h">Pojasevi</h4>${pj}` : ''}${p.pojUsam ? `<h4 class="dz-h">Usamljena stabla: ${p.pojUsam}</h4>` : ''}${p.pojBezBroja ? `<h4 class="dz-h">Bez broja: ${p.pojBezBroja}</h4>` : ''}` : ''}</section>`;
  }
  async function stablaUvezi(f) {
    const p = aktivni(); if (!p || !ST()) return;
    const doc = typeof _kmlParseDoc === 'function' ? _kmlParseDoc(await f.text()) : new DOMParser().parseFromString(await f.text(), 'text/xml');
    const novo = ST().izKml(doc);
    if (!novo.length) { toast('⚠ U KML-u nema tačaka (stabala)'); return; }
    p.stabla = p.stabla || [];
    const ima = new Set(p.stabla.map(x => x.n + '|' + x.la.toFixed(6) + '|' + x.lo.toFixed(6)));
    let n = 0;
    novo.forEach(x => { const k = x.n + '|' + x.la.toFixed(6) + '|' + x.lo.toFixed(6); if (ima.has(k)) return; ima.add(k); const o = { n: x.n, la: +x.la.toFixed(7), lo: +x.lo.toFixed(7) }; if (x.t != null && String(x.t) !== String(x.n)) o.t = x.t; if (x.r) o.r = x.r; if (x.d) o.d = x.d; p.stabla.push(o); n++; });
    pisi(); crtaj(); render();
    if (imaKartu()) { try { map.fitBounds(L.latLngBounds(p.stabla.map(x => [x.la, x.lo])).pad(0.15), { maxZoom: 18 }); } catch (e) {} }
    toast('📥 Stabla: +' + n + (novo.length - n ? ' (' + (novo.length - n) + ' već ima)' : ''));
  }
  // Blokovi pločica (inženjeri): zadano svakih `p.stabBlok` (300) brojeva; imena i granice korisnik može mijenjati, a nove brojeve (novi uvoz) dopunjava
  function blokoviOsvjezi(p) {
    const korak = p.stabBlok > 0 ? p.stabBlok : 300, zad = ST().blokovi(p.stabla || [], korak);
    if (!p.stabBl || !p.stabBl.length || p.stabBlStep !== korak) {
      const stari = p.stabBl || [];
      p.stabBl = zad.map(b => { const o = stari.find(x => x.od === b.od && x.do === b.do); return o ? { ...b, ime: o.ime } : b; });
      p.stabBlStep = korak; return;
    }
    const max = Math.max(...(p.stabla || []).map(x => x.n).filter(n => n != null), 0), zad_ = p.stabBl[p.stabBl.length - 1];
    if (zad_ && max > zad_.do) zad.filter(b => b.do > zad_.do).forEach(b => p.stabBl.push({ od: Math.max(b.od, zad_.do + 1), do: b.do, ime: b.ime }));
  }
  const bezOznaka = p => (p.stabla || []).length > 0 && p.stabla.every(x => !x.r);
  function stablaPojas(p) {
    const s = p.stabla || [], prag = p.stabPrag || 50;
    let r;
    if (bezOznaka(p)) { blokoviOsvjezi(p); r = ST().gradiBlokove(s, prag, p.stabBl); } else r = ST().gradi(s, prag);
    p.pojasi = r.pojasi; p.pojUsam = r.usamljena; p.pojBezBroja = r.bezBroja || 0;
    p.pojasi.forEach(q => { if (q.r) bojaProjektanta(p, q.r); });
    pisi(); crtaj(); render();
    toast('🔗 ' + r.pojasi.length + (r.pojasi.length === 1 ? ' pojas' : ' pojasa') + (r.usamljena ? ' · ' + r.usamljena + ' usamljenih' : '') + (r.bezBroja ? ' · ' + r.bezBroja + ' bez broja' : ''));
  }
  function blokHtml(p) {
    return (p.stabBl || []).map((b, i) => {
      const st = (p.stabla || []).filter(x => x.n != null && x.n >= b.od && x.n <= b.do).length, pj = (p.pojasi || []).filter(q => q.sig === b.od + '-' + b.do), dug = pj.reduce((a, q) => a + q.dug, 0);
      return `<div class="dz-proj dz-bl" data-i="${i}"><button class="dz-boja" style="--c:${esc(bojaR(p, b.ime))}" data-a="boja" data-ime="${esc(b.ime)}" aria-label="Promijeni boju: ${esc(b.ime)}"></button><div><b>${esc(b.ime)}</b><small>br. ${b.od}–${b.do} · ${st} stabala · ${pj.length} ${pj.length === 1 ? 'pojas' : 'pojasa'} · ${fmtM(dug)}</small></div><button data-a="bime" aria-label="Preimenuj">✏</button><button data-a="bgr" aria-label="Granica bloka">✂</button></div>`;
    }).join('');
  }
  async function pojasUProjekt(p, q) {
    let ime = q.r || (window.USFKorisnik ? USFKorisnik.ime() : '');
    if (!ime) ime = await pitajProjektanta('👤 Radnik tog pojasa', '');
    if (!ime) return false;
    p.tragovi.push({ id: uid(), projektant: ime, boja: bojaProjektanta(p, ime), pts: q.ids.map(i => [p.stabla[i].la, p.stabla[i].lo]), t: Date.now(), izvor: 'stabla' });
    q.dodan = true; return true;
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
  // Pojas se NE smije prekinuti i mora biti precizan. Tačke stižu iz native GpsService (samo GPS provider, 1 s, trajni bafer na disku,
  // wake lock, restart poslije ubijanja); ovdje se filtriraju po tačnosti i GPS skokovima, spremaju na disk poslije SVAKE serije
  // (`usf_doz_snima`), a gubitak signala se vidi (traka, vibracija) i broji u pojasu (`prekidi`).
  const AC_DOBRA = 20, AC_SLABA = 40, ZAZOR_S = 12, SKOK_MS = 5, GUBI_S = 10, PREKID_S = 60;
  let snima = null;
  function snimaPisi() {
    if (!snima) return true;
    try { localStorage.setItem(KLJUC_SNIMA, JSON.stringify({ pid: snima.pid, ime: snima.ime, boja: snima.boja, pts: snima.pts, zadT: snima.zadT, prekidi: snima.prekidi, skokova: snima.skokova })); return true; }
    catch (e) { if (!snima.upozPisi) { snima.upozPisi = true; toast('⚠ Nema mjesta za zaštitnu kopiju pojasa — oslobodi memoriju'); } return false; }
  }
  // Prihvata fiks (la, lo, ac m, t ms). Vraća true ako je tačka ušla u pojas.
  function tackaDodaj(la, lo, ac, t) {
    if (!snima || !(t > snima.zadT)) return false;
    // prekid GPS-a: razmak između uzastopnih fiksova (ne dolaska paketa — paketi kasne kad je ekran ugašen)
    if (snima.zadFixT && t - snima.zadFixT > PREKID_S * 1000) { snima.prekidi.n++; snima.prekidi.maxS = Math.max(snima.prekidi.maxS, Math.round((t - snima.zadFixT) / 1000)); }
    snima.zadFixT = t;
    // dobra tačnost ≤ 20 m; slabija (≤ 40 m) tek kad dobrih nema duže od 12 s, da u pojasu nema rupe
    const zazor = t - snima.zadT > ZAZOR_S * 1000;
    if (!(ac <= AC_DOBRA || (ac <= AC_SLABA && zazor))) return false;
    const z = snima.pts[snima.pts.length - 1];
    if (z) {
      const d = duzinaLL([z, [la, lo]]), dtS = Math.max(1, (t - snima.zadT) / 1000);
      if (d < Math.min(8, Math.max(2.5, 0.4 * ac))) return false;     // šum u mjestu
      if (d / dtS > SKOK_MS && dtS < 30) { snima.skokova++; return false; } // GPS skok (> 18 km/h pješice)
    }
    snima.pts.push([la, lo]); snima.zadT = t;
    return true;
  }
  function nativno(pts) {
    let n = 0;
    for (const q of pts) if (tackaDodaj(q.la, q.lo, Number.isFinite(q.ac) ? q.ac : 99, q.t)) n++;
    if (n) snimaPisi();
    snimaOsvjezi();
  }
  const tisina = () => (snima && snima.zadFixT ? Date.now() - snima.zadFixT : 0);
  function snimaOsvjezi() {
    if (imaKartu() && snima) {
      if (!snimaSloj) snimaSloj = L.polyline([], { pane: pane(), color: snima.boja, weight: 4, dashArray: '2 7', lineCap: 'round', interactive: false }).addTo(map);
      snimaSloj.setLatLngs(snima.pts); snimaSloj.setStyle({ color: snima.boja });
    }
    const bar = document.getElementById('doz-bar'); if (!bar) return;
    if (izbor) return;
    bar.classList.toggle('show', !!snima);
    if (!snima) return;
    const gubi = tisina() > GUBI_S * 1000;
    bar.style.setProperty('--c', snima.boja);
    bar.classList.add('rec'); bar.classList.toggle('gubi', gubi);
    bar.innerHTML = `<div class="db-top"><i></i><b>${esc(snima.ime)}</b><span>${fmtM(duzinaLL(snima.pts))}${gubi ? ' · ⚠ nema GPS' : ''}</span></div>
      <div class="db-dug"><button data-a="kraj" aria-label="Završi pojas">✓ Završi</button><button data-a="odbaci" aria-label="Odbaci pojas">✕</button></div>`;
  }
  // Svake sekunde: tačke bez native servisa (preglednik), čuvar servisa i znak gubitka signala
  function snimaTik() {
    if (!snima) return;
    const gps = typeof lastP !== 'undefined' && lastP && Number.isFinite(lastP.la) ? lastP : null;
    if (gps && !snima.nat && tackaDodaj(gps.la, gps.lo, gps.ac || 99, Date.now())) snimaPisi();
    const t = tisina(), bg = window.usfPozadina;
    if (snima.nat && t > 30000 && Date.now() - snima.restartT > 30000) {
      snima.restartT = Date.now();
      try { bg.dopuni(); } catch (e) {}
      try {
        if (typeof AndroidGps !== 'undefined' && AndroidGps.isRecording && !AndroidGps.isRecording()) { bg.zavrsi(BG_ID); bg.pocni(BG_ID, 'Doznaka stabala · ' + snima.ime, nativno); toast('⚠ GPS servis ponovo pokrenut'); }
      } catch (e) {}
    }
    if (t > 20000 && !snima.vibrirao) { snima.vibrirao = true; try { navigator.vibrate && navigator.vibrate([300, 150, 300]); } catch (e) {} }
    if (t <= GUBI_S * 1000) snima.vibrirao = false;
    snimaOsvjezi();
  }
  function snimaPocni(p, ime, boja, stari) {
    const bg = typeof window !== 'undefined' ? window.usfPozadina : null;
    if (typeof gpsOn !== 'undefined' && !gpsOn && typeof startGPS === 'function') startGPS();
    snima = { pid: p.id, ime, boja, pts: stari ? stari.pts : [], zadT: stari ? stari.zadT : Date.now(), zadFixT: stari ? stari.zadT : 0, prekidi: (stari && stari.prekidi) || { n: 0, maxS: 0 }, skokova: (stari && stari.skokova) || 0,
      restartT: Date.now(), nat: !!(bg && bg.nativno()), tik: setInterval(snimaTik, 1000) };
    if (bg) bg.pocni(BG_ID, 'Doznaka stabala · ' + ime, nativno);
    snimaPisi(); snimaOsvjezi();
    if (typeof switchMainTab === 'function') switchMainTab('karta');
    if (imaKartu() && p.ring) map.fitBounds(L.latLngBounds(p.ring).pad(0.2), { maxZoom: 18 });
  }
  function snimaGasi(zadrziKopiju) {
    if (!snima) return;
    clearInterval(snima.tik);
    const bg = window.usfPozadina; if (bg) bg.zavrsi(BG_ID);
    if (!zadrziKopiju) { try { localStorage.removeItem(KLJUC_SNIMA); } catch (e) {} }
    if (snimaSloj && imaKartu()) { map.removeLayer(snimaSloj); snimaSloj = null; }
    snima = null; snimaOsvjezi();
  }
  async function snimaKraj() {
    if (!snima) return;
    const bg = window.usfPozadina; if (bg) { try { await bg.dopuni(); } catch (e) {} }
    const s = snima, p = nadji(s.pid), d = duzinaLL(s.pts);
    snimaGasi(true); // zaštitna kopija ostaje dok pojas nije sigurno upisan
    if (!p) return;
    if (s.pts.length < 2 || d < 20) { try { localStorage.removeItem(KLJUC_SNIMA); } catch (e) {} toast('⚠ Pojas je prekratak (' + Math.round(d) + ' m) — nije sačuvan'); render(); return; }
    p.tragovi.push({ id: uid(), projektant: s.ime, boja: bojaProjektanta(p, s.ime), pts: s.pts, t: Date.now(), izvor: 'gps', prekidi: s.prekidi, skokova: s.skokova });
    p.t = Date.now();
    if (pisi()) { try { localStorage.removeItem(KLJUC_SNIMA); } catch (e) {} }
    else { p.tragovi.pop(); toast('⚠ Pojas NIJE upisan (nema mjesta) — kopija je sačuvana, oslobodi memoriju pa ponovo pokreni aplikaciju'); render(); return; }
    preracunaj(p); crtaj(); render();
    toast('✅ Pojas sačuvan · ' + fmtM(d) + (s.prekidi.n ? ' · ⚠ ' + s.prekidi.n + (s.prekidi.n === 1 ? ' prekid GPS-a' : ' prekida GPS-a') + ' (najduži ' + s.prekidi.maxS + ' s)' : ''));
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
  let izbor = null; // { naziv, lista: [{ ring, ime, sloj, bb, ha }], sel } dok se poligon odjela bira dodirom na karti
  let izbSloj = null;

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
      return `<div class="dz-trag" style="--c:${esc(t.boja)}" data-id="${esc(t.id)}"><div class="dz-t-i"><b>${esc(t.projektant)} · pojas ${i + 1}</b><small>${fmtM(duzinaLL(t.pts))} · ${t.izvor === 'kml' ? 'uvezeno' : t.izvor === 'stabla' ? 'stabla' : 'GPS'} · ${new Date(t.t).toLocaleDateString('bs')}${r ? ' · ' + fmt(r.ha, 2) + ' ha' : ''}</small></div>
        <div class="dz-t-a"><button data-a="tzoom" aria-label="Na karti">🔍</button><button data-a="tim" aria-label="Projektant">✏</button><button data-a="tsend" aria-label="Pošalji">📤</button><button data-a="tbris" aria-label="Obriši">🗑</button></div></div>`; }).join('');
    return `<section class="ng-card dz-kar">
      <div class="dz-kpi"><div><b>${fmt(p.ha, 2)} ha</b><span>površina odjela</span></div><div><b>${p.tragovi.length}</b><span>pojaseva</span></div><div><b>${pod ? fmt(pod.regije.reduce((a, r) => a + r.ha, 0), 2) + ' ha' : p._racuna ? '⏳' : '—'}</b><span>obuhvaćeno</span></div></div>
      <div class="sl-dug"><button class="zp-glavno" data-a="snimi">▶ Snimi pojas (GPS)</button></div>
      <div class="sl-dug"><button data-a="uvezi">📥 Uvezi trag (KML)</button><button data-a="posalji" ${p.tragovi.length ? '' : 'disabled'}>📤 Pošalji sve</button></div>
      <input type="file" id="doz-fajl" accept=".kml,application/vnd.google-earth.kml+xml,text/xml" hidden>
      ${red ? `<h4 class="dz-h">Projektanti</h4>${red}` : ''}
      ${tr ? `<h4 class="dz-h">Pojasevi</h4>${tr}` : ''}</section>`;
  }
  const tabHtml = () => `<div class="gf-tabs dz-tabs" role="tablist">${[['poj', '🧭', 'Pojasevi'], ['stab', '🌲', 'Stabla']].map(([k, i, t]) => `<button role="tab" data-a="tab" data-t="${k}" class="${tab === k ? 'on' : ''}"><i>${i}</i><span>${t}</span></button>`).join('')}</div>`;
  function render() {
    const e = typeof document !== 'undefined' && el(); if (!e) return;
    const st = document.getElementById('mc-stat-doznaka'); if (st) st.textContent = S.projekti.length ? String(S.projekti.length) : '';
    if (!panelOtvoren()) return;
    const lista = S.projekti.map(p => `<div class="dz-pr${p.id === S.akt ? ' akt' : ''}" data-id="${esc(p.id)}"><button class="dz-pr-i" data-a="otvori"><b>${esc(p.naziv)}</b><small>${esc(p.odjel || '')} · ${fmt(p.ha, 2)} ha · ${p.tragovi.length} ${p.tragovi.length === 1 ? 'pojas' : 'pojasa'}</small></button>
      <button data-a="zoom" aria-label="Na karti">🔍</button><button data-a="vid" aria-label="Prikaži/sakrij">${p.vis === false ? '🙈' : '👁'}</button><button data-a="bris" aria-label="Izbriši">🗑</button></div>`).join('');
    const p = aktivni();
    e.innerHTML = `<section class="ng-card dz-uvod"><h3>Doznaka stabala</h3>
      <div class="sl-dug"><button class="zp-glavno" data-a="novi">＋ Novi projekat</button></div>${lista ? `<div class="dz-lista">${lista}</div>` : ''}</section>${p ? tabHtml() + (tab === 'stab' ? stablaHtml(p) : projektHtml(p)) : ''}`;
    if (p && !p._pod && !p._racuna && p.tragovi.length) preracunaj(p);
  }

  const bbox = r => r.reduce((b, q) => [Math.min(b[0], q[0]), Math.min(b[1], q[1]), Math.max(b[2], q[0]), Math.max(b[3], q[1])], [90, 180, -90, -180]);
  function unutar(la, lo, r) {
    let in_ = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      if ((r[i][1] > lo) !== (r[j][1] > lo) && la < (r[j][0] - r[i][0]) * (lo - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) in_ = !in_;
    }
    return in_;
  }
  // Izbor odjela DODIROM NA KARTI: konture poligona u pogledu (zumirano ≥ 11), dodir bira najmanji poligon pod prstom.
  function izbCrtaj() {
    if (izbSloj && imaKartu()) { try { map.removeLayer(izbSloj); } catch (e) {} } izbSloj = null;
    if (!izbor || !imaKartu()) return;
    const g = izbSloj = L.layerGroup().addTo(map), v = map.getBounds(), rend = L.canvas({ pane: pane(), padding: 0.3 });
    const vidi = x => x.bb[2] >= v.getSouth() && x.bb[0] <= v.getNorth() && x.bb[3] >= v.getWest() && x.bb[1] <= v.getEast();
    izbor.lista.filter(x => x === izbor.sel || (map.getZoom() >= 11 && vidi(x))).slice(0, 900).forEach(x => {
      const sel = x === izbor.sel;
      L.polygon(x.ring, { pane: pane(), renderer: rend, color: sel ? '#fb7185' : '#fde68a', weight: sel ? 3 : 1.3, fillColor: '#fb7185', fillOpacity: sel ? 0.4 : 0.04, interactive: false }).addTo(g);
    });
  }
  function izbBar() {
    const bar = document.getElementById('doz-bar'); if (!bar) return;
    bar.classList.toggle('show', !!izbor || !!snima);
    if (!izbor) return;
    const s = izbor.sel;
    bar.style.setProperty('--c', '#fb7185'); bar.classList.remove('rec');
    bar.innerHTML = `<div class="db-top"><b>🗺 Dodirni odjel na karti</b><span>${esc(izbor.naziv)}</span></div>
      <div class="db-izb"${s ? '' : ' hidden'}>${s ? `<b>${esc(s.ime)}</b> · ${fmt(s.ha, 2)} ha <small>${esc(s.sloj)}</small>` : ''}</div>
      <div class="db-dug"><button data-a="izb-ok" ${s ? '' : 'disabled'}>✓ Napravi projekat</button><button data-a="izb-x">✕ Odustani</button></div>`;
  }
  function izbKlik(e) {
    if (!izbor) return;
    let naj = null;
    izbor.lista.forEach(x => { if (e.latlng.lat >= x.bb[0] && e.latlng.lat <= x.bb[2] && e.latlng.lng >= x.bb[1] && e.latlng.lng <= x.bb[3] && unutar(e.latlng.lat, e.latlng.lng, x.ring) && (!naj || x.ha < naj.ha)) naj = x; });
    if (!naj) return;
    izbor.sel = naj; izbCrtaj(); izbBar();
  }
  function izbKraj() {
    if (!izbor) return;
    izbor = null; window._npHvataKlik = false;
    if (imaKartu()) { map.off('click', izbKlik); map.off('moveend', izbCrtaj); }
    izbCrtaj(); izbBar(); render();
  }
  async function novi() {
    if (snima) { toast('⏺ Prvo završi snimanje pojasa'); return; }
    const v = typeof _dlgPrompt === 'function' ? await _dlgPrompt('Naziv projekta doznake', 'Doznaka ' + (S.projekti.length + 1), { title: '🌲 Novi projekat', okLabel: 'Dalje' }) : prompt('Naziv projekta', 'Doznaka');
    if (v == null || !String(v).trim()) return;
    const lista = izvoriPoligona().map(o => ({ ...o, bb: bbox(o.ring), ha: povrsinaLL(o.ring) / 10000 }));
    if (!lista.length) { toast('⚠ Nema poligona — učitaj sloj „Granice taksacije” (Karte → Server) ili svoj KML'); return; }
    izbor = { naziv: String(v).trim(), lista, sel: null };
    window._npHvataKlik = true; map.on('click', izbKlik); map.on('moveend', izbCrtaj);
    if (typeof switchMainTab === 'function') switchMainTab('karta');
    if (typeof map.closePopup === 'function') map.closePopup();
    if (map.getZoom() < 11) { try { map.fitBounds(L.latLngBounds(lista.flatMap(x => x.ring)), { padding: [30, 30], maxZoom: 12 }); } catch (e) {} if (map.getZoom() < 11) map.setZoom(11); }
    izbCrtaj(); izbBar();
  }
  function izbGotovo() {
    const o = izbor && izbor.sel; if (!o) return;
    const naziv = izbor.naziv;
    izbKraj();
    const p = { id: uid(), naziv, odjel: o.ime, ring: o.ring, ha: o.ha, vis: true, projektanti: {}, tragovi: [], t: Date.now() };
    S.projekti.unshift(p); S.akt = p.id; pisi(); crtaj(); render(); zoom(p.id); _otvoriPanel();
    toast('🌲 Projekat „' + p.naziv + '” · ' + fmt(p.ha, 2) + ' ha');
  }
  function zoom(id) { const p = nadji(id); if (p && p.ring && imaKartu()) { if (typeof switchMainTab === 'function') switchMainTab('karta'); map.fitBounds(L.latLngBounds(p.ring).pad(0.15), { maxZoom: 18 }); } }
    const zadnjiProjektant = () => (window.USFKorisnik ? USFKorisnik.ime() : '');
  async function pitajProjektanta(naslov, zad) {
    const v = typeof _dlgPrompt === 'function' ? await _dlgPrompt('Ime projektanta', zad || zadnjiProjektant(), { title: naslov, okLabel: 'Spremi' }) : prompt('Projektant', zad || '');
    const ime = v == null ? '' : String(v).trim().slice(0, 40);
    return ime || null;
  }
  // Pojas nosi ime korisnika aplikacije (Postavke → Korisnik aplikacije); bez imena snimanje ne počinje
  async function snimi() {
    const p = aktivni(); if (!p || snima) { if (snima) toast('⏺ Snimanje pojasa je već u toku'); return; }
    let ime = window.USFKorisnik ? USFKorisnik.ime() : '';
    if (!ime) {
      const v = typeof _dlgPrompt === 'function' ? await _dlgPrompt('Prvo upiši ko si ti — pojas doznake nosi tvoje ime i ide uz trag kad ga pošalješ. Ime se čuva u Postavkama (Korisnik aplikacije).', '', { title: '⚠ Ime korisnika nije uneseno', okLabel: 'Spremi i snimaj' }) : prompt('Ime korisnika', '');
      if (!v || !String(v).trim() || !window.USFKorisnik || !USFKorisnik.postavi(v)) { toast('⚠ Bez imena korisnika nema snimanja pojasa'); return; }
      ime = USFKorisnik.ime();
    }
    snimaPocni(p, ime, bojaProjektanta(p, ime)); pisi();
  }
  async function izKml(doc, force) {
    const lin = linijeIzKml(doc), oznaceno = lin.filter(l => l.meta);
    if (!lin.length || (!force && !oznaceno.length)) return false;
    const p = aktivni();
    if (!p) { if (!force) { toast('ℹ KML je trag doznake — prvo napravi projekat u Doznaci stabala'); } else toast('⚠ Prvo napravi projekat'); return !force ? false : true; }
    const sug = (oznaceno[0] && oznaceno[0].meta.projektant) || zadnjiProjektant() || '';
    if (!force && typeof _dlgConfirm === 'function' && !await _dlgConfirm('Trag doznake (' + lin.length + (lin.length === 1 ? ' pojas' : ' pojasa') + ') uvesti u projekat „' + p.naziv + '”?\n\nOdustani = običan KML sloj.', { title: '🌲 Doznaka stabala', okLabel: 'Uvezi' })) return false;
    const ime = await pitajProjektanta('📥 Projektant tog traga', sug); if (!ime) return true;
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
    if (a === 'tab') { tab = cvor.dataset.t; return render(); }
    if (a === 'stuvezi') { const f = document.getElementById('doz-stabla-fajl'); if (f) f.click(); return; }
    if (a === 'prag') { p.stabPrag = +cvor.dataset.v; pisi(); if (p.pojasi && p.pojasi.length) return stablaPojas(p); return render(); }
    if (a === 'pojas') return stablaPojas(p);
    if (a === 'stvid') { p.stabVid = p.stabVid === false; pisi(); crtaj(); return render(); }
    if (a === 'stbr') { p.stabBr = p.stabBr === false; pisi(); stablaOznake(); return render(); }
    if (a === 'stilot') { stilOtv = !stilOtv; return render(); }
    if (a === 'stil') { const k = cvor.dataset.k, v = cvor.dataset.v; p.stil = { ...(p.stil || {}), [k]: (k === 'w' || k === 'op') ? +v : v }; pisi(); crtaj(); return render(); }
    if (a === 'bime' || a === 'bgr') {
      const i = +((cvor.closest('.dz-bl') || {}).dataset || {}).i, b = (p.stabBl || [])[i]; if (!b) return;
      if (a === 'bime') {
        const ime = await pitajProjektanta('✏ Inženjer · br. ' + b.od + '–' + b.do, b.ime); if (!ime || ime === b.ime) return;
        b.ime = ime; bojaProjektanta(p, ime);
        (p.pojasi || []).forEach(q => { if (q.sig === b.od + '-' + b.do) q.r = ime; });
        pisi(); crtaj(); return render();
      }
      const sl = p.stabBl[i + 1];
      const v = typeof _dlgPrompt === 'function' ? await _dlgPrompt('Zadnji broj ovog bloka (sljedeći blok počinje iza njega)', String(b.do), { title: '✂ Granica bloka ' + b.od + '–' + b.do, inputType: 'number', okLabel: 'Spremi' }) : prompt('Zadnji broj bloka', String(b.do));
      const n = parseInt(v, 10); if (!Number.isFinite(n)) return;
      if (n < b.od || (sl && n >= sl.do)) { toast('⚠ Broj mora biti između ' + b.od + ' i ' + (sl ? sl.do - 1 : '…')); return; }
      b.do = n; if (sl) sl.od = n + 1;
      return stablaPojas(p);
    }
    if (a === 'prime') {
      const stari = cvor.dataset.ime, ime = await pitajProjektanta('✏ Projektant', stari); if (!ime || ime === stari) return;
      p.projektanti = p.projektanti || {}; p.projektanti[ime] = p.projektanti[ime] || p.projektanti[stari] || bojaProjektanta(p, ime); delete p.projektanti[stari];
      (p.pojasi || []).forEach(q => { if (q.r === stari) { q.r = ime; if (q.sig) { p.prIme = p.prIme || {}; p.prIme[q.sig] = ime; } } });
      p.tragovi.forEach(t => { if (t.izvor === 'stabla' && t.projektant === stari) { t.projektant = ime; t.boja = p.projektanti[ime]; } });
      p._pot = null; p._pod = null; pisi(); preracunaj(p); crtaj(); return render();
    }
    if (a === 'stukloni') {
      if (typeof _dlgConfirm === 'function' && !await _dlgConfirm('Ukloniti sva uvezena stabla i pojase od njih (' + (p.stabla || []).length + ' stabala)?', { title: 'Ukloni stabla', danger: true, okLabel: 'Ukloni' })) return;
      p.stabla = []; p.pojasi = []; p.pojUsam = 0; pisi(); crtaj(); return render();
    }
    if (a === 'pzoom' || a === 'pdodaj') {
      const q = (p.pojasi || [])[+((cvor.closest('.dz-poj') || {}).dataset || {}).i]; if (!q) return;
      if (a === 'pzoom') { if (imaKartu()) { switchMainTab('karta'); map.fitBounds(L.latLngBounds(q.ids.map(i => [p.stabla[i].la, p.stabla[i].lo])).pad(0.3), { maxZoom: 19 }); } return; }
      if (await pojasUProjekt(p, q)) { p._pot = null; p._pod = null; pisi(); preracunaj(p); crtaj(); render(); toast('➕ Pojas dodan u projekat'); }
      return;
    }
    if (a === 'pdodajsve') {
      let n = 0; for (const q of (p.pojasi || [])) { if (q.dodan) continue; if (await pojasUProjekt(p, q)) n++; else break; }
      if (n) { p._pot = null; p._pod = null; pisi(); preracunaj(p); crtaj(); render(); toast('➕ Dodano pojaseva: ' + n); }
      return;
    }
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
    tijelo.addEventListener('change', async e => {
      if (e.target.id === 'doz-blok') { const p = aktivni(), v = Math.round(+e.target.value); if (p && v > 0) { p.stabBlok = v; p.stabBl = null; stablaPojas(p); } return; }
      if ((e.target.id !== 'doz-fajl' && e.target.id !== 'doz-stabla-fajl') || !e.target.files[0]) return;
      const f = e.target.files[0], stabla = e.target.id === 'doz-stabla-fajl'; e.target.value = '';
      if (stabla) { try { await stablaUvezi(f); } catch (er) { toast('⚠ KML nije učitan: ' + er.message); } return; }
      try { const doc = typeof _kmlParseDoc === 'function' ? _kmlParseDoc(await f.text()) : new DOMParser().parseFromString(await f.text(), 'text/xml'); if (!await izKml(doc, true)) toast('⚠ U KML-u nema linija (traga)'); }
      catch (er) { toast('⚠ KML nije učitan: ' + er.message); }
    });
    const bar = document.createElement('div'); bar.id = 'doz-bar'; bar.setAttribute('role', 'status'); document.body.appendChild(bar);
    bar.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (!b) return; if (b.disabled) return; const a = b.dataset.a; if (a === 'kraj') snimaKraj(); else if (a === 'odbaci') snimaOdbaci(); else if (a === 'izb-ok') izbGotovo(); else if (a === 'izb-x') izbKraj(); });
  }
  function nastavi() { // snimanje prekinuto ubijanjem aplikacije: nastavi s onim što je sačuvano
    let z; try { z = JSON.parse(localStorage.getItem(KLJUC_SNIMA) || 'null'); } catch (e) { z = null; }
    const p = z && nadji(z.pid); if (!p || !Array.isArray(z.pts)) { try { localStorage.removeItem(KLJUC_SNIMA); } catch (e) {} return; }
    snimaPocni(p, z.ime, z.boja, z); toast('⏺ Nastavljeno snimanje pojasa · ' + z.ime);
  }
  function init() {
    if (typeof document === 'undefined' || typeof map === 'undefined') return;
    veze(); crtaj(); render();
    map.on('moveend zoomend', stablaOznake);
    S.projekti.forEach(p => { if (p.tragovi.length > 1) preracunaj(p); });
    const spremi = () => { if (snima) snimaPisi(); };
    document.addEventListener('visibilitychange', () => { if (document.hidden) spremi(); });
    window.addEventListener('pagehide', spremi);
    setTimeout(nastavi, 1500);
  }

  if (typeof window !== 'undefined') {
    window.USFDoz = { otvori() { _otvoriPanel(); }, izKml, osvjezi: () => { crtaj(); render(); }, geo: { podijeli, ravan, povrsinaLL, duzinaLL, uzorak } };
    if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init(); }
  }
  if (typeof module !== 'undefined') module.exports = { _tackaDodaj: tackaDodaj, _postaviSnimanje: v => { snima = v; }, ravan, uzorak, podijeli, povrsinaLL, duzinaLL, kmlTragovi, linijeIzKml, bojaKml, PALETA };
})();
