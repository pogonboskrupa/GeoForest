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
    // Mreža ćelija 2R: udaljenost do susjeda važi samo do 2R (dalje je širina R), pa se testiraju segmenti iz susjednih ćelija
    const C = 2 * R, grid = new Map(), kljuc = (i, j) => i * 100003 + j;
    for (const sg of drugi) {
      const i0 = Math.floor(Math.min(sg[0][0], sg[1][0]) / C), i1 = Math.floor(Math.max(sg[0][0], sg[1][0]) / C);
      const j0 = Math.floor(Math.min(sg[0][1], sg[1][1]) / C), j1 = Math.floor(Math.max(sg[0][1], sg[1][1]) / C);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = kljuc(i, j); let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(sg); }
    }
    let w = v.map(q => {
      let d = Infinity;
      if (grid.size) {
        const ci = Math.floor(q[0] / C), cj = Math.floor(q[1] / C);
        for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
          const l = grid.get(kljuc(i, j)); if (!l) continue;
          for (const sg of l) { const dd = dSeg(q, sg[0], sg[1]); if (dd >= BLIZU && dd < d) d = dd; }
        }
      }
      const x = Math.min(R, Math.max(W_MIN, d / 2));
      if (x < R - 0.5) spojen = true;
      return x;
    });
    if (w.length > 2) w = w.map((x, i) => (i === 0 || i === w.length - 1 ? x : (w[i - 1] + 2 * x + w[i + 1]) / 4)); // zaglađivanje
    const poli = [];
    const krug = (c, r) => { const k = []; for (let i = 0; i < 12; i++) k.push([c[0] + r * Math.cos(i * Math.PI / 6), c[1] + r * Math.sin(i * Math.PI / 6)]); k.push(k[0]); return t.polygon([k]); };
    // Tjemena bez nula-dužina; glatki dijelovi (zaokret mali u odnosu na dužinu susjednih segmenata i širinu) čine JEDAN poligon
    // (lijevi lanac + desni lanac unazad, spoj po simetrali), oštri zaokreti prekidaju trakt i dobijaju krug.
    const tj = [], ww = [];
    v.forEach((q, i) => { const z = tj[tj.length - 1]; if (!z || Math.hypot(q[0] - z[0], q[1] - z[1]) >= 0.05) { tj.push(q); ww.push(w[i]); } });
    const n = tj.length, dir = [], dl = [];
    for (let i = 0; i + 1 < n; i++) { const dx = tj[i + 1][0] - tj[i][0], dy = tj[i + 1][1] - tj[i][1], d = Math.hypot(dx, dy); dir.push([dx / d, dy / d]); dl.push(d); }
    let lijevo = [], desno = [];
    const zatvoriTrakt = () => {
      if (lijevo.length >= 2) {
        const r = lijevo.concat(desno.slice().reverse()); r.push(r[0]);
        try { poli.push(t.polygon([r])); } catch (e) { /* degenerisan trakt */ }
      }
      lijevo = []; desno = [];
    };
    const tacka = (i, nx, ny, k) => { lijevo.push([tj[i][0] + nx * ww[i] * k, tj[i][1] + ny * ww[i] * k]); desno.push([tj[i][0] - nx * ww[i] * k, tj[i][1] - ny * ww[i] * k]); };
    for (let i = 0; i < n; i++) {
      if (i === 0) { const d = dir[0]; tacka(0, -d[1], d[0], 1); poli.push(krug(tj[0], ww[0])); continue; }
      if (i === n - 1) { const d = dir[n - 2]; tacka(i, -d[1], d[0], 1); zatvoriTrakt(); poli.push(krug(tj[i], ww[i])); break; }
      const d0 = dir[i - 1], d1 = dir[i], cos = d0[0] * d1[0] + d0[1] * d1[1], ugao = Math.acos(Math.max(-1, Math.min(1, cos)));
      const izvlaci = ww[i] * Math.tan(ugao / 2) > 0.5 * Math.min(dl[i - 1], dl[i]) || ugao > 0.3;
      if (izvlaci) { // oštar zaokret: završi trakt ravnim krajem, krug u tjemenu, novi trakt iz sljedećeg segmenta
        tacka(i, -d0[1], d0[0], 1); zatvoriTrakt(); poli.push(krug(tj[i], ww[i])); tacka(i, -d1[1], d1[0], 1);
      } else { // simetrala: normala srednjeg smjera, produžena 1/cos(ugao/2)
        let mx = d0[0] + d1[0], my = d0[1] + d1[1]; const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml;
        tacka(i, -my, mx, 1 / Math.max(0.5, Math.cos(ugao / 2)));
      }
    }
    return { f: unija(poli), spojen };
  }

  // tragovi [{ id, projektant, boja, pts: [[la, lo]], t, od, do }]; ring [[la, lo]] = granica odjela; R = m po strani
  // → { pojasi: [{ id, projektant, boja, t, od, do, ha, spojen, poligoni }], ukupnoHa, zbirHa, preklopHa, poKorisniku: {ime: ha}, odjelHa }
  // Jezgro kao generator: yield između koraka (po tragu i po krugu unije) — async verzija popušta UI niti, sinhrona ga samo odvrti.
  // kes (opciono, objekat): pojas pojedinog traga se pamti po potpisu (tačke, R, susjedni tragovi) pa dodavanje/brisanje jednog traga
  // ne računa ponovo ostale.
  const potpis = (x, ring) => x.id + '|' + x.pts.length + '|' + x.pts[0] + '|' + x.pts[x.pts.length >> 1] + '|' + x.pts[x.pts.length - 1] + '|' + ring.length + '|' + ring[0];
  function* jezgro(ring, tragovi, R, kes) {
    const t = T(); R = R > 0 ? R : R_ZADANO;
    const prazno = { pojasi: [], ukupnoHa: 0, zbirHa: 0, preklopHa: 0, poKorisniku: {}, odjelHa: 0 };
    if (!t || !ring || ring.length < 3) return prazno;
    const P = ravan(ring[0][0], ring[0][1]), polXY = zatvori(ring.map(P.fw)), odjelF = t.polygon([polXY]), odjelHa = povrsinaXY(polXY) / 10000;
    const valj = (tragovi || []).filter(x => x && x.pts && x.pts.length >= 2).map(x => ({ x, xy: dp(x.pts.map(P.fw), 1.2) })).filter(v => v.xy.length >= 2);
    const segs = valj.map(v => { const s = []; for (let i = 0; i + 1 < v.xy.length; i++) s.push([v.xy[i], v.xy[i + 1]]); return s; });
    const bb = valj.map(v => { const xs = v.xy.map(q => q[0]), ys = v.xy.map(q => q[1]); return [Math.min(...xs) - 2 * R, Math.min(...ys) - 2 * R, Math.max(...xs) + 2 * R, Math.max(...ys) + 2 * R]; });
    const sig = valj.map(v => potpis(v.x, ring));
    const pojasi = [], fs = [], novi = {};
    for (let k = 0; k < valj.length; k++) {
      const v = valj[k], susjedi = [];
      valj.forEach((o, j) => { if (j !== k && !(bb[j][2] < bb[k][0] || bb[j][0] > bb[k][2] || bb[j][3] < bb[k][1] || bb[j][1] > bb[k][3])) susjedi.push(j); });
      const kk = sig[k] + '#' + R + '#' + susjedi.map(j => sig[j]).sort().join(',');
      let r = kes && kes[kk];
      if (!r) {
        const drugi = []; susjedi.forEach(j => segs[j].forEach(sg => drugi.push(sg)));
        let b; try { b = bandXY(zgusni(v.xy, KORAK), drugi, R); } catch (e) { b = null; }
        let f = null;
        if (b && b.f) { try { f = t.intersect(b.f, odjelF); } catch (e) { f = null; } }
        r = f ? { f, ha: haF(f), spojen: b.spojen, poligoni: prstenovi(f).map(rs => rs.map(q => q.map(P.bw))) } : { f: null };
        yield;
      }
      novi[kk] = r;
      if (!r.f) continue;
      const o = v.x;
      fs.push({ f: r.f, ime: o.projektant, ha: r.ha });
      pojasi.push({ id: o.id, projektant: o.projektant, boja: o.boja, t: o.t, od: o.od, do: o.do, ha: r.ha, spojen: r.spojen, poligoni: r.poligoni });
    }
    if (kes) { Object.keys(kes).forEach(x => delete kes[x]); Object.assign(kes, novi); }
    const ukupno = fs.length ? haF(yield* unijaGen(fs.map(x => x.f))) : 0, zbir = fs.reduce((a, x) => a + x.ha, 0);
    const poKorisniku = {};
    for (const ime of new Set(fs.map(x => x.ime))) poKorisniku[ime] = haF(yield* unijaGen(fs.filter(x => x.ime === ime).map(x => x.f)));
    return { pojasi, ukupnoHa: ukupno, zbirHa: zbir, preklopHa: Math.max(0, zbir - ukupno), poKorisniku, odjelHa };
  }
  function* unijaGen(lista) {
    const t = T(); lista = lista.filter(Boolean);
    while (lista.length > 1) {
      const n = [];
      for (let i = 0; i < lista.length; i += 2) {
        if (i + 1 >= lista.length) { n.push(lista[i]); continue; }
        let u = null; try { u = t.union(lista[i], lista[i + 1]); } catch (e) { u = null; }
        n.push(u || lista[i]); yield;
      }
      lista = n;
    }
    return lista[0] || null;
  }
  function pojasevi(ring, tragovi, R, kes) { const g = jezgro(ring, tragovi, R, kes); for (;;) { const s = g.next(); if (s.done) return s.value; } }
  // Async: obračun u komadima od ~25 ms, između komada se vraća UI niti (mapa i dodir ostaju odzivni); otkazi() → null
  function pojaseviAsync(ring, tragovi, R, kes, otkazi) {
    return new Promise((res, rej) => {
      const g = jezgro(ring, tragovi, R, kes);
      const korak = () => {
        try {
          const t0 = Date.now();
          for (;;) {
            if (otkazi && otkazi()) return res(null);
            const s = g.next(); if (s.done) return res(s.value);
            if (Date.now() - t0 > 25) return setTimeout(korak, 0);
          }
        } catch (e) { rej(e); }
      };
      korak();
    });
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

  const API = { segmentiraj, pojasevi, pojaseviAsync, tudjiPojas, tudjiOdluka, ravan, R_ZADANO, GAP_MS };
  W.USFDozPojas = API;
  if (typeof module !== 'undefined') module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
