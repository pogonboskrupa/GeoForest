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
  // Pojasi po blokovima: stabla bloka redom po broju; razmak veći od praga prekida pojas.
  // → { pojasi: [{ r: ime, d: '', sig: 'od-do', ids, dug }], usamljena, bezBroja }
  function gradiBlokove(stabla, prag, bl) {
    prag = prag > 0 ? prag : PRAG_ZAD;
    if (!stabla || !stabla.length || !bl || !bl.length) return { pojasi: [], usamljena: 0, bezBroja: stabla ? stabla.length : 0 };
    const P = ravan(stabla[0].la, stabla[0].lo), xy = stabla.map(s => P.fw([s.la, s.lo]));
    const pojasi = []; let usamljena = 0, dodijeljeno = 0;
    for (const b of bl) {
      const ids = []; stabla.forEach((s, i) => { if (s.n != null && s.n >= b.od && s.n <= b.do) ids.push(i); });
      ids.sort((x, y) => stabla[x].n - stabla[y].n || x - y);
      dodijeljeno += ids.length;
      let tek = [];
      const zatvori = () => { if (tek.length > 1) { let dug = 0; for (let j = 1; j < tek.length; j++) dug += dist(xy[tek[j - 1]], xy[tek[j]]); pojasi.push({ r: b.ime, d: '', sig: b.od + '-' + b.do, ids: tek, dug }); } else if (tek.length === 1) usamljena++; tek = []; };
      for (const i of ids) { if (tek.length && dist(xy[tek[tek.length - 1]], xy[i]) > prag) zatvori(); tek.push(i); }
      zatvori();
    }
    return { pojasi, usamljena, bezBroja: stabla.length - dodijeljeno };
  }

  const api = { izKml, gradi, blokovi, gradiBlokove, brojIzNaziva, danIz, PRAG_ZAD };
  root.USFDozStabla = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
