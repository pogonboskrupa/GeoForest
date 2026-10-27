// Tabovi u panelima (Karte, Postavke): veliki dugmići za rad u rukavicama, izbor se pamti po panelu
// (localStorage usf_tab_<ključ>). HTML: [data-tabovi="ključ"] > button[data-t], sekcije .gf-tab-sek[data-tab].
(function (root) {
  'use strict';

  const LS = k => 'usf_tab_' + k;
  const grupa = k => document.querySelector('[data-tabovi="' + k + '"]');

  function izaberi(kljuc, t) {
    const g = grupa(kljuc); if (!g) return null;
    const panel = g.closest('.usf-panel') || document;
    const dugmad = [...g.querySelectorAll('[data-t]')];
    if (!dugmad.some(b => b.dataset.t === t)) t = dugmad.length ? dugmad[0].dataset.t : null;
    dugmad.forEach(b => {
      const on = b.dataset.t === t;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
    panel.querySelectorAll('.gf-tab-sek[data-tab]').forEach(s => { s.hidden = s.dataset.tab !== t; });
    try { localStorage.setItem(LS(kljuc), t); } catch (e) {}
    try { root.dispatchEvent(new CustomEvent('gf-tab', { detail: { kljuc, t } })); } catch (e) {}
    return t;
  }

  function aktivan(kljuc) {
    const b = grupa(kljuc) && grupa(kljuc).querySelector('[data-t].on');
    return b ? b.dataset.t : null;
  }

  // Skok na element u drugom tabu (npr. _setSkok): prvo se otvori njegov tab.
  function otvoriZa(el) {
    const sek = el && el.closest && el.closest('.gf-tab-sek[data-tab]');
    if (!sek) return;
    const g = sek.closest('.usf-panel') && sek.closest('.usf-panel').querySelector('[data-tabovi]');
    if (g && aktivan(g.dataset.tabovi) !== sek.dataset.tab) izaberi(g.dataset.tabovi, sek.dataset.tab);
  }

  function init() {
    document.querySelectorAll('[data-tabovi]').forEach(g => {
      if (g.dataset.gfInit) return;
      g.dataset.gfInit = '1';
      const k = g.dataset.tabovi;
      g.addEventListener('click', e => {
        const b = e.target.closest('[data-t]');
        if (!b) return;
        izaberi(k, b.dataset.t);
        const body = g.closest('.up-body'); if (body) body.scrollTop = 0;
      });
      g.addEventListener('keydown', e => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        const d = [...g.querySelectorAll('[data-t]')], i = d.findIndex(b => b.classList.contains('on'));
        const n = d[(i + (e.key === 'ArrowRight' ? 1 : d.length - 1)) % d.length];
        if (n) { izaberi(k, n.dataset.t); n.focus(); }
      });
      let z = null; try { z = localStorage.getItem(LS(k)); } catch (e) {}
      izaberi(k, z);
    });
  }

  root.USFTabovi = { izaberi, aktivan, otvoriZa, init };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
