// Korisnik aplikacije: ime koje upiše sam korisnik (Postavke → Aplikacija), localStorage `usf_korisnik` {ime, datum}
// (ulazi u rezervnu kopiju). Služi kao „vlasnik” podataka koje korisnik pravi — npr. pojas doznake nosi ime onoga ko ga je
// snimio, pa se ime ne piše za svaki trag, a pri slanju (KML) ide uz trag.
(function (W) {
  'use strict';
  const KEY = 'usf_korisnik';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = t => { if (typeof showToast === 'function') showToast(t); };
  let uredi = false;

  function citaj() {
    try { const k = JSON.parse(localStorage.getItem(KEY) || 'null'); if (k && typeof k.ime === 'string' && k.ime.trim()) return k; } catch (e) {}
    return null;
  }
  const ime = () => { const k = citaj(); return k ? k.ime : ''; };
  const ocisti = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, 60);

  function postavi(v) {
    const n = ocisti(v);
    if (!n) return false;
    try { localStorage.setItem(KEY, JSON.stringify({ ime: n, datum: Date.now() })); } catch (e) { toast('⚠ Ime nije spremljeno (nema mjesta)'); return false; }
    uredi = false; render();
    try { W.dispatchEvent(new Event('usf-korisnik')); } catch (e) {}
    return true;
  }
  function ukloni() { try { localStorage.removeItem(KEY); } catch (e) {} uredi = false; render(); try { W.dispatchEvent(new Event('usf-korisnik')); } catch (e) {} }

  function render() {
    if (typeof document === 'undefined') return;
    const k = citaj(), box = document.getElementById('set-korisnik-box'), chip = document.getElementById('meni-korisnik');
    if (chip) { chip.hidden = !k; chip.innerHTML = k ? `<i>👤</i><b>${esc(k.ime)}</b>` : ''; }
    if (!box) return;
    if (!k || uredi) {
      box.innerHTML = `<div class="kor-red"><input id="set-korisnik-ime" type="text" maxlength="60" autocomplete="name" placeholder="Ime i prezime" value="${esc(k ? k.ime : '')}" aria-label="Ime korisnika"><button type="button" data-a="spremi">Spremi</button></div>${k ? '<div class="kor-red kor-dno"><button type="button" data-a="odustani">Odustani</button><button type="button" class="opasno" data-a="ukloni">Ukloni</button></div>' : ''}`;
    } else {
      box.innerHTML = `<div class="kor-red"><div class="kor-ime"><b>${esc(k.ime)}</b><small>Upisano ${new Date(k.datum).toLocaleDateString('bs-BA')}</small></div><button type="button" data-a="uredi">✏ Uredi</button></div>`;
    }
  }
  // Otvori Postavke → Aplikacija i stavi kursor u polje za ime
  function unesi() {
    uredi = true;
    if (typeof switchMainTab === 'function') switchMainTab('postavke');
    if (W.USFTabovi) W.USFTabovi.izaberi('postavke', 'app');
    render();
    setTimeout(() => { const i = document.getElementById('set-korisnik-ime'); if (i) { i.scrollIntoView({ block: 'center' }); i.focus(); i.select(); } }, 80);
  }

  function init() {
    render();
    const box = document.getElementById('set-korisnik-box'); if (!box) return;
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      const a = b.dataset.a;
      if (a === 'spremi') { const i = document.getElementById('set-korisnik-ime'); if (!postavi(i && i.value)) toast('⚠ Upiši ime'); else toast('👤 Korisnik: ' + ime()); }
      else if (a === 'uredi') { uredi = true; render(); const i = document.getElementById('set-korisnik-ime'); if (i) { i.focus(); i.select(); } }
      else if (a === 'odustani') { uredi = false; render(); }
      else if (a === 'ukloni' && confirm('Ukloniti korisnika aplikacije?')) ukloni();
    });
    box.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'set-korisnik-ime') { postavi(e.target.value); } });
  }

  W.USFKorisnik = { ime, citaj, postavi, ukloni, unesi, render };
  if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init(); }
  if (typeof module !== 'undefined') module.exports = { citaj, ime, postavi, ukloni, ocisti };
})(typeof window !== 'undefined' ? window : globalThis);
