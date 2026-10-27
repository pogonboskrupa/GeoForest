// Karte → tab „☁ Server”: karte iz karte_drive.json i karte_github.json sa jasnim stanjem
// (na telefonu / preuzima se / dostupno / uz PIN), veličinom, napretkom i pregledom.
// Logika preuzimanja je ista kao u „Učitaj kartu” (index.html: _dkPreuzmi, _dkOtkljucaj, _dkPrekini);
// ovdje je samo prikaz. Brojevi na tabovima: _khStat → render().
(function (root) {
  'use strict';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // let/const iz index.html nisu na window — gola imena uz typeof (radi i bez index.html, npr. u testu)
  const sqlLayers = () => (typeof _sqlLayers !== 'undefined' ? _sqlLayers : []);
  const kmlSlojevi = () => (typeof kmlLs !== 'undefined' ? kmlLs : []);
  const napredak = () => (typeof _dkNapredak !== 'undefined' ? _dkNapredak : {});
  const driveLista = () => (typeof _dkLista !== 'undefined' ? _dkLista : null);
  const ghLista = () => (typeof _dkGh !== 'undefined' ? _dkGh : []);
  const ghPokusano = () => (typeof _dkGhPokusano !== 'undefined' ? _dkGhPokusano : true);
  const imaKljuc = () => { try { return typeof _dkKljuc === 'function' && !!_dkKljuc(); } catch (e) { return false; } };

  // Stanje jedne karte: redoslijed važi — na telefonu > preuzima se > dostupno (PIN unesen) > uz PIN.
  function statusKarte(k, { naTelefonu, napredak, kljuc }) {
    if (naTelefonu) return { vrsta: 'tel', txt: '✓ Na telefonu' };
    if (napredak) return { vrsta: 'preuzima', txt: '⬇ Preuzima se' + (napredak.p != null ? ' ' + napredak.p + ' %' : '…'), p: napredak.p, mb: napredak.mb };
    if (kljuc) return { vrsta: 'dostupno', txt: '☁ Spremno za preuzimanje' };
    return { vrsta: 'pin', txt: '🔒 Dostupno uz PIN' };
  }

  const velicina = mb => !mb ? '' : mb >= 1024 ? (mb / 1024).toLocaleString('bs-BA', { maximumFractionDigits: 1 }) + ' GB' : Math.round(mb) + ' MB';
  const PREGLED = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 12l12-5 12 5 12-5v29l-12 5-12-5-12 5z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><path d="M18 7v29M30 12v29" stroke="currentColor" stroke-width="2.5"/></svg>';

  function lokalna(k) {
    return sqlLayers().find(x => x.name === k.naziv + '.sqlitedb' || x.name === k.naziv) || null;
  }

  function red(k, kljuc) {
    const lok = lokalna(k), nap = napredak()[k.id];
    const st = statusKarte(k, { naTelefonu: !!lok, napredak: nap, kljuc });
    const id = esc(k.id), mb = velicina(k.mb);
    let akcija;
    if (st.vrsta === 'tel') akcija = lok.active ? '<span class="kt-akt">✓ Aktivna</span>' : `<button class="glavno" onclick="_sqlmapSelect('${esc(lok.id)}', 'tiho')">▶ Koristi</button>`;
    else if (st.vrsta === 'preuzima') akcija = `<button onclick="_dkPrekini('${id}')">✕ Prekini</button>`;
    else if (st.vrsta === 'dostupno') akcija = `<button class="glavno" onclick="_dkPreuzmi('${id}')">⬇ Preuzmi${mb ? ' · ' + mb : ''}</button>`;
    else akcija = `<button onclick="_dkOtkljucaj()">🔒 Unesi PIN</button>`;
    const traka = st.vrsta === 'preuzima'
      ? `<div class="kt-traka" role="progressbar" aria-valuemin="0" aria-valuemax="100"${st.p != null ? ` aria-valuenow="${st.p}"` : ''}><u style="width:${st.p || 0}%"></u></div><small class="kt-mb">${st.mb ? esc(st.mb) + ' MB preuzeto' : 'počinje…'}${mb ? ' od ' + mb : ''} · nastavlja se ako nestane signala</small>`
      : '';
    const slika = lok && lok.thumb ? `<img src="${esc(lok.thumb)}" alt="" loading="lazy">` : PREGLED;
    return `<div class="kt-red kt-s-${st.vrsta}">
      <div class="kt-pr">${slika}</div>
      <div class="kt-i"><b>${esc(k.naziv)}</b><span class="kt-st">${esc(st.txt)}</span><small>${esc(k.opis || '')}${k.opis && mb ? ' · ' : ''}${mb}</small>${traka}</div>
      <div class="kt-a">${akcija}</div></div>`;
  }

  let ucitava = false;
  async function ucitajListe() {
    if (ucitava) return;
    ucitava = true;
    try {
      if (!driveLista() && typeof _dkUcitaj === 'function') await _dkUcitaj();
      if (!ghPokusano() && typeof _dkGhUcitaj === 'function') await _dkGhUcitaj();
    } catch (e) { /* liste imaju ugrađenu rezervu; greška ne smije srušiti tab */ }
    ucitava = false;
    render();
  }

  function render() {
    if (typeof document === 'undefined') return;
    const el = document.getElementById('kt-srv-karte');
    const kljuc = imaKljuc();
    const pin = document.getElementById('kt-pin');
    const online = typeof navigator === 'undefined' || navigator.onLine !== false;
    if (pin) {
      pin.className = 'kt-pin' + (kljuc ? ' ok' : '');
      pin.innerHTML = (kljuc
        ? '<i>🔓</i><div><b>Karte otključane</b><small>PIN važi do kraja mjeseca.</small></div>'
        : '<i>🔒</i><div><b>Preuzimanje traži PIN karata</b><small>PIN se mijenja svaki mjesec. Već preuzete karte rade bez PIN-a.</small></div><button class="glavno" onclick="_dkOtkljucaj()">Unesi PIN</button>')
        + (online ? '' : '<p class="kt-off">📵 Nema interneta — prikazana je zadnja sačuvana lista. Preuzimanje kreni kad se vrati signal.</p>');
    }
    const lista = (driveLista() || []).concat(ghLista());
    if (el) {
      if (!driveLista() || !ghPokusano()) { el.innerHTML = '<div class="kt-prazno">⏳ Učitavam listu karata…</div>'; ucitajListe(); }
      else el.innerHTML = lista.length ? lista.map(k => red(k, kljuc)).join('') + '<p class="set-nap">Karta se skida jednom i ostaje na telefonu. Za velike karte koristi WiFi.</p>'
        : '<div class="kt-prazno">Trenutno nema karata za preuzimanje.</div>';
    }
    brojevi(lista, kljuc);
  }

  function brojevi(lista, kljuc) {
    const set = (id, t) => { const e = document.getElementById(id); if (e) { e.textContent = t; e.hidden = !t; } };
    const nTel = sqlLayers().length + kmlSlojevi().length;
    set('kt-n-tel', nTel ? String(nTel) : '');
    const nap = Object.keys(napredak()).length;
    const nove = lista.filter(k => !lokalna(k)).length;
    set('kt-n-srv', nap ? '⬇' : !kljuc ? '🔒' : nove ? String(nove) : '');
    const teren = ['terrain-aspect', 'terrain-shade'].filter(id => document.getElementById(id) && document.getElementById(id).checked).length;
    set('kt-n-pod', teren ? '●' : '');
  }

  root.USFKarteTab = { render, statusKarte, velicina };
  if (typeof module !== 'undefined') module.exports = { statusKarte, velicina, red };
  if (typeof window !== 'undefined') {
    window.addEventListener('online', render);
    window.addEventListener('offline', render);
    window.addEventListener('gf-tab', e => { if (e.detail && e.detail.kljuc === 'karte' && e.detail.t === 'srv') render(); });
  }
})(typeof window !== 'undefined' ? window : globalThis);
