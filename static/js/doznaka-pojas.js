// Doznaka — pojasevi (v1.4.0): čista geometrija bez mape. GPS trag → segmenti → pojas = bafer širine R sa svake strane,
// presječen granicom odjela; susjedni pojasevi se ne preklapaju (granica je na pola razmaka između tragova);
// pokrivenost je UNIJA pojaseva (isti dio pređen dvaput se ne računa dvaput), preklop se prikazuje posebno.
// Sve se računa u lokalnoj ravni u metrima (equirectangular oko prve tačke granice odjela), tek rezultat ide nazad u [lat, lon].
(function (W) {
  'use strict';
  const RZ = 6371008.8, rad = x => x * Math.PI / 180;
  const R_ZADANO = 20;        // m po strani (ukupna širina pojasa 2R)
  const GAP_MS = 5 * 60 * 1000; // razmak veći od 5 min = novi prolaz
  const BLIZU = 4;            // m: tuđi trag bliži od toga je isti koridor (presjek / ponovljen prolaz) — ne skraćuje pojas
  const W_MIN = 2;            // m: najuži pojas uz susjeda
  const KORAK = 15;           // m: najveći razmak tjemena pojasa (širina se mijenja po tjemenima)
  const T = () => (typeof turf !== 'undefined' ? turf : null);

  function ravan(la0, lo0) {
    const ky = RZ * rad(1), kx = ky * Math.cos(rad(la0));
    return { fw: q => [(q[1] - lo0) * kx, (q[0] - la0) * ky], bw: p => [la0 + p[1] / ky, lo0 + p[0] / kx] };
  }
  const zatvori = r => (r.length && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1]) ? r.concat([r[0]]) : r);
  function povrsinaXY(r) { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; }
  const prstenovi = f => (!f ? [] : f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : []);
  const haF = f => prstenovi(f).reduce((a, rs) => a + povrsinaXY(rs[0]) - rs.slice(1).reduce((b, h) => b + povrsinaXY(h), 0), 0) / 10000;
  function dSeg(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    let u = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0; u = Math.max(0, Math.min(1, u));
    return Math.hypot(p[0] - (a[0] + u * dx), p[1] - (a[1] + u * dy));
  }
  function unija(lista) {
    const t = T();
    lista = lista.filter(Boolean);
    while (lista.length > 1) {
      const n = [];
      for (let i = 0; i < lista.length; i += 2) {
        if (i + 1 >= lista.length) { n.push(lista[i]); continue; }
        let u = null; try { u = t.union(lista[i], lista[i + 1]); } catch (e) { u = null; }
        n.push(u || lista[i]);
      }
      lista = n;
    }
    return lista[0] || null;
  }

  // ── Segmentacija traga ──
  // tacke [{ la, lo, t }]; pauze [{ s, e|null }] (vrijeme pauze, e = null dok traje). Tačke iz pauze se odbacuju PO VREMENU TAČKE
  // (ne po trenutnom stanju prekidača — native bafer stiže kasnije); razmak > 5 min ili pauza između tačaka počinje novi segment.
  function segmentiraj(tacke, pauze, gapMs) {
    pauze = pauze || []; gapMs = gapMs || GAP_MS;
    const uPauzi = t => pauze.some(p => t >= p.s && (p.e == null || t <= p.e));
    const l = (tacke || []).filter(x => x && Number.isFinite(x.la) && Number.isFinite(x.lo) && Number.isFinite(x.t) && !uPauzi(x.t)).sort((a, b) => a.t - b.t);
    const out = []; let tek = [];
    const zatvoriSeg = () => { if (tek.length >= 2) out.push({ pts: tek.map(x => [x.la, x.lo]), od: tek[0].t, do: tek[tek.length - 1].t }); tek = []; };
    for (let i = 0; i < l.length; i++) {
      if (tek.length) {
        const a = l[i - 1], b = l[i];
        const pauzaIzmedju = pauze.some(p => p.s < b.t && (p.e == null || p.e > a.t));
        if (b.t - a.t > gapMs || pauzaIzmedju) zatvoriSeg();
      }
      tek.push(l[i]);
    }
    zatvoriSeg();
    return out;
  }

  // ── Pojednostavljenje i zgušnjavanje polilinije (metri) ──
  function dp(l, tol) {
    if (l.length < 3) return l.slice();
    let md = 0, mi = 0;
    for (let i = 1; i < l.length - 1; i++) { const d = dSeg(l[i], l[0], l[l.length - 1]); if (d > md) { md = d; mi = i; } }
    if (md <= tol) return [l[0], l[l.length - 1]];
    return dp(l.slice(0, mi + 1), tol).slice(0, -1).concat(dp(l.slice(mi), tol));
  }
  function zgusni(l, korak) {
    const out = [l[0]];
    for (let i = 1; i < l.length; i++) {
      const a = l[i - 1], b = l[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(d / korak);
      for (let k = 1; k < n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
      out.push(b);
    }
    return out;
  }

  // Pojas jednog traga: promjenljiva širina w_i = min(R, razmak do najbližeg TUĐEG traga / 2) po tjemenima; trapezi između tjemena +
  // krugovi na krajevima i oštrim skretanjima, pa unija. → { f (Feature u metrima), spojen }
  function bandXY(v, drugi, R) {
    const t = T();
    let spojen = false;
    let w = v.map(q => {
      let d = Infinity;
      for (const s of drugi) { const dd = dSeg(q, s[0], s[1]); if (dd >= BLIZU && dd < d) d = dd; }
      const x = Math.min(R, Math.max(W_MIN, d / 2));
      if (x < R - 0.5) spojen = true;
      return x;
    });
    if (w.length > 2) w = w.map((x, i) => (i === 0 || i === w.length - 1 ? x : (w[i - 1] + 2 * x + w[i + 1]) / 4)); // zaglađivanje
    const poli = [];
    const krug = (c, r) => { const k = []; for (let i = 0; i < 12; i++) k.push([c[0] + r * Math.cos(i * Math.PI / 6), c[1] + r * Math.sin(i * Math.PI / 6)]); k.push(k[0]); return t.polygon([k]); };
    let prevD = null;
    for (let i = 0; i + 1 < v.length; i++) {
      const a = v[i], b = v[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy);
      if (d < 0.05) continue;
      const nx = -dy / d, ny = dx / d;
      poli.push(t.polygon([[[a[0] + nx * w[i], a[1] + ny * w[i]], [b[0] + nx * w[i + 1], b[1] + ny * w[i + 1]], [b[0] - nx * w[i + 1], b[1] - ny * w[i + 1]], [a[0] - nx * w[i], a[1] - ny * w[i]], [a[0] + nx * w[i], a[1] + ny * w[i]]]]));
      const ugao = prevD ? Math.abs(Math.atan2(prevD[0] * dy / d - prevD[1] * dx / d, prevD[0] * dx / d + prevD[1] * dy / d)) : 99;
      if (i === 0 || ugao > 0.14) poli.push(krug(a, w[i]));
      prevD = [dx / d, dy / d];
    }
    poli.push(krug(v[v.length - 1], w[w.length - 1]));
    return { f: unija(poli), spojen };
  }

  // tragovi [{ id, projektant, boja, pts: [[la, lo]], t, od, do }]; ring [[la, lo]] = granica odjela; R = m po strani
  // → { pojasi: [{ id, projektant, boja, t, od, do, ha, spojen, poligoni }], ukupnoHa, zbirHa, preklopHa, poKorisniku: {ime: ha}, odjelHa }
  function pojasevi(ring, tragovi, R) {
    const t = T(); R = R > 0 ? R : R_ZADANO;
    const prazno = { pojasi: [], ukupnoHa: 0, zbirHa: 0, preklopHa: 0, poKorisniku: {}, odjelHa: 0 };
    if (!t || !ring || ring.length < 3) return prazno;
    const P = ravan(ring[0][0], ring[0][1]), polXY = zatvori(ring.map(P.fw)), odjelF = t.polygon([polXY]), odjelHa = povrsinaXY(polXY) / 10000;
    const valj = (tragovi || []).filter(x => x && x.pts && x.pts.length >= 2).map(x => ({ x, xy: dp(x.pts.map(P.fw), 1.2) })).filter(v => v.xy.length >= 2);
    const segs = valj.map(v => { const s = []; for (let i = 0; i + 1 < v.xy.length; i++) s.push([v.xy[i], v.xy[i + 1]]); return s; });
    const bb = valj.map(v => { const xs = v.xy.map(q => q[0]), ys = v.xy.map(q => q[1]); return [Math.min(...xs) - 2 * R, Math.min(...ys) - 2 * R, Math.max(...xs) + 2 * R, Math.max(...ys) + 2 * R]; });
    const pojasi = [], fs = [];
    valj.forEach((v, k) => {
      const drugi = [];
      valj.forEach((o, j) => { if (j !== k && !(bb[j][2] < bb[k][0] || bb[j][0] > bb[k][2] || bb[j][3] < bb[k][1] || bb[j][1] > bb[k][3])) segs[j].forEach(s => drugi.push(s)); });
      let b; try { b = bandXY(zgusni(v.xy, KORAK), drugi, R); } catch (e) { b = null; }
      if (!b || !b.f) return;
      let f = null; try { f = t.intersect(b.f, odjelF); } catch (e) { f = null; }
      if (!f) return;
      const ha = haF(f), o = v.x;
      fs.push({ f, ime: o.projektant, ha });
      pojasi.push({ id: o.id, projektant: o.projektant, boja: o.boja, t: o.t, od: o.od, do: o.do, ha, spojen: b.spojen, poligoni: prstenovi(f).map(rs => rs.map(r => r.map(P.bw))) });
    });
    const ukupno = fs.length ? haF(unija(fs.map(x => x.f))) : 0, zbir = fs.reduce((a, x) => a + x.ha, 0);
    const poKorisniku = {};
    [...new Set(fs.map(x => x.ime))].forEach(ime => { const l = fs.filter(x => x.ime === ime); poKorisniku[ime] = haF(unija(l.map(x => x.f))); });
    return { pojasi, ukupnoHa: ukupno, zbirHa: zbir, preklopHa: Math.max(0, zbir - ukupno), poKorisniku, odjelHa };
  }

  // Upozorenje „prelaziš u tuđi pojas”: udaljenosti (m) tačke do najbližeg tuđeg i najbližeg vlastitog traga
  // → { dTudji, imeTudji, dVlastiti } (Infinity ako nema)
  function tudjiPojas(la, lo, tragovi, ime) {
    const P = ravan(la, lo), q = [0, 0];
    let dT = Infinity, imeT = null, dV = Infinity;
    (tragovi || []).forEach(x => {
      if (!x || !x.pts || x.pts.length < 2) return;
      const xy = x.pts.map(P.fw); let d = Infinity;
      for (let i = 0; i + 1 < xy.length; i++) d = Math.min(d, dSeg(q, xy[i], xy[i + 1]));
      if (x.projektant === ime) dV = Math.min(dV, d); else if (d < dT) { dT = d; imeT = x.projektant; }
    });
    return { dTudji: dT, imeTudji: imeT, dVlastiti: dV };
  }
  // Tri uzastopna pogotka (tuđi bliži od vlastitog i bliže od 25 m) → upozori; jedan loš fiks ne okida upozorenje
  const TUDJI_M = 25, TUDJI_N = 3;
  function tudjiOdluka(stanje, r, sad) {
    const pogodak = r.dTudji < TUDJI_M && r.dTudji < r.dVlastiti;
    stanje.n = pogodak ? (stanje.n || 0) + 1 : 0;
    if (stanje.n >= TUDJI_N && (!stanje.zadnje || sad - stanje.zadnje > 15000)) { stanje.zadnje = sad; return true; }
    return false;
  }

  const API = { segmentiraj, pojasevi, tudjiPojas, tudjiOdluka, ravan, R_ZADANO, GAP_MS };
  W.USFDozPojas = API;
  if (typeof module !== 'undefined') module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
