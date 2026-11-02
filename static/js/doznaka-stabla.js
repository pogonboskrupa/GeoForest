// Doznaka stabala — uvoz doznačenih stabala (KML tačke s brojevima) i povezivanje brojeva u POJASEVE.
// Stabla stižu iz jednog ili više fajlova: u odjelu radi više radnika i u različitim danima, pa se brojevi PREPLIĆU —
// zato se pojas ne pravi jednostavnim redom brojeva, nego po (radnik, dan) kad fajl to nosi, a inače po prostornom
// lancu: svako sljedeće stablo se veže za najbliži otvoreni pojas (do praga, zadano 50 m, uz prednost pravcu kretanja).
// Gdje je razmak veći od praga pojas se PREKIDA i počinje novi.
(function (root) {
  'use strict';
  const RE_RADNIK = /(radnik|projektant|doznac|doznač|korisnik|autor|user|ekipa|worker|owner)/i;
  const RE_DAN = /(datum|^dan$|date|vrijeme|time|when)/i;
  const RE_BROJ = /^(br|broj|num|number|no|redni|rb|stablo|oznaka|id)$/i;
  const PRAG_ZAD = 50, MAX_BROJ = 60;

  // ── geometrija (lokalna ravan u metrima) ──
  const RZ = 6371008.8, rad = x => x * Math.PI / 180;
  function ravan(la0, lo0) { const ky = RZ * rad(1), kx = ky * Math.cos(rad(la0)); return { fw: q => [(q[1] - lo0) * kx, (q[0] - la0) * ky] }; }
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  // ── brojevi i datumi ──
  // Broj stabla = ZADNJI niz cifara u nazivu („Stablo 12” → 12, „O7-45” → 45)
  function brojIzNaziva(s) { const m = String(s == null ? '' : s).match(/(\d+)(?!.*\d)/); return m ? Number(m[1]) : null; }
  function danIz(s) {
    s = String(s || '').trim();
    let m = s.match(/(\d{4})-(\d{2})-(\d{2})/); if (m) return m[1] + '-' + m[2] + '-' + m[3];
    m = s.match(/(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})/); if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
    return '';
  }
  const txt = el => (el && el.textContent ? el.textContent.trim() : '');

  // KML dokument → [{ n, t, la, lo, r, d }]  (n = broj, t = natpis, r = radnik/grupa, d = dan YYYY-MM-DD)
  function izKml(doc) {
    const out = [], folderi = new Set();
    for (const pm of Array.from(doc.getElementsByTagName('Placemark'))) {
      const pt = pm.getElementsByTagName('Point')[0]; if (!pt) continue;
      const c = txt(pt.getElementsByTagName('coordinates')[0]).split(/[,\s]+/).map(Number);
      if (!(Number.isFinite(c[0]) && Number.isFinite(c[1]))) continue;
      const ext = {};
      for (const d of Array.from(pm.getElementsByTagName('Data'))) ext[d.getAttribute('name') || ''] = txt(d.getElementsByTagName('value')[0]);
      for (const d of Array.from(pm.getElementsByTagName('SimpleData'))) ext[d.getAttribute('name') || ''] = txt(d);
      const ime = txt(Array.from(pm.childNodes).find(x => x.nodeName === 'name'));
      let n = null;
      const kb = Object.keys(ext).find(k => RE_BROJ.test(k) && brojIzNaziva(ext[k]) != null);
      if (kb) n = brojIzNaziva(ext[kb]); else n = brojIzNaziva(ime);
      const kr = Object.keys(ext).find(k => RE_RADNIK.test(k) && ext[k]);
      let r = kr ? ext[kr] : '';
      let folder = ''; for (let p = pm.parentNode; p && p.nodeName; p = p.parentNode) if (p.nodeName === 'Folder') { folder = txt(Array.from(p.childNodes).find(x => x.nodeName === 'name')); break; }
      if (folder) folderi.add(folder);
      const kd = Object.keys(ext).find(k => RE_DAN.test(k) && danIz(ext[k]));
      const d = kd ? danIz(ext[kd]) : danIz(txt(pm.getElementsByTagName('when')[0] || pm.getElementsByTagName('begin')[0]));
      out.push({ n, t: kb ? ext[kb] : ime, la: c[1], lo: c[0], r: r || '', d, _f: folder });
    }
    // mapa/folder je grupa (radnik) samo ako ih ima više od jednog
    out.forEach(s => { if (!s.r && folderi.size > 1) s.r = s._f; delete s._f; });
    return out;
  }

  // ── povezivanje u pojaseve ──
  // → { pojasi: [{ r, d, ids:[indeksi u ulaznom nizu], dug (m) }], usamljena }
  function gradi(stabla, prag, maxBroj) {
    prag = prag > 0 ? prag : PRAG_ZAD; maxBroj = maxBroj > 0 ? maxBroj : MAX_BROJ;
    if (!stabla || !stabla.length) return { pojasi: [], usamljena: 0 };
    const P = ravan(stabla[0].la, stabla[0].lo), xy = stabla.map(s => P.fw([s.la, s.lo]));
    const grupe = new Map();
    stabla.forEach((s, i) => { const k = (s.r || '') + '|' + (s.d || ''); (grupe.get(k) || grupe.set(k, []).get(k)).push(i); });
    const sve = [];
    for (const [k, ids] of grupe) {
      const poznata = k !== '|';
      ids.sort((a, b) => ((stabla[a].n == null ? Infinity : stabla[a].n) - (stabla[b].n == null ? Infinity : stabla[b].n)) || a - b);
      const otvoreni = [];
      for (const i of ids) {
        const q = xy[i], n = stabla[i].n;
        let naj = null, nc = Infinity;
        for (const o of (poznata ? otvoreni.slice(-1) : otvoreni)) {          // poznat radnik+dan: redom; inače sve otvorene pojase
          const d = dist(q, o.zad); if (d > prag) continue;
          if (!poznata && n != null && o.n != null && n - o.n > maxBroj) continue; // preplitanje: predaleko u numeraciji
          let c = d;
          if (o.smjer && d > 0.5) { const cs = (o.smjer[0] * (q[0] - o.zad[0]) + o.smjer[1] * (q[1] - o.zad[1])) / (Math.hypot(o.smjer[0], o.smjer[1]) * d); c = d * (1 + 0.5 * (1 - cs)); }
          if (!poznata && n != null && o.n != null) c += Math.max(0, n - o.n - 1); // bliži broj = isti projektant (svaki preskočeni broj ≈ 1 m)
          if (c < nc) { nc = c; naj = o; }
        }
        if (naj) { naj.smjer = [q[0] - naj.zad[0], q[1] - naj.zad[1]]; naj.zad = q; naj.n = n; naj.ids.push(i); }
        else otvoreni.push({ ids: [i], zad: q, smjer: null, n });
      }
      const [r, d] = k.split('|');
      otvoreni.forEach(o => sve.push({ r, d, ids: o.ids }));
    }
    let usamljena = 0;
    const pojasi = [];
    sve.sort((a, b) => a.ids[0] - b.ids[0]).forEach(o => {
      if (o.ids.length < 2) { usamljena++; return; }
      let dug = 0; for (let j = 1; j < o.ids.length; j++) dug += dist(xy[o.ids[j - 1]], xy[o.ids[j]]);
      pojasi.push({ r: o.r, d: o.d, ids: o.ids, dug });
    });
    return { pojasi, usamljena };
  }

  // ── Blokovi pločica = inženjeri ──
  // Pločice su JEDINSTVENE i idu redom od 1: svaki inženjer dobije blok (npr. 1–300, 301–600, 601–900; prvi pa opet 901–1200 — nije
  // pravilo), pa blok (raspon brojeva) određuje ko je doznačio stablo. Kad fajl ne nosi radnika, projektant = blok.
  // Zadani blokovi: svakih `korak` brojeva (zadano 300); korisnik ih može pomjeriti i imenovati (isto ime = isti projektant).
  function blokovi(stabla, korak) {
    korak = korak > 0 ? Math.round(korak) : 300;
    const ns = stabla.map(s => s.n).filter(n => n != null);
    if (!ns.length) return [];
    const max = Math.max(...ns), out = [];
    for (let od = 1, k = 0; od <= max; od += korak, k++) {
      const do_ = Math.min(od + korak - 1, max);
      if (ns.some(n => n >= od && n <= do_)) out.push({ od, do: do_, ime: 'Projektant ' + (k + 1) });
    }
    return out;
  }
  // Zadani blokovi po SKOKU: kad se sljedeći broj nalazi dalje od `skok` m (zadano 300) od prethodnog, počinje novi blok — drugi inženjer
  // ili novi dan na drugom mjestu. (U stvarnom fajlu doznake paketi pločica ≈ 210–260 završavaju upravo na takvim skokovima od 350–880 m.)
  function blokoviSkok(stabla, skok) {
    skok = skok > 0 ? skok : 300;
    const l = stabla.map((s, i) => ({ n: s.n, i })).filter(x => x.n != null).sort((a, b) => a.n - b.n || a.i - b.i);
    if (!l.length) return [];
    const P = ravan(stabla[l[0].i].la, stabla[l[0].i].lo), xy = stabla.map(s => P.fw([s.la, s.lo])), out = [];
    let od = l[0].n, pr = l[0];
    for (let k = 1; k < l.length; k++) {
      const b = l[k]; if (b.n === pr.n) continue;
      if (dist(xy[pr.i], xy[b.i]) > skok) { out.push({ od, do: pr.n, ime: 'Projektant ' + (out.length + 1) }); od = b.n; }
      pr = b;
    }
    out.push({ od, do: pr.n, ime: 'Projektant ' + (out.length + 1) });
    return out;
  }
  // Raspodjela blokova na `k` projektanata: prva 2.. k blokova su različiti projektanti (rade paralelno), a svaki sljedeći blok ide
  // onome čiji je prethodni blok ZAVRŠIO najbliže početku novog (nastavlja gdje je stao). → niz imena ('Projektant 1'…) po blokovima.
  function dodijeli(stabla, bl, k) {
    k = Math.max(1, Math.round(k) || 1);
    if (!bl.length) return [];
    const P = ravan(stabla[0].la, stabla[0].lo), xy = stabla.map(s => P.fw([s.la, s.lo]));
    const krajevi = bl.map(b => {
      let a = null, z = null;
      stabla.forEach((s, i) => { if (s.n == null || s.n < b.od || s.n > b.do) return; if (a == null || s.n < stabla[a].n) a = i; if (z == null || s.n > stabla[z].n) z = i; });
      return a == null ? null : { a: xy[a], z: xy[z] };
    });
    const zadnji = [], out = [];
    bl.forEach((b, i) => {
      const kr = krajevi[i]; let d = -1;
      if (i < k || !kr) d = Math.min(i, k - 1);
      else { let naj = Infinity; zadnji.forEach((z, j) => { if (!z) return; const r = dist(z, kr.a); if (r < naj) { naj = r; d = j; } }); if (d < 0) d = 0; }
      if (kr) zadnji[d] = kr.z;
      out.push('Projektant ' + (d + 1));
    });
    return out;
  }
  // Pojasi po blokovima: stabla bloka redom po broju; razmak veći od praga prekida pojas.
  // → { pojasi: [{ r: ime, d: '', sig: 'od-do', ids, dug }], usamljena, bezBroja }
  function gradiBlokove(stabla, prag, bl, opc) {
    const gap = !!(opc && opc.gap);
    prag = prag > 0 ? prag : PRAG_ZAD;
    if (!stabla || !stabla.length || !bl || !bl.length) return { pojasi: [], usamljena: 0, bezBroja: stabla ? stabla.length : 0 };
    const P = ravan(stabla[0].la, stabla[0].lo), xy = stabla.map(s => P.fw([s.la, s.lo]));
    const pojasi = [], singles = []; let usamljena = 0, dodijeljeno = 0;
    for (const b of bl) {
      const ids = []; stabla.forEach((s, i) => { if (s.n != null && s.n >= b.od && s.n <= b.do) ids.push(i); });
      ids.sort((x, y) => stabla[x].n - stabla[y].n || x - y);
      dodijeljeno += ids.length;
      let tek = [];
      const zatvori = () => { if (tek.length === 1 && gap) singles.push({ r: b.ime, sig: b.od + '-' + b.do, i: tek[0] }); if (tek.length > 1) { let dug = 0; for (let j = 1; j < tek.length; j++) dug += dist(xy[tek[j - 1]], xy[tek[j]]); pojasi.push({ r: b.ime, d: '', sig: b.od + '-' + b.do, ids: tek, dug }); } else if (tek.length === 1) usamljena++; tek = []; };
      for (const i of ids) {
        if (tek.length) {
          const pr = tek[tek.length - 1], g = Math.max(1, (stabla[i].n || 0) - (stabla[pr].n || 0)); // preskočeni brojevi = preskočena stabla → veći dozvoljeni razmak
          const lim = gap ? prag * (1 + 0.6 * Math.min(g - 1, 5)) : prag;
          if (dist(xy[pr], xy[i]) > lim) zatvori();
        }
        tek.push(i);
      }
      zatvori();
    }
    return { pojasi, usamljena, bezBroja: stabla.length - dodijeljeno, singles };
  }

  // ── Pametno: prag i skok iz samih podataka, pa konsolidacija ──
  // Prati niz brojeva pločica: medijan razmaka između SUSJEDNIH brojeva (n, n+1) daje tipičan korak doznake; prag prekida pojasa = 4× korak
  // (25–100 m), skok među inženjerima = max(300 m, 6× prag). Konsolidacija spaja komade pojasa istog bloka koje razdvaja samo rupa u
  // brojevima ili kratak razmak, a usamljeno stablo vezuje za pojas kojem je najbliži kraj (≤ 2× prag, brojevi susjedni).
  function parametri(stabla) {
    const l = stabla.map((s, i) => ({ n: s.n, i })).filter(x => x.n != null).sort((a, b) => a.n - b.n || a.i - b.i);
    if (l.length < 2) return { prag: PRAG_ZAD, skok: 300, korak: null };
    const P = ravan(stabla[l[0].i].la, stabla[l[0].i].lo), xy = stabla.map(s => P.fw([s.la, s.lo])), d = [];
    for (let k = 1; k < l.length; k++) if (l[k].n - l[k - 1].n === 1) d.push(dist(xy[l[k - 1].i], xy[l[k].i]));
    d.sort((a, b) => a - b);
    const korak = d.length ? d[Math.floor(d.length / 2)] : null;
    const prag = korak ? Math.max(25, Math.min(100, Math.round(korak * 4))) : PRAG_ZAD;
    return { prag, skok: Math.max(300, prag * 6), korak };
  }
  function konsoliduj(stabla, pojasi, singles, prag) {
    if (!pojasi.length && !(singles || []).length) return pojasi;
    const P = ravan(stabla[0].la, stabla[0].lo), xy = stabla.map(s => P.fw([s.la, s.lo]));
    const n = i => stabla[i].n, lim = prag * 2;
    const duz = ids => { let d = 0; for (let j = 1; j < ids.length; j++) d += dist(xy[ids[j - 1]], xy[ids[j]]); return d; };
    const po = pojasi.map(q => ({ ...q, ids: q.ids.slice() }));
    // 1) usamljena stabla: na kraj ili početak pojasa istog bloka kad su brojevi susjedni (≤ 3 razlike) i razmak ≤ 2× prag
    for (const sg of singles || []) {
      let naj = null, nd = Infinity, kraj = true;
      for (const q of po) {
        if (q.sig !== sg.sig) continue;
        const a = q.ids[0], z = q.ids[q.ids.length - 1];
        const dz = dist(xy[z], xy[sg.i]), da = dist(xy[a], xy[sg.i]);
        if (n(sg.i) > n(z) && n(sg.i) - n(z) <= 3 && dz <= lim && dz < nd) { nd = dz; naj = q; kraj = true; }
        if (n(sg.i) < n(a) && n(a) - n(sg.i) <= 3 && da <= lim && da < nd) { nd = da; naj = q; kraj = false; }
      }
      if (naj) { if (kraj) naj.ids.push(sg.i); else naj.ids.unshift(sg.i); }
    }
    // 2) spajanje komada istog bloka: sljedeći počinje blizu kraja prethodnog i brojevi se nastavljaju (rupa ≤ 8)
    po.sort((a, b) => (a.sig === b.sig ? n(a.ids[0]) - n(b.ids[0]) : 0));
    const izlaz = [];
    for (const q of po) {
      const pr = izlaz.length ? izlaz[izlaz.length - 1] : null;
      if (pr && pr.sig === q.sig) {
        const z = pr.ids[pr.ids.length - 1], a = q.ids[0], g = n(a) - n(z);
        if (g >= 1 && g <= 8 && dist(xy[z], xy[a]) <= lim) { pr.ids = pr.ids.concat(q.ids); continue; }
      }
      izlaz.push(q);
    }
    return izlaz.map(q => ({ r: q.r, d: q.d || '', sig: q.sig, ids: q.ids, dug: duz(q.ids) }));
  }

  const api = { izKml, gradi, blokovi, blokoviSkok, dodijeli, gradiBlokove, parametri, konsoliduj, brojIzNaziva, danIz, PRAG_ZAD };
  root.USFDozStabla = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
