// Postavke → Prikaz: „Šablon interfejsa” (jedan dodir postavlja izgled koordinata i dugmadi) i
// „Prikaz po razmjeri” (do koje razmjere se vide tragovi, KML/SHP, sjekačke linije, tačke, mjerenja).
// Stanje: _uiPrikaz / _prRazmjera iz index.html (gola imena — leksički globalna); ovdje je samo prikaz i unos.
(function (W) {
  'use strict';

  // ── Šabloni interfejsa: vrijednosti ključeva _uiPrikaz (koordinatni sistem i „šta se prikazuje” se NE diraju) ──
  const SABLONI = [
    { id: 'standard', ik: '🧭', naziv: 'Standardni', opis: 'Zadani izgled',
      v: { tema: 'tamna', bdgA: 55, bdgFs: 11, bdgOut: 'tanak', blur: 0, btnA: 86, btnZ: 100, btnOblik: 'zaobljeno', btnIk: 'normalne', btnStil: 'staklo' } },
    { id: 'teren', ik: '☀', naziv: 'Teren', opis: 'Sunce i rukavice: svijetla podloga, krupan tekst, velika dugmad',
      v: { tema: 'svijetla', bdgA: 90, bdgFs: 14, bdgOut: 'jak', blur: 0, btnA: 100, btnZ: 125, btnOblik: 'zaobljeno', btnIk: 'podebljane', btnStil: 'kontrast' } },
    { id: 'noc', ik: '🌙', naziv: 'Noć', opis: 'Tamno i prigušeno, manje svjetla na ekranu',
      v: { tema: 'tamna', bdgA: 40, bdgFs: 12, bdgOut: 'tanak', blur: 0, btnA: 55, btnZ: 100, btnOblik: 'zaobljeno', btnIk: 'tanke', btnStil: 'staklo' } },
    { id: 'kompakt', ik: '🗺', naziv: 'Kompaktni', opis: 'Više karte: sitnija, prozirnija dugmad',
      v: { tema: 'tamna', bdgA: 35, bdgFs: 10, bdgOut: 'tanak', blur: 0, btnA: 70, btnZ: 85, btnOblik: 'ostro', btnIk: 'normalne', btnStil: 'minimal' } }
  ];

  const sablonJe = (s, u) => Object.keys(s.v).every(k => u[k] === s.v[k]);
  const aktivniSablon = u => SABLONI.find(s => sablonJe(s, u)) || null;

  W._setSablon = function (id) {
    const s = SABLONI.find(x => x.id === id); if (!s) return;
    Object.assign(_uiPrikaz, s.v);
    try { localStorage.setItem(_UI_KEY, JSON.stringify(_uiPrikaz)); } catch (e) {}
    _uiPrimijeni(); _setUiUi();
    if (typeof showToast === 'function') showToast('🎨 Šablon: ' + s.naziv);
  };

  W._setSablonUi = function () {
    const el = document.getElementById('set-sablon'); if (!el || typeof _uiPrikaz === 'undefined') return;
    const akt = aktivniSablon(_uiPrikaz);
    el.innerHTML = SABLONI.map(s => `<button type="button" role="radio" aria-checked="${akt === s}" class="sab${akt === s ? ' on' : ''}" onclick="_setSablon('${s.id}')">
      <i>${s.ik}</i><b>${s.naziv}</b><small>${s.opis}</small>${akt === s ? '<em>✓ Aktivan</em>' : ''}</button>`).join('')
      + (akt ? '' : '<p class="sab-vl">✎ Prilagođeno: ručno si mijenjao postavke ispod. Izaberi šablon da se vrate zadane vrijednosti.</p>');
    _setBtnSablonUi();
  };

  // ── Šabloni dugmadi na mapi: stil (data-btn-stil na <html>, CSS u geoforest.css) + vrijednosti postojećih postavki ──
  const BTN_SABLONI = [
    { id: 'staklo', ik: '◐', naziv: 'Staklo', opis: 'Prozirna, vidi se karta ispod. Zadano.',
      v: { btnStil: 'staklo', btnA: 86, btnZ: 100, btnOblik: 'zaobljeno', btnIk: 'normalne' } },
    { id: 'cvrsto', ik: '■', naziv: 'Čvrsto', opis: 'Neprozirna tamna dugmad s okvirom. Uvijek čitljiva.',
      v: { btnStil: 'cvrsto', btnA: 100, btnZ: 105, btnOblik: 'zaobljeno', btnIk: 'normalne' } },
    { id: 'kontrast', ik: '☀', naziv: 'Kontrast', opis: 'Bijela s crnim okvirom i debelim ikonama. Za jako sunce.',
      v: { btnStil: 'kontrast', btnA: 100, btnZ: 120, btnOblik: 'zaobljeno', btnIk: 'podebljane' } },
    { id: 'akcent', ik: '✦', naziv: 'Akcent', opis: 'Tamna sa zelenim svjetlećim rubom. Istaknuta na svakoj podlozi.',
      v: { btnStil: 'akcent', btnA: 100, btnZ: 105, btnOblik: 'okruglo', btnIk: 'podebljane' } },
    { id: 'minimal', ik: '○', naziv: 'Minimal', opis: 'Tanke ikone, bez okvira, najmanje zaklanja kartu.',
      v: { btnStil: 'minimal', btnA: 45, btnZ: 92, btnOblik: 'okruglo', btnIk: 'tanke' } }
  ];
  const aktivniBtn = u => BTN_SABLONI.find(s => sablonJe(s, u)) || null;
  const OBLIK_PX = { okruglo: '26px', zaobljeno: '16px', ostro: '7px' }, IK_W = { tanke: '1.5', normalne: '2', podebljane: '2.7' };
  const SV = {
    plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
    loc: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    sloj: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    mjer: '<path d="M3.5 16.5 16.5 3.5l4 4-13 13z"/><path d="M7.5 12.5l2 2M10.5 9.5l2 2M13.5 6.5l2 2"/>'
  };
  const svg = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${SV[k]}</svg>`;

  W._setBtnSablon = function (id) {
    const s = BTN_SABLONI.find(x => x.id === id); if (!s) return;
    Object.assign(_uiPrikaz, s.v);
    try { localStorage.setItem(_UI_KEY, JSON.stringify(_uiPrikaz)); } catch (e) {}
    _uiPrimijeni(); _setUiUi();
    if (typeof showToast === 'function') showToast('🎛 Dugmad: ' + s.naziv);
  };

  W._setBtnSablonUi = function () {
    const el = document.getElementById('set-dugmad-sab'); if (!el || typeof _uiPrikaz === 'undefined') return;
    const akt = aktivniBtn(_uiPrikaz);
    el.innerHTML = BTN_SABLONI.map(s => {
      const st = `--btn-a:${(s.v.btnA / 100).toFixed(2)};--btn-r:${OBLIK_PX[s.v.btnOblik]};--btn-sw:${IK_W[s.v.btnIk]}`;
      return `<button type="button" role="radio" aria-checked="${akt === s}" class="bsab${akt === s ? ' on' : ''}" onclick="_setBtnSablon('${s.id}')">
        <span class="bs-pr" data-bs-pr="${s.id}" style="${st}" aria-hidden="true">
          <span class="bs-pill"><span class="bs-b">${svg('plus')}</span><span class="bs-b">${svg('minus')}</span></span>
          <span class="bs-pill"><span class="bs-b">${svg('mjer')}</span></span>
          <span class="bs-btn bs-loc">${svg('loc')}</span>
          <span class="bs-btn">${svg('sloj')}</span>
        </span>
        <span class="bsab-txt"><b>${s.naziv}</b><small>${s.opis}</small></span>${akt === s ? '<em>✓ Aktivan</em>' : ''}</button>`;
    }).join('') + (akt ? '' : '<p class="sab-vl">✎ Prilagođeno: neka postavka dugmadi je ručno promijenjena. Izaberi šablon da se vrate njegove vrijednosti.</p>');
  };

  // ── Prikaz po razmjeri ──
  const VRSTE = [['tragovi', '🥾', 'Tragovi'], ['kml', '🗺', 'KML / SHP slojevi'], ['sjek', '🪓', 'Sjekačke linije'], ['slike', '📷', 'Tačke i fotografije'], ['mjerenja', '📏', 'Mjerenja']];
  const PRESETI = [5000, 10000, 25000, 50000, 100000, 250000];
  W._PR_VRSTE = VRSTE.map(([k, ik, t]) => [k, ik + ' ' + t]);
  W._PR_PRESETI = [0].concat(PRESETI);

  const MIN = 500, MAX = 5000000;
  const zaokruzi = n => Math.min(MAX, Math.max(MIN, Math.round(n / 500) * 500));

  W._setRazmjeraUi = function () {
    const el = document.getElementById('set-razmjera'); if (!el || typeof _prRazmjera === 'undefined') return;
    el.innerHTML = VRSTE.map(([k, ik, t]) => {
      const g = _prRazmjera[k] || 0, skriva = _razmjeraSkriva(k);
      const stanje = g ? (skriva ? '<span class="rz-st off">○ Sada sakriveno</span>' : '<span class="rz-st on">● Sada vidljivo</span>') : '<span class="rz-st on">● Uvijek vidljivo</span>';
      const opis = g ? `Vidi se do razmjere <b>1:${_prBroj(g)}</b>. Kad zumiraš dalje (npr. 1:${_prBroj(g * 2)}) sakrije se.` : 'Vidi se na svakoj razmjeri.';
      const chip = (v, txt) => `<button type="button" class="rz-chip${g === v ? ' on' : ''}" onclick="_setRazmjera('${k}', ${v})">${txt}</button>`;
      return `<div class="rz-kar" data-k="${k}"><div class="rz-zag"><b>${ik} ${t}</b>${stanje}</div>
        <p class="rz-opis">${opis}</p>
        <div class="rz-chips" role="group" aria-label="Granica razmjere: ${t}">${chip(0, 'Uvijek')}${PRESETI.map(p => chip(p, '1:' + _prBroj(p))).join('')}</div>
        <div class="rz-vl"><label>Vlastita&nbsp;1&nbsp;:<input type="number" inputmode="numeric" min="${MIN}" max="${MAX}" step="500" value="${g || ''}" placeholder="npr. 30000" onchange="_setRazmjera('${k}', this.value, true)"></label>
          <button type="button" class="rz-sad-btn" onclick="_setRazmjeraTrenutna('${k}')">📍 Trenutna razmjera</button></div></div>`;
    }).join('');
    const sad = document.getElementById('set-razmjera-sad');
    if (sad) sad.innerHTML = 'Trenutna razmjera karte: <b>' + _razmjeraTxt() + '</b>';
  };

  W._setRazmjera = function (k, val, vlastita) {
    let n = Math.round(+val);
    if (!Number.isFinite(n) || n < 0) n = 0;
    if (n > 0 && (vlastita || n < MIN)) n = Math.min(MAX, Math.max(MIN, n));
    _prRazmjera[k] = n;
    try { localStorage.setItem(_PR_KEY, JSON.stringify(_prRazmjera)); } catch (e) {}
    _prPrimijeni(true); _setRazmjeraUi();
  };

  // Zumiraj na željeni nivo, otvori Postavke i dodirni „Trenutna razmjera”: granica = razmjera koja je bila na karti.
  W._setRazmjeraTrenutna = function (k) { _setRazmjera(k, zaokruzi(_razmjera()), true); };

  if (typeof module !== 'undefined') module.exports = { SABLONI, BTN_SABLONI, aktivniSablon, aktivniBtn, sablonJe, zaokruzi };
})(typeof window !== 'undefined' ? window : {});
