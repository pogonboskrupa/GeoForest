// Mjerenje površine — prikaz (v1.2.8): formatiranje (ha / m² / ha-a-m²), težište unutar poligona i natpis na karti.
// Čista logika bez ovisnosti o mapi, da se može testirati; index.html samo zove USFPov.
(function (W) {
  'use strict';
  const grupe = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const dec = (v, d) => v.toFixed(d).replace('.', ',');

  // m² → { g: glavna vrijednost, j: jedinica, pod: podređeni red }
  //   < 1 000 m²      → „812 m²”  · „0,08 ha”
  //   do 100 ha        → „2,35 ha” · „2 ha 35 a 12 m²”
  //   ≥ 100 ha         → „123,4 ha” / „1 234 ha”
  function fmt(m2) {
    const a = Math.max(0, +m2 || 0);
    const ha = Math.floor(a / 10000), ar = Math.floor((a - ha * 10000) / 100), m = Math.round(a - ha * 10000 - ar * 100);
    const puno = (ha ? ha + ' ha ' : '') + (ha || ar ? ar + ' a ' : '') + m + ' m²';
    if (a < 1000) return { g: grupe(a), j: 'm²', pod: dec(a / 10000, 2) + ' ha', puno, ha: a / 10000 };
    if (a < 1e6) return { g: dec(a / 10000, 2), j: 'ha', pod: puno, puno, ha: a / 10000 };
    if (a < 1e7) return { g: dec(a / 10000, 1), j: 'ha', pod: grupe(a) + ' m²', puno, ha: a / 10000 };
    return { g: grupe(a / 10000), j: 'ha', pod: grupe(a) + ' m²', puno, ha: a / 10000 };
  }
  const haTekst = ha => { const f = fmt(ha * 10000); return f.j === 'm²' ? f.g + ' m²' : f.g + ' ha'; };

  function unutar(x, y, P) {
    let u = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      if ((P[i][1] > y) !== (P[j][1] > y) && x < (P[j][0] - P[i][0]) * (y - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) u = !u;
    }
    return u;
  }
  // Težište površine u lokalnoj ravni; ako pada van (udubljen oblik) — tačka unutar poligona (turf.pointOnFeature ili najbliži unutrašnji vrh/sredina).
  function centar(pts) {
    if (!pts || !pts.length) return null;
    const la0 = pts.reduce((s, p) => s + p.lat, 0) / pts.length, lo0 = pts.reduce((s, p) => s + p.lng, 0) / pts.length, k = Math.cos(la0 * Math.PI / 180);
    const P = pts.map(p => [(p.lng - lo0) * k, p.lat - la0]);
    let A = 0, cx = 0, cy = 0;
    for (let i = 0; i < P.length; i++) {
      const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % P.length], f = x1 * y2 - x2 * y1;
      A += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
    }
    if (Math.abs(A) < 1e-18) return { lat: la0, lng: lo0 };
    cx /= 3 * A; cy /= 3 * A;
    if (unutar(cx, cy, P)) return { lat: la0 + cy, lng: lo0 + cx / k };
    // Udubljen oblik: vodoravna crta kroz težište, sredina najšireg dijela unutar poligona
    const xs = [];
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      if ((P[i][1] > cy) !== (P[j][1] > cy)) xs.push((P[j][0] - P[i][0]) * (cy - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]);
    }
    xs.sort((m, n) => m - n);
    let naj = -1, mid = null;
    for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > naj) { naj = xs[i + 1] - xs[i]; mid = (xs[i] + xs[i + 1]) / 2; }
    if (mid != null) return { lat: la0 + cy, lng: lo0 + mid / k };
    return { lat: la0, lng: lo0 };
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Natpis na karti: velika vrijednost + sitni podređeni red (kompaktan = samo pilula)
  function natpis(m2, boja, kompaktno) {
    const f = fmt(m2);
    const c = /^#[0-9a-f]{3,8}$/i.test(boja) ? boja : '#a78bfa';
    return kompaktno
      ? `<span class="pov-nat mali" style="--c:${c}"><b>${esc(f.g)}</b> ${esc(f.j)}</span>`
      : `<span class="pov-nat" style="--c:${c}"><b>${esc(f.g)}<i>${esc(f.j)}</i></b><small>${esc(f.pod)}</small></span>`;
  }
  W.USFPov = { fmt, haTekst, centar, natpis, grupe };
  if (typeof module !== 'undefined') module.exports = W.USFPov;
})(typeof window !== 'undefined' ? window : globalThis);
