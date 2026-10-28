// =====================================================================
// FIREBASE INIT — GeoForest
// ---------------------------------------------------------------------
// Bez login ekrana (korisnička odluka): svaki uređaj se prijavljuje
// ANONIMNO (Firebase Anonymous Auth) čim ima interneta — dobija stabilan
// UID bez ijednog polja za unos. Security Rules zatim dozvoljavaju čitanje
// svima (i anonimnim korisnicima), a upis admin-only podataka (FIRMS/GFW/
// CDSE ključevi) samo UID-ovima upisanim u usf_admins kolekciju — vidi
// firebase/firestore.rules i firebase/README.md za postupak dodavanja admina.
//
// Projekat "elaborat-256d3" — POSTOJEĆI Firebase projekat korisnika (dijeli
// se sa drugom aplikacijom). Sve kolekcije ove app-e nose usf_ prefiks (vidi
// firebase/firestore.rules) da se ne miješaju sa tuđim podacima u istom
// projektu. apiKey ovdje NIJE tajna — identifikuje projekat, ne autorizuje
// pristup (stvarna zaštita je u Firestore Security Rules).
// =====================================================================
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyC2vO6URXakJAr3PBk2sfi-quShUUdnmyo",
  authDomain: "elaborat-256d3.firebaseapp.com",
  databaseURL: "https://elaborat-256d3-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "elaborat-256d3",
  storageBucket: "elaborat-256d3.firebasestorage.app",
  messagingSenderId: "871340682406",
  appId: "1:871340682406:web:980cb8609ca3c6a41ed867",
  measurementId: "G-J0TXVHHFCM"
};

let fbApp = null, fbAuth = null, fbDb = null, fbUid = null;

// Anonimna prijava samo kad ima interneta i dok se ne snima trag; istek 15 s, ponovo pri povratku veze
async function _fbPrijava() {
  if (!fbAuth || fbAuth.currentUser) return;
  try { if (navigator.onLine === false || (typeof _anyRecOn === 'function' && _anyRecOn())) return; } catch (e) { return; }
  try { await Promise.race([fbAuth.signInAnonymously(), new Promise((_, odbij) => setTimeout(() => odbij(new Error('istek')), 15000))]); } catch (e) { /* offline rezerva: UID se uzme kad veza dođe */ }
}
window.addEventListener('online', () => { _fbPrijava(); });

async function _fbInit() {
  if (!FIREBASE_CONFIG) return; // konfiguracija još nije postavljena
  if (typeof firebase === 'undefined') return; // SDK nije učitan (offline prvi put)
  try {
    fbApp = firebase.initializeApp(FIREBASE_CONFIG);
    fbAuth = firebase.auth();
    fbDb = firebase.firestore();
    // Perzistentan lokalni keš — offline-first čitanje kad nema interneta
    // (Firestore SDK ionako radi offline-first, ovo samo produžava keš preko restart-a).
    try { await fbDb.enablePersistence({ synchronizeTabs: true }); } catch(e) { /* više tabova/nepodržano — nastavi bez perzistencije */ }
    fbAuth.onAuthStateChanged(user => {
      if (user) { fbUid = user.uid; _fbOnReady(); }
    });
    await _fbPrijava();
  } catch(e) {
    console.error('Firebase init greška:', e);
  }
}

// Pozovi kad je UID dostupan — Postavke panel ga prikazuje da ga korisnik
// može poslati administratoru za dodavanje u usf_admins (vidi firebase/README.md).
function _fbOnReady() {
  const el = document.getElementById('set-uid-txt');
  if (el) el.textContent = fbUid;
  try { window.dispatchEvent(new Event('usf-fb-ready')); } catch(e) {}
}

_fbInit();
