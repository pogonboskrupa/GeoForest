// Novi izgled glavnih tabova (v1.3.3+): kartica „Nastavi” u Meniju — prvo ono što je U TOKU (snimanje traga/pojasa,
// vodič sjekačke linije), zatim aktivni projekti (Doznaka, Primka) i nedavno otvoreni odjeljci (usf_meni_nedavno).
(function (W) {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const json = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const NAJVISE = 3;

  // Čista funkcija (test): stanje → stavke [{id, t, s, uzivo}] — id je kartica Menija čija se ikona/boja/akcija koristi
  function stavke(st) {
    const out = [], ima = id => out.some(x => x.id === id);
    if (st.trag) out.push({ id: 'mc-tragovi', t: 'Snimanje traga', s: st.trag === 'pauza' ? 'pauzirano' : 'u toku', uzivo: true, karta: true });
    if (st.pojas) out.push({ id: 'mc-doznaka', t: 'Pojas doznake', s: st.pojas, uzivo: true, karta: true });
    if (st.vodic) out.push({ id: 'mc-sjekacke', t: 'Vodič sjekačke linije', s: st.vodic, uzivo: true, karta: true });
    if (st.doznaka && !ima('mc-doznaka')) out.push({ id: 'mc-doznaka', t: 'Doznaka stabala', s: st.doznaka });
    if (st.primka && !ima('mc-primka')) out.push({ id: 'mc-primka', t: 'Primka', s: st.primka });
    (st.nedavno || []).forEach(id => { if (!ima(id) && out.length < NAJVISE) out.push({ id, t: '', s: 'nedavno otvoreno' }); });
    return out.slice(0, NAJVISE);
  }

  function stanje() {
    const st = {};
    try { if (typeof _tragOn !== 'undefined' && _tragOn) st.trag = typeof _tragPaused !== 'undefined' && _tragPaused ? 'pauza' : 'snima'; } catch (e) {}
    const poj = json('usf_doz_snima'); if (poj && poj.ime) st.pojas = poj.ime + (poj.pauza ? ' · pauzirano' : ' · u toku');
    const vod = json('usf_sjek_vodic'); if (vod) { const pr = (json('usf_sjekacke') || []).find(x => x && x.id === vod.pid); st.vodic = pr ? pr.naziv || 'u toku' : 'u toku'; }
    const doz = json('usf_doznaka'); if (doz && doz.akt) { const pr = (doz.projekti || []).find(x => x.id === doz.akt); if (pr) st.doznaka = pr.naziv + ' · ' + (pr.tragovi || []).length + ' poj.'; }
    const pa = localStorage.getItem('usf_primka_aktivni'); if (pa) { const pr = (json('usf_primka') || []).find(x => x && x.id === pa); if (pr) st.primka = pr.naziv; }
    st.nedavno = json('usf_meni_nedavno') || [];
    return st;
  }

  function nastavi() {
    const el = document.getElementById('meni-nedavno'); if (!el) return;
    const l = stavke(stanje()).filter(x => document.getElementById(x.id));
    el.hidden = !l.length;
    if (!l.length) { el.innerHTML = ''; return; }
    el.innerHTML = '<h3>Nastavi</h3>' + l.map((x, i) => {
      const c = document.getElementById(x.id), ik = c.querySelector('.mn-ik'), boja = c.style.getPropertyValue('--mc') || '#4ade80';
      const naslov = x.t || (c.querySelector('b') || {}).textContent || '';
      return `<button type="button" class="mn-red${x.uzivo ? ' uzivo' : ''}" data-i="${i}" style="--mc:${esc(boja)}"><span class="mn-ik">${ik ? ik.innerHTML : ''}</span><span class="mn-tx"><b>${esc(naslov)}</b><small>${x.uzivo ? '<i></i>' : ''}${esc(x.s)}</small></span><svg class="mn-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>`;
    }).join('');
    el.onclick = e => {
      const b = e.target.closest('.mn-red'); if (!b) return;
      const x = l[+b.dataset.i]; if (!x) return;
      if (x.karta && typeof switchMainTab === 'function') switchMainTab('karta');
      else { const c = document.getElementById(x.id); if (c) c.click(); }
    };
  }

  // ── Postavke: glavna lista + podstranice (Android „nazad” vraća na listu preko history.pushState) ──
  const setPanel = () => document.getElementById('postavke-panel');
  function setPrikazi(k) {
    const pn = setPanel(); if (!pn) return;
    let naslov = 'Postavke';
    pn.querySelectorAll('.set-str').forEach(el => { const on = (el.dataset.str || '') === (k || ''); el.hidden = !on; if (on && k) naslov = el.dataset.naslov || naslov; });
    const h = document.getElementById('set-naslov'); if (h) h.textContent = naslov;
    const n = document.getElementById('set-nazad'); if (n) n.hidden = !k;
    const body = pn.querySelector('.up-body'); if (body) body.scrollTop = 0;
  }
  function setStr(k) {
    const st = history.state && history.state.gfSet;
    if (k) { if (st) history.replaceState({ gfSet: k }, ''); else history.pushState({ gfSet: k }, ''); setPrikazi(k); }
    else if (st) history.back(); // popstate prikaže listu
    else setPrikazi(null);
  }
  // Element unutar podstranice (npr. _setSkok('set-s-razmjera')) → otvori tu podstranicu
  function setZa(el) { const str = el && el.closest && el.closest('.set-str[data-str]'); if (str) setStr(str.dataset.str); }
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    window.addEventListener('popstate', () => setPrikazi(history.state && history.state.gfSet || null));
    document.addEventListener('click', e => {
      const r = e.target.closest('#postavke-panel .mn-red[data-str]'); if (r) { setStr(r.dataset.str); return; }
      if (e.target.closest('#set-nazad')) setStr(null);
    });
    // Ulazak u tab Postavke uvijek počinje od liste
    if (typeof W.switchMainTab === 'function') {
      const orig = W.switchMainTab;
      W.switchMainTab = function (t) { if (history.state && history.state.gfSet) { history.replaceState(null, ''); } setPrikazi(null); return orig.apply(this, arguments); };
    }
  }

  W.USFIzgled = { nastavi, stavke, setStr, setZa };
  if (typeof module !== 'undefined') module.exports = { stavke };
})(typeof window !== 'undefined' ? window : globalThis);
