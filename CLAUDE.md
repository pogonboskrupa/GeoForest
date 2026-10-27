# GeoForest — napomene za agente

GeoForest je ZASEBNA Android app (WebView + offline web paket) nastala iz Grmeč Navigatora
(`pogonboskrupa/FOREST-UNA-SANA`, `codex-forest` v3.0.0). Instalira se uporedo s Grmeč Navigatorom:
drugi package, drugi podaci, drugi update kanal.

## Pravila (APK, verzija, release)

- **Krajnji proizvod je APK** (`android/`, Android WebView) i mora raditi **offline**. Web paket se kopira u
  `android/app/src/main/assets` skriptom `android/copy-assets.sh` (`.ps1` za Windows); skripta PADA ako fali
  offline fajl — svaki novi modul/CSS/podatak dodati u njenu listu i u `sw.js` `APP_SHELL`.
- **Glavna grana je `claude/serene-tesla-piw1y5`** — s nje CI (`.github/workflows/build-apk.yml`) gradi APK i
  objavljuje GitHub Release `vX.Y.Z`; updater u app-u (`MainActivity.UpdateBridge`) čita
  `api.github.com/repos/pogonboskrupa/GeoForest/releases?per_page=1` (prerelease, zato ne `/latest`).
  Ostale `claude/**` grane CI samo gradi (provjera), bez release-a.
- **Package `ba.spd.geoforest`** (debug suffix `.debug` ostaje; CI gradi `assembleDebug`). FileProvider =
  `${applicationId}.fileprovider`. Imena JS mostova (`addJavascriptInterface`) se NE mijenjaju.
- **Potpis**: jedan stalni ključ iz `android/generate-keystore.sh` (`geoforest-release.keystore`, alias `geoforest`)
  → GitHub Secrets `GEOFOREST_KEYSTORE_B64`, `GEOFOREST_STORE_PASSWORD`, `GEOFOREST_KEY_ALIAS`, `GEOFOREST_KEY_PASSWORD`.
  Keystore i lozinke NIKAD u repo. Bez secreta CI gradi APK nasumičnim ključem i PRESKAČE release (update preko
  instalirane app traži isti potpis).
- **Verzija** x.y.z (svaka cifra 0–9; poslije z=9 raste y). Diže se SINHRONO na 4 mjesta:
  `index.html` `APP_VER`, `sw.js` `APP_VERSION`, `static/js/terrain-layers.js` (dva stringa `vX.Y.Z`),
  `build-apk.yml` `# APK_RELEASE_VERSION=`. CI pada ako se ne slažu i sam upisuje u `build.gradle`
  `versionName` i `versionCode = (x−1)·10000 + y·100 + z + 1` (v1.0.0 → 1).
- **Testovi prije svakog commita**: `for f in tests/js/*.test.js; do node "$f"; done` i Java testovi iz
  `android/test-java` (javac/java koraci u `build-apk.yml`, paket `ba.spd.geoforest`). Sintaksa inline skripti:
  `new Function(src)` nad svakim `<script>` blokom u `index.html`.
- **Security**: bez PIN-a i FORMATA PIN-a u repou/commitu/testu; korisnički sadržaj u `innerHTML` uvijek kroz
  `_escHtml`/escape; `firebase/firestore.rules` ne slabiti. Svaki mrežni poziv ima istek (AbortController ili
  `reliableFetch`), loading stanje i rezervu bez signala.
- `index.html` se NE povećava — nova logika ide u module `static/js/`, stilovi u `static/css/geoforest.css`.
- **Desktop se NE objavljuje**: nema GitHub Pages workflowa. `pogonboskrupa.github.io` je zajednički domen sa
  Grmeč Navigatorom (localStorage/IndexedDB se dijele po domenu, ne po putanji, a ključevi `usf_*` su isti) —
  Pages bi miješao podatke. Postavke → Prikaz (auto/računar/mobilni) ostaje samo kao opcija prikaza.

## Mogućnosti (Meni)

- **Rad na terenu**: Primka (`primka.js`, `USFPrimka`), Sjekačke linije (`sjekacke.js`, `USFSjek`),
  Inventura šuma (`inventura.js`, `USFInv`).
- **Karte**: Učitaj kartu (offline .mbtiles/.sqlitedb + server uz PIN), Učitaj KML (lokalno + server uz PIN).
- **Alati**: Tragovi, Mjerenja (`mjerenja-profil.js`, `nagib-poligon.js`), Tačke i fotografije (`tacke.js`, izvoz KMZ).
- Uklonjeno iz Grmeč Navigatora (i iz koda): Šumarstvo, Sušenje-potkornjak, Požari, Projektovanje šumskog puta,
  Tematska karta, PIN sekcija. Firebase (`firebase-init.js`) ostaje; Firestore sada nema korisnika osim UID-a u Postavkama.

## Karte tab i Postavke (v1.0.0)

- **Tab Karte** (`karte-panel`) = tri taba (`static/js/tabovi.js`, `USFTabovi`, `data-tabovi="karte"`, izbor u
  `usf_tab_karte`): **📱 Na telefonu** (`#kh-gran` granice odjela, `#kh-offline-kartica`, `#kh-lista` moji slojevi,
  KML preglednik, Editor slojeva, `#kh-pregled`), **☁ Server** (`#kt-pin` stanje PIN-a, `#kt-srv-karte` karte iz
  `karte_drive.json` + `karte_github.json` — `static/js/karte-tab.js`, `USFKarteTab`: `statusKarte` na telefonu >
  preuzima se % > spremno > uz PIN, veličina, traka napretka, pregled lokalne karte; `#kh-server` KML sa servera),
  **🌍 Podloga i teren** (`#kh-razmjera`, bazna karta, Nagib terena, Ekspozicija i sjenčenje). `_khStat` i
  `_driveKarteRender` zovu `USFKarteTab.render()`; preuzimanje i dalje `_dkPreuzmi`/`_dkOtkljucaj`/`_dkPrekini`.
- **Postavke** = četiri taba (`data-tabovi="postavke"`): Aplikacija (ažuriranje), Prikaz (🎨 šablon interfejsa,
  prikaz po razmjeri, koordinate i dugmad, desktop/mobilni), GPS i trag, Podaci (kopija, memorija, Protomaps, napredno). Sekcije su
  otvorene kartice `section.set-kar` (`#set-s-*`); `_setSkok(id)` prvo otvori tab (`USFTabovi.otvoriZa`).
- **Šablon interfejsa** (`static/js/postavke.js`, `_setSablon`): Standardni / Teren (svijetla podloga, krupan tekst, dugmad 125 %) /
  Noć / Kompaktni — postavlja ključeve `_uiPrikaz` (tema, providnost, veličina, oblik/debljina dugmadi), NE koordinatni sistem
  ni „šta se prikazuje”; ručna izmjena = „Prilagođeno”. **Prikaz po razmjeri** (isti modul, `_prRazmjera`, `usf_prikaz_razmjera`):
  tragovi, KML/SHP, sjekačke linije (`sjek`, `USFSjek.osvjezi`; uvijek vidljive tokom vodiča/crtanja/uređivanja), tačke, mjerenja;
  čipovi 1:5 000…1:250 000, vlastita vrijednost i „📍 Trenutna razmjera”; status „Sada vidljivo/sakriveno”.
- **Šablon dugmadi na mapi** (`postavke.js`, `_setBtnSablon`, `_uiPrikaz.btnStil` → `<html data-btn-stil>`): Staklo (zadano, postojeći CSS) /
  Čvrsto / Kontrast / Akcent / Minimal. Stil u `geoforest.css` samo lokalno prepisuje `--ui-*` varijable teme na `.map-ctl, #layer-btn,
  #zoom-grp, #ab-loc:not(.active)`; šablon uz stil postavlja i `btnA/btnZ/btnOblik/btnIk`. Pregled u Postavkama (`.bs-pr`, klase `.bs-btn/.bs-pill`,
  NE `.map-ctl`) koristi iste vrijednosti. Šabloni interfejsa nose i `btnStil`.
- **Modali i plutajući prozori** (blok „Modali i plutajući prozori (v1.0.5)” u `geoforest.css`): Mjerenja `#msr-panel`, Tragovi `#tragovi-panel`,
  Moja lokacija `#ab-loc-popup`, traka snimanja `#rec-bar`, dijalozi `#dlg-sheet`, kartica objekta `.pk-pop`, nova tačka `#tk-sheet` — čvrsta tamna
  ljuska (2 px okvir), ručica `::before`, naslov 18 px, dugmad ≥ 52 px (primarna puna zelena, opasna crvena), prekidači 56×32. Samo CSS; ID-ovi i JS isti.
- **Alati u modalu Moja lokacija (v1.0.7)**: na karti (`#map-fabs`) je samo `#ab-loc`; Mjerenja (`#ab-msr`), Tragovi (`#ab-tragovi`) i Nova terenska tačka (`#ab-tacka`) su red `.loc-alati` (velika dugmad ikona + natpis) u `#ab-loc-popup`. Isti ID-ovi, pa `_updTragFab` (`.recording/.paused`) i `.active` mjerenja rade; klik prvo zatvara modal (`_toggleLocPopup()`). Dok se snima trag (`body.rec-on`) su `#map-fabs` i modal skriveni. Opcija položaja dugmadi je uklonjena.
- **Mjerenja — crtanje i kraj (v1.0.8)**: dok se mjeri (`#msr-panel.active`) panel je samo uska traka s dugmadi (Završi/Undo/Obriši/Zatvori; statistika i upute skriveni, vidi se karta). „Završi” (`msrStop` → `_msrRegAddFromActive`) sklanja panel i otvara karticu s podacima (`_msrOpenPopupNa`) na središtu mjerenja.
- **Postavke — sklopive kartice (v1.0.9)**: svaka `section.set-kar` je zadano SKLOPLJENA (klik na `.set-kar-h`, strelica, `aria-expanded`); otvorene se pamte u `usf_set_otv` (`postavke.js`: `_setSekPostavi`, `_setSekOtvori`; `_setSkok` otvori i karticu).
- **Karte — „Prikaži granice odjela” (v1.1.2)**: na vrhu taba (`#kh-gran-sve`, iznad podtabova) jedan prekidač za SVE KML/KMZ/SHP slojeve s poligonima (`_kmlPoligonskiSlojevi`, `_khGranSve`/`_khGranSveVid`). Uključeno: prikaže ih (i „Granice taksacije” izlazi iz „samo za odabir”); isključeno: „Granice taksacije” ostaje izvor za izbor odjela (`samoOdabir`), ostali poligonski slojevi se skrivaju (`vis=false`). Skriven kad nema poligonskih slojeva. Kartica „Granice odjela” u tabu Na telefonu ostaje za pojedinačni sloj.
- **Donji bar** (`#main-tabs`, nav): SVG ikone, tab 50 px, svaki tab ima svoju boju `--tc` (Mapa zelena, Karte plava, Meni žuta, Postavke ljubičasta): ikona/natpis u boji, aktivni tab pun u toj boji (v1.1.0); `--dock-b` = 66 px (+ safe-area).
- Dizajn za sunce i rukavice (`static/css/geoforest.css`, učitava se POSLIJE inline stilova): tabovi 64 px,
  dugmad ≥ `--gf-tap` (52 px), tekst ≥ 14 px, stanje = ikona + tekst. Test `tests/js/karte-tab.test.js`.
- **Liste karata sa servera** (opcija A): app čita `karte_drive.json`, `kml_drive.json`, `karte_github.json` sa
  `raw.githubusercontent.com/pogonboskrupa/FOREST-UNA-SANA/codex-forest/static/data/` (`_DK_URL`) — ista lista
  i isti mjesečni PIN kao Grmeč Navigator; ugrađene kopije u `static/data/` su offline rezerva. Alati
  `tools/karta_drive_dodaj.mjs`, `karte_pin_migriraj.mjs`, `karte_pin_produzi.mjs` rade nad listom u tom repou.
- **Teren**: lokalni DEM `static/data/dem_opcine.tif` (`dem-local.js`, `USFDem`, sam učitava `static/libs/geotiff.js`)
  + Terrarium pločice (`_getTerrariumTile`/`_terrariumDecodeTile`, blok TEREN u `index.html`, keš `_TERR_CACHE`).
- **Izvještaj odjela** (`odjeli.js`): samo teren (nagib %, visine, ekspozicija, ruža), slika A4 i izvoz KML/CSV.
- Korisnik aplikacije (ime) i font Dancing Script su uklonjeni.
- Rezervna kopija piše `app: 'geoforest'`, a prima i kopiju Grmeč Navigatora (`_KOPIJA_APP`) — isti `usf_` ključevi.

## Detalji naslijeđenih modula

- **Offline karte (.sqlitedb / MBTiles)**: sve što treba da se `.sqlitedb`
  prikaže (obrnuti zoom 17 − z, šeme, pane-ovi, testovi) je u
  [`docs/offline-karte-sqlitedb.md`](docs/offline-karte-sqlitedb.md).
- **Prvi uvoz offline karte (APK)**: karta se odmah otvara iz IZVORNOG fajla (SAF uri →
  `openFileDescriptor` → SQLite na `/proc/self/fd/N`, samo čitanje, `otvoriIzIzvora`), a trajna
  kopija u `offline_maps` ide u pozadini (`trajnaKopija` + `KopijaKarte`: `.part`, provjera
  dužine i zaglavlja, rename; napredak `_sqlKopija` → status i lista). Gotova kopija zamijeni
  bazu u `mbtilesDatabases`, stara se zatvara poslije 5 s. `native_mbtiles_izvor` (id → uri)
  ⇒ poslije ubijanja app-a `listMaps` otvori iz izvora i kopira ispočetka. Bez fd-a / greške
  ⇒ stari tok (kopija pa otvaranje). Test: `android/test-java/KopijaKarteTest.java`.
- **Prikaz nativnih pločica (APK)**: `_NativeSqlTileLayer` (L.TileLayer, `<img>` sa
  `https://appassets.androidplatform.net/mbtiles/<id>/{z}/{x}/{y}` → `interceptMbtilesTile`,
  nema pločice = 204) — NE sinhroni `AndroidMbtiles.getTile` po pločici (blokirao zumiranje).
  sw.js `/mbtiles/` NE presreće (inače prazne pločice + keš raste); i SW klijent zove interceptor.
  Rezerva: dok nijedna pločica nije stigla URL-om, greška pita most `getTileDataUri`; ako most
  ima pločicu ⇒ `_mostSamo` (204 ne prebacuje). Java: do 3 read-only čitača po karti
  (`citac`/`noviCitaci`, ista putanja i za `/proc/self/fd`), `TileSchema.yRed` pamti orijentaciju Y.
- Leaflet: svaki `pane: 'x'` mora imati `map.createPane('x')`; sloj koji treba
  biti iznad offline podloge (`offlineBasePane`, z 210) mora imati vlastiti pane.
- **Klik na kartu** ide kroz `_kartaKlikIzvor` (index.html), ne kroz DOM
  događaje slojeva: u canvas modu gornji pane pojede dodir donjeg. Novi sloj koji
  treba popup registruje izvor i ima `pointerEvents='none'` na svom pane-u.
- `map` je `const`, `lastP` je `let` — leksički globalni; `window.map` je
  `<div id="map">`. U modulima koristiti gola imena (`typeof map !== 'undefined'`).
- **Snimanje traga na slabijem telefonu**: paket iz native bafera (npr. sat pod zaključanim
  ekranom ≈ 1800 tačaka) ide uz `_tragSerija` — bez crtanja/statistike po tački, linija
  `setLatLngs` jednom (prije ~26 s zamrzavanja na 4× sporijem CPU-u). Dužina u traci je
  inkrementalna (`_tragDuzina`), NE `_tragCalcLen(_tragPts)` po tački. Xiaomi/HyperOS: osim
  baterije treba Autostart (`AndroidGps.jeXiaomi/otvoriAutostart`, jednokratni savjet + Postavke).
  Mrežni zahtjevi bez `reliableFetch` moraju imati istek (AbortController), inače slab signal visi.
  Serija ide kroz `_tragDodajSeriju` (drain I oporavak `_crashCheck`); snimak samo `_tragSnimak()`.
  Prekidi GPS-a (> 60 s bez fiksa ≤ 50 m, pauza ne broji): `_tragPrekidi` u snimku → `t.prekidi`
  {n, maxS} u popup-u traga i toastu „Trag sačuvan“ — dokaz s terena. Prije starta probni upis
  0,9 M znakova (`_tragProvjeriProstor`). GpsService: odbijen
  `startForeground` (Android 12+ restart iz pozadine) ⇒ uredno `stopSelf`, ne pad; `onTaskRemoved`
  samo osvježi obavijest. Test bafera: `android/test-java/NativeGpsBufferTest.java`.
- Terenske tačke (`static/js/tacke.js`): localStorage `usf_tacke`, fotografije u
  IndexedDB `usf_foto`; APK kamera ide kroz `imageIntent()` u MainActivity.
  `nova(la, lo, {gps, foto})`: gps/foto su ZASTAVICE — ne smiju u tačku (`foto:true` je gazio niz
  fotografija ⇒ „Slikaj” nije otvarao ništa); test `tests/js/tacke.test.js`.
- **Sjekačke linije** (Meni → Rad na terenu, `static/js/sjekacke.js`): poligon (crtanje dodirom/
  GPS-om, mjerenje, KML, odjel) → paralelne linije u smjeru dominantnog pada (DEM preko
  `npVisinaNa` iz nagib-poligon.js); linija = granica sjekačke partije, UVIJEK uz
  padinu (obaranje). Prva linija 1 širinu od granice, dublje (≤ 1,6×) ako je rub
  uzak; preuska zadnja partija → `slRaspored`; nema linija/komada < 100 m. Obrisane
  linije: `p.izbrisane` (ključ = udaljenost od ruba), id linije = položaj, ne broj.
  Brojanje `p.brojanje` 'L'/'D' (gledano uzbrdo). Ručni lom: `lin.geo` [dno…vrh]
  (`slGeo`, vodič po segmentima) — čuva se uz id kroz brisanja i prenumeraciju.
  Provjera izohipse: uzorak svakih 40 m, pad zaglađen ~150 m (`padGlatko`), nagib < 8 %
  se ne broji; > 25 % dužine s odstupanjem > 45° ⇒ `lin.izo`. Crveno se crta SAMO dio koji ne ide uz
  padinu (`lin.izoGeo` iz `slIzoDijelovi`; bez `lin.izo` samo komadi ≥ 80 m). Checkbox „Plohe gdje linije ne idu
  uz stranu” (`p.plohe`, providnost `p.plohaOp`): `racunajPlohe` — mreža 20–40 m, pravac najbliže linije vs
  zaglađen pad → `p.izoPlohe` (obris `slTrakaObris`), računa se pri uključivanju i u `generisi`. Plan 'teren' = lepeza
  pravih linija (`slLepeza`: svaka svoj pad, skretanje susjeda ograničeno, provjera
  stvarnog razmaka ≥ 60 % `slMinRazmak`) → `lin.teren`. Linije pada (flow lines)
  NE koristiti: slijevaju se u jarke i sabijaju partije. localStorage `usf_sjekacke`; izvoz KML:
  linije po statusu + tačke-natpisi (`ExtendedData usf_oznaka`) koje "Učitaj KML"
  crta kao stalnu etiketu. Uvoz projekta i "odjel pod centrom" su uklonjeni.
  Drugi pad (`p.zona` {lid, strana, az}): poligon se dijeli sjekačkom linijom
  (`slPodijeli`), drugi dio dobija svoj pad i linije s id prefiksom `z:` koje završavaju
  na toj liniji; numeracija ide preko oba dijela. Pri pravljenju korisnik bira „prema liniji prije/poslije”
  (`zonaSusjedi` po `br`, `slZonaStrane` = strana koja sadrži sredinu prethodne linije) → `zona.smjer`. GPS vodič snima trag (`lin.trag`),
  „Završi liniju“ ⇒ `lin.stvarna` (slGeo je preferira). Površina partije po liniji
  (`lin.ha`): od granice do L1, L1–L2 … (`slPoljaTeren` po dijelu, `slSpojiTrake`,
  `slTrakeULinije`); stvarna linija se računa kao produžena do granice.
  Vodič snima preko native GpsService (`window.usfPozadina.pocni/zavrsi`, isti zajednički
  bafer kao "Snimi trag" — `_drainNativeGpsBuffer` predaje tačke svim slušaocima
  `_bgSnimanja`): radi pod zaključanim ekranom; `usf_sjek_vodic` nastavlja vodič poslije
  ubijanja app-a. Površina (ha) samo u popup-u linije, ne na karti.
  Alternativni prikaz (`p.prikaz='padine'`, `p.padine` {dijelovi, granice}): `citajPadine` čita
  DEM mrežu 12–25 m → `slPadineMreza` (zaglađivanje, vrhovi histograma ekspozicije ≥ 60°
  razmaka + k-means, modus, komponente, spajanje malih/sličnih < 35°) → granice greben/jarak
  (`slGranicaLinija`) → `slRazdijeli` (slPodijeli redom; granica s krajem dalje od ruba čeka).
  Svaka padina svoj pad, linije id `pN:`, `izbrisane` po padini; padina s izo linijama
  dobija lepezu; partije se NE spajaju preko grebena (ostatak po padini). Računa se pri
  pravljenju projekta, prekidač Osnovni/Alternativni u panelu.
  Spajanje (`spojiPadine` → `slSpojiLinije`/`slSpojiGeo`): linije susjednih padina čiji su krajevi ≤ `p.spoj`×razmak
  (zadano ½; Ne/Blizu/Srednje/Šire u panelu) i uz granicu padina postaju JEDNA krivudava linija (id `m:<id>+<id>`,
  `spoj` geometrija, `komp` [{id, padina, k, geo}]); spajaju se samo linije bez stanja. Spoj je glatak
  (`slSpojiGlatko`: krajevi skraćeni ≤ 30 m, kubna Bezier tangentna na oba dijela — ne oštar lom). Slobodni kraj
  na granici padina produži se pravo do ruba poligona (`slProduzi`: ≤ 2×razmak, ≥ 0,4×razmak od drugih linija;
  i nespojene linije, u `spoj`). Površine `slPoljaPadine`: po padini, ćelija susjedne padine bliža produžetku nego
  vlastitim linijama (≤ razmak) ide partijama izvorne; spojena = zbir dijelova; obris/brisanje po `komp`, izo = najgori dio.
  Partija = od prethodne linije do linije (L1 od granice), zadnja partija = od zadnje linije do granice (`p.ostatakHa`,
  popup zadnje linije). Padine: spojena linija preko grebena ide u jednoj padini uzbrdo, u drugoj nizbrdo ⇒ ta padina
  se gleda obrnuto (`slOrijentacija` → flip); numeracija preko padina `slRedoslijed` (topološki iz nizova po padini);
  traka m u redu numeracije → m-ta linija, traka iza zadnje linije padine → sljedeća linija ako dodiruje padinu
  (≤ ½ razmaka), inače zadnja partija. `lin.partija` [[padina, traka]] crta obris na klik. `komp.geo` je u SVOM smjeru
  (dno→vrh) — u lancu `obrni`; brojanje bocno s obrnutom linijom bi pomiješalo trake.
  Natpisi (`postaviNatpise`): prioritet + 4 položaja (van kraja linije, dalje, bočno), sakrij
  ako nema mjesta; preračun na zoomend. Klik na liniju crta poligon partije (`slPartija` →
  `slTrakaObris`: ista mreža/klasifikacija kao `slPoljaTeren`, pa površina = `lin.ha`).
  Dijeljenje: KML nosi cijeli projekat (Document ExtendedData `usf_sjekacke` = base64 JSON,
  `usf_fokus` = linija za "📤 Pošalji liniju"); "Učitaj KML"/primljeni fajl → `USFSjek.izKml`
  (otvori ili spoji; Odustani = obični KML sloj). Spajanje `slSpojiProjekte`: plan iz novijeg
  `p.tPlan` (`planIzmjena` pri promjeni rasporeda), stanje linije iz novijeg `lin.t` (`dodirni`
  pri statusu/radniku/lomu/GPS-u). APK prima KML/KMZ iz drugih app-ova (intent VIEW/SEND,
  `launchMode singleTask`, `primiFajl` → `AndroidShare.uzmiDolazni()` → JS `_dolazniFajl`).
  Sačuvana mjerenja NEMAJU bindPopup (zaustavlja dodir) — popup ide kroz `_kartaKlikIzvor`.
  Ime odjela: `napravi(ring, naziv, pitaj=true)` pita dijalogom (`_dlgPrompt`, Odustani = ništa se ne pravi) s prijedlogom iz poligona
  (`imeOdjela`: „Odjel ” + ODJEL · ODSJEK iz atributa, inače naziv) — za izbor iz liste, 🪓 u kartici poligona i „Više odsjeka”; crtanje
  granice već pita ime. Polje „Odjel / odsjek” (`.sl-naziv`, `data-a="naziv"`) preimenuje projekat u kartici (to NIJE izmjena plana — ne zove
  `planIzmjena`); `p.tNaziv`, a `slSpojiProjekte` uzima novije ime.
- **„Samo za odabir poligona”** (KML sloj čije ime odgovara `_KML_POLIGONSKI` = „Granice taksacije…”; `k.samoOdabir`): sloj NIJE na karti
  (`_kmlPrimijeniPrikaz`/`_kmlNaKarti` — jedino mjesto koje dodaje/uklanja `k.grp` sa karte; nema dodira/kartice/natpisa) i služi samo kao izvor
  poligona odjela/odsjeka (nagib, sjekačke linije i Primka čitaju `kmlLs` bez obzira na kartu). Zadano UKLJUČENO pri svakom učitavanju i
  pokretanju; checkbox na kartici sloja (`_kmlSamoOdabir`) isključuje samo dok se radi — stanje se NE čuva. `_kmlPoligoniOdabir` ostaje
  izvor i kad je opcija isključena. Test `primka.test.js`.
- **Mjerenja — dizajn i visinski profil (v2.6.0)**: panel `#msr-panel` ima pločice umjesto reda teksta (`_msrKpi`: glavna vrijednost veliko — dužina / ha / nagib % u boji klase), natpise segmenata i Σ na karti
  (`.msr-seg`, ≤ 30 tačaka), ha u težištu poligona. Profil (`static/js/mjerenja-profil.js`, `USFProfil`): za Udaljenost i Nagib (≥ 2 tačke) i iz kartice sačuvanog mjerenja („📈 Profil”, `_msrProfilSaved`)
  kartica `#pf-sheet` pri vrhu karte: uzorci svakih ≥ 10 m (≤ 160) → visine `npVisinaNa` (lokalni DEM/Terrarium, keš) → `popuni` (rupe), `zagladi`, `statistika` (uspon/silazak s pragom 2 m, nagib zaglađen ~80 m,
  udio dužine po klasama 0–10…>50 %); SVG grafikon (ispuna, linija obojena po klasi nagiba, mreža, ▲▼ min/maks), povlačenje prsta = kursor + tačka na karti i nagib; „🎨 Nagib” boji liniju na karti po klasi (`slojNagiba`).
  Preračun je odgođen 650 ms (`odgodi`) pri svakoj izmjeni tačaka. Bez visina (offline van USK) ⇒ poruka. Test `tests/js/mjerenja-profil.test.js`.
- **Snimanje traga i terenske tačke (v2.6.1)**: povlačenje karte tokom snimanja = slobodan pogled (`_recFreeView`, `map.on('dragstart')`; prije se karta vraćala na GPS pri svakom fiksu); dugme `#rb-go` postaje „🎯 Prati me”.
  Vrste tačke (`KATEGORIJE`): suho/prelomljeno/izvala, potkornjak, bespravna sječa (`sjeca`), imela, silazak sa vlake, loš šumski red, granica odjela, ostalo; stari ključevi (`stablo/steta/put/voda`) idu kroz `STARE_VRSTE`.
  Pri spremanju traga (`_tragRegAdd`) tačke s datumom u vremenu snimanja postaju `trag.tacke` (i `tačka.trag`). „📤 Pošalji” trag: KML / KMZ (linija + tačke + fotografije, `izvozKmz(ids, {naziv, kml})`) / samo fotografije.
  Fotografije s lokacijom: `jpegSaGps` upisuje EXIF GPS u JPEG (canvas ga nema); `podijeliFoto` → APK `AndroidShare.shareFiles` (ACTION_SEND_MULTIPLE; `dokument` ⇒ tip `*/*` pa WhatsApp/Viber ne rekompresuju i ne skidaju GPS), uz tekst s koordinatama i Google Maps linkom.
- **Dugmad na karti (v2.7.0)**: Postavke → 🎛 imaju i „Oblik dugmadi” (oštro/zaobljeno/okruglo → `--btn-r`) i „Debljina ikona” (`--btn-sw`); jedinstven CSS blok iza `#map-fabs, #zoom-grp` (stanje pritiska, fokus, puls za aktivnu lokaciju). Dok se snima trag (`body.rec-on`) su CIJELI `#map-fabs` (mjerenja, tragovi, nova tačka, lokacija) i `#ab-loc-popup` (Snimi trag) SKRIVENI — traka snimanja ima 🎯 i 📷; zoom ostaje.
- **Koordinate i dugmad — dizajn (v2.6.9)**: BEZ zamućenja iza (`backdrop-filter: blur(var(--ui-blur, 0px))`; zadano 0 — providnost znači da se vidi oštra karta); postavka „Zamućenje pozadine” 0–16 px; tema podloge tamna/svijetla (`_UI_TEME` → `--ui-bg/fg/bd/sep/a1/a2`, obris teksta u suprotnoj boji). `#geo-badge` = segmenti `.bseg` (⛰ visina | MGI5 | razmjera) odvojeni linijom; preview u Postavkama koristi iste klase (`.ui-bdg`, `_geoBadgeHtml`).
- **Koordinate i dugmad na karti (v2.6.8)**: Postavke → „🎛 Koordinate i dugmad” (`_uiPrikaz`, `usf_ui_prikaz`, `_setUi`/`_uiPrimijeni`): providnost podloge `#geo-badge` (zadano 55 %, `--bdg-a`), veličina teksta, obris teksta
  (Bez/Tanak/Jak → `--bdg-ts`), koji dijelovi se prikazuju (visina / MGI5 / razmjera; `_geoBadgeRender` iz keša `_geoBadgeLast`), providnost i veličina dugmadi (`--btn-a`, `--btn-z` = CSS `zoom` na `#layer-btn/#zoom-grp/#map-fabs`).
  „Prikaz po razmjeri” ima i 📏 mjerenja (zadano 1:25 000; `_msrDrawAllSaved` ne crta, klik izvor ih preskače). Tab Karte: traka skokova, kartica „🔭 Razmjera” (`_khRazmjera`: trenutna razmjera + šta je sakriveno → Postavke).
- **Meni (v2.6.3)**: samo „Nedavno” (zadnja 3 otvorena odjeljka, `usf_meni_nedavno`, `_meniNedavnoRender`); pilule stanja i pretraga su uklonjeni na zahtjev. Modal Moja lokacija je opet samo GPS/Kompas/Radijus + dugmad (blok koordinate/kopiraj/podijeli je uklonjen na zahtjev); `#map-fabs` je 6 px više da se ne sudara s donjim barom.
- **Stil traga (v2.6.5)**: klik na trag (izvor u `_kartaKlikIzvor`) otvara karticu s „🎨 Stil” → `_tragStilUredi` = isti editor kao KML slojevi (`_kmlStilOtvori`, imaPol:false, živo na karti): boja `t.color`, debljina `t.weight`, providnost `t.op`
  (neprovidnost %), vrsta crte `t.dashStyle` (ključevi editora puna/isprek/tack/crtatack ili stari solid/dash/dot → `_tragDashArray`); bez vrijednosti važe zadane iz Postavki (`_lineStyle`). Tab Karte: „🧭 Slojevi na karti” sadrži i tragove (prekidač + 🎨), pregled ima pločice Tragovi i Mjerenja.
- **Razmjera i prikaz po razmjeri (v2.6.6)**: `#geo-badge` (koordinate gore lijevo) ima i razmjeru `1:25 000` (`_razmjeraTxt`, 2 značajne cifre, osvježava se na zoomend). Postavke → „🔭 Prikaz po razmjeri”: posebna granica za
  slike/tačke, tragove i KML/SHP slojeve (`_prRazmjera` {slike, tragovi, kml}, `usf_prikaz_razmjera`; 0 = uvijek, zadano tragovi 50000 = sakriveni sitnije od 1:50 000; presetovi + „Vlastita…”). `_razmjeraSkriva(vrsta)` je jedino mjesto odluke;
  `_prPrimijeni` na zoomend preiscrta samo grupu čije se stanje promijenilo (`_tragRegAddLayer`, `_kmlPrimijeniPrikaz`, `USFTacke.crtaj`; sakrivene tačke/tragovi nisu ni klikabilni). `let` stanje MORA biti prije `_tragRegAddLayer` poziva (TDZ).
- **Primka — klase, dock, vizuelni panel (v2.5.0)**: tri klase `STATUS` = primljeno / neprimljeno / `sumskired` („Popraviti šumski red”, narandžasta,
  isprekidan rub); nepoznat status ⇒ neprimljeno (`kljucStatusa`). Šumski red nosi `razlozi[]` (`RAZLOZI`), `rok`, `popravljeno`; „✓ Popravljeno”
  (`USFPrimka.popravljeno`) prebacuje u primljeno i pamti datum. „Novi projekat” ODMAH prebacuje na kartu (`izbPocetniPogled` + `izbNaKarti`),
  poslije pravljenja se ostaje na karti uz DOCK `#pr-dock` (fiksni, `dockRender`): 3 velika dugmeta klase → `crtajStatus` (crtanje obojeno klasom, status
  ide u `crt.status`, bez dijaloga), čipovi razloga (`dockSr`), „Cijeli odjel…” (`izbCijeli`). Bez docka (brzi dio bez aktivnog odjela) klasu bira `pitajStatus`.
  Panel: donut `donutHtml` (razmak 2 px, centar % označeno), legenda s ikonom+nazivom (boja nikad sama), KPI pločice, filter čipovi (`filter`, u memoriji),
  dijelovi su `<details class="pr-dio">` (ključ `pid:d:did`). Značke ikona+ha na karti tek pri zoom ≥ 16 (`.pr-badge`). KML stilovi pr/ne/sr. `zbir().radnici[ime]` = {p, n, s, m3}.
- **Primka** (`static/js/primka.js`, `USFPrimka`, panel `primka-panel`): po odjelu dijelovi s PRIMLJENOM / NEPRIMLJENOM robom
  (drvni sortimenti): `p.dijelovi` [{id, naziv, prst (prstenovi, par/nepar), ha, status, m3, brPrimke, sortimenti, radnik, napomena, datum, izvor, t}],
  localStorage `usf_primka`. Novi projekat = „＋ odaberi odjel / odsjeke”: poligoni ISKLJUČIVO iz sloja „Granice taksacije”
  (`_kmlPoligoniOdabir()`), grupisano po odjelu (cijeli odjel ili pojedini odsjeci, pretraga) → `p.poligoni` [{ring, odjel, odsjek}]
  (`prsteni(p)`: poligoni ILI nacrtani `p.ring`), ime „Odjel 12 · a, b”. Projekat postaje AKTIVAN (`usf_primka_aktivni`, banner `#pr-akt`):
  svaki označeni dio (`brziDio`, „Označi dio odjela”) pripada njemu i siječe se po njegovim poligonima (izvan = odbijen); bez aktivnog
  odjel se prepoznaje po KML-u ispod dijela. Stari izbori (mjerenja, bilo koji KML, 🪵 u kartici poligona / „Više odsjeka”) su UKLONJENI;
  „Nacrtaj granice odjela” je UKLONJENO. Pri pravljenju projekta poligoni se PRIKAZUJU NA KARTI (`izbCrtaj`: konture u pogledu pri zoom ≥ 11,
  označeni istaknuti, oznake odjel · odsjek pri zoom ≥ 14, ≤ 900 poligona) i biraju se i dodirom (`izbNaKarti`, traka `#pr-crt` .pr-izbd:
  ✓ Napravi / ☰ Lista / ✕); u listi 🔍 zumira na odjel. Liste u projektu su SKLOPIVE (`<details>`, zadano sklopljene, otvoreno se pamti u
  memoriji `otvoreno` jer se panel iznova crta): ▣ Poligoni odjela, ▥ Dijelovi; isto u Sjekačkim linijama: „Linije” (`sl-det`). Dio: crtanje dodirom/GPS-om (`#pr-crt`, isječeno po odjelu `turf.intersect` v6) ili partije iz
  `USFSjek.partije(pid)` (isti obris kao klik na liniju — `obrisPartije`; + zadnja partija; ključ `izvor` = sjekId:lid, ponovni uvoz
  zadržava status/m³). Ručni dio ima PREDNOST: preklop se oduzima (`primijeniPrednost`/`oduzmi`, turf.difference) od partija i starijih
  dijelova — hektari se ne broje dvaput. Pane `primkaPane` z 414, dodir kroz `_kartaKlikIzvor` (popup: status, uredi, obriši).
  KML izvoz nosi projekat (`ExtendedData usf_primka`); „Učitaj KML” → `USFPrimka.izKml` (otvori/spoji, po dijelu novije `t`). Test `primka.test.js`.
  Zbir po radniku (`zbir().radnici`) u kartici projekta. `USFPrimka.nacrtaj(opc)` = zajednički alat za crtanje (Promise prstena, null = odustao)
  i `USFPrimka.geo` {ha, unutar, isijeci, oduzmi}. „Posječeno po radnicima” u Sjekačkim linijama je UKLONJENO (na zahtjev).
  Rad BEZ poligona: „✏ Nacrtaj dio (odjel se prepoznaje sam)” (`brziDio`) → `odjelPod` (najmanji KML poligon iz `kmlLs`, i ugrađeni odjeli,
  koji sadrži tačku dijela — `turf.pointOnFeature`) → projekat istog naziva (`_odjelOznaka`: ODJEL · ODSJEK) čija granica sadrži tačku, ili novi
  (`napravi(..., tiho)`); bez poligona → projekat „Bez odjela” (`ring: null` — zbir bez površine odjela, KML bez granice). Dodir: prednost je
  površina u PIKSELIMA (`pxPov` = `_pxPovrsina`, kao KML/mjerenja) — s m² je KML odjel uvijek pobjeđivao pa dio nije bio klikabilan; granica
  odjela primke ima karticu (`popupOdjel`: zbir, ✏ Označi dio, Otvori, Sakrij, Obriši) i stoji ispred istog KML poligona (×0,98).
- **Slika u razmjeri (A4, PNG)** (`static/js/slika-karte.js`, `USFSlika.podijeli`): sjekačke linije (dugme „🖼 Slika (A4)”
  u projektu), odjel (kartica poligona i izvještaj odjela → `_odjelSlika`, susjedi istog sloja tanko). Crta se
  vektorski na vlastiti canvas — NE snimak karte (podloge s interneta prljaju canvas, nema tačne razmjere). 200 dpi,
  orijentacija po obliku, razmjera = najmanja standardna (`slkRazmjera`, 1:500…1:200 000) u koju objekat stane;
  reljef + izohipse iz lokalnog DEM-a (`USFDem`, samo 5 općina; `slkIzohipse` marching squares, `slkInterval`),
  mjerilo, sjever (S), legenda, podaci. Dijeljenje kroz `_izvozFajl` (Blob) → `AndroidShare.shareFile` (`image/png`).
  PODLOGA = slojevi pločica koji su trenutno na karti (`map.eachLayer` GridLayer, po z-indexu pane-a): pločice daje
  sam sloj (`createTile`, isti put kao ekran: keš, nativni most, sql.js), zoom `slkZoom` (rezolucija slike, ≤
  maxNativeZoom, ≤ 160 pločica); `l._tileZoom = z` privremeno jer `TileLayer.getTileUrl` čita zoom odatle; obični
  `L.tileLayer` dobija `crossOrigin`. Zaseban canvas: zaprljan (server bez CORS-a) ⇒ odbacuje se, slika s reljefom
  (DEM) kao prije. Ime podloge (offline karta / attribution) u podnožju.
- **Ikone u Sjekačkim linijama** (`static/js/ikone.js`, `USFIk(ime, vel)`): vlastiti set linijskih SVG ikona (24×24,
  `currentColor`) umjesto emojija — Unicode nema motornu pilu, sjekira 🪓 je zamijenjena ikonom `pila`; Sakrij/Prikaži
  = `oko-off`/`oko` (maska prekida konturu oka). SAMO sekcija Sjekačke linije (panel, kartica linije `sl-pop`, vodič,
  crtanje granice, slika A4 preko `USFIkPath` + Path2D u naslovu); `_okoDugme`/`_okoIkona` i emoji u kartici poligona,
  Terenskim tačkama i obavijestima su namjerno netaknuti. Statični HTML: `<span data-ik="pila" data-ikv="22">`
  (hidrira se pri učitavanju). Toast poruke i natpisi na karti ostaju tekst. Test `tests/js/sjekacke-ikone.test.js`.
- **Ikona**: izvor `FOREST_IKONA.png` (GeoForest logo, 1024 px); iz njega `icon-192/512`,
  `icon-maskable-512` (80 % sigurna zona), `apple-touch-icon`, mipmap `ic_launcher*`. Sve
  NEPROVIDNO do ruba (providni uglovi ⇒ Xiaomi/HyperOS crta bijeli okvir i smanjuje ikonu);
  adaptivni foreground: sadržaj ~83 % vidljivih 72dp, umetak 0, pozadina `#184536`;
  splash `drawable-nodpi/splash_logo.png`
  — `<bitmap>` NIKAD na `@mipmap/ic_launcher` (adaptive XML na API 26+ ⇒ pad pri pokretanju).
- **Drive karte za preuzimanje** (Učitaj kartu → „☁ Karte za preuzimanje”): lista
  `static/data/karte_drive.json` (app je čita s raw.githubusercontent codex-forest → nove karte
  bez APK-a). **PIN karata se mijenja svaki mjesec** (isti za Drive karte, Drive KML i GitHub karte): svaki zapis nosi `encm`
  `{ 'm2026-10': šifrat, … }` (13 mjeseci = tekući + 12; poslije zadnjeg mjeseca ZADNJI PIN ostaje važeći — `kljucZa`), Drive ID šifrovan AES-GCM ključem iz PIN-a tog mjeseca
  (PBKDF2-SHA256, `static/js/drive-karte.js`, isti kod app/alat/test). App uzima šifrat TEKUĆEG mjeseca
  (`encZaMjesec`); sačuvani ključ `usf_karte_kljuc` NE ističe: ko je jednom otključao ne unosi PIN ponovo (v1.1.1) — šifrat se uzima za mjesec u kojem je ključ sačuvan (`usf_karte_mjesec`, `encZaKljuc`/`_dkSifrat`); tek ako zapis nema taj mjesec, traži se novi PIN. UI ne piše „važi do kraja mjeseca”. Već preuzete karte
  („✓ Na telefonu”, „✓ Učitan”) NE traže PIN — treba samo za novo preuzimanje. FORMAT PIN-a (pravilo) NIKAD u repo: alati ga uzimaju iz
  `USF_PIN_FORMAT` (tokeni YY/YYYY/MM), kao i sam PIN i link. Dodavanje: `USF_PIN_FORMAT=… node tools/karta_drive_dodaj.mjs "<link>" "Naziv" ["opis"] [MB]`;
  novi niz mjeseci (npr. kad se želi nastaviti rotacija): `USF_PIN_FORMAT=… [USF_PIN_MJESECI=13] node tools/karte_pin_produzi.mjs`. Stariji APK-ovi (< 2.1.6) čitaju `enc` i više ne mogu otključati.
  PIN karata je odvojen od PIN-a sekcija; `_dkOtkljucaj` ga provjerava dešifrovanjem prvog zapisa (greške `usf_karte_greske`). APK: `AndroidKarta.preuzmi`
  → `drive.usercontent.google.com/download?…&confirm=t`, `.part` + Range nastavak, provjera
  „SQLite format 3”, pa uvoz kao `importOfflineMap`. Drive fajl mora biti „Svako s linkom”.
  **KML poligoni s Drive-a** (KML preglednik → „☁ Poligoni za preuzimanje”): isti (mjesečni) PIN, ZASEBNA lista
  `static/data/kml_drive.json` (`karta_drive_dodaj.mjs --kml …`, zapis `vrsta:'kml'`) — stariji APK-ovi čitaju
  karte_drive.json i KML bi prikazali kao offline kartu. APK `AndroidKarta.preuzmiKml` (zajednički `skiniDrive`)
  → cache `kml_drive/<id>.dat` (provjera `<?xml`/`<kml`/PK), JS `_driveKmlKraj` uzme bajtove (`uzmiKml`, briše fajl)
  i učita kroz `_vectorFileChosen` (KMZ, IndexedDB) — stari sloj istog imena se zamjenjuje.
- **Birač fajlova u APK-u** (`onShowFileChooser`): offline karta se prepoznaje u
  `IzborFajla.jeOfflineKarta` po CIJELIM tokenima accept-a (`.dbf` iz KML/SHP birača sadrži
  `.db` — podstring je slao svaki KML u uvoz offline karte). Test: `android/test-java/IzborFajlaTest.java`.
- **Otvorena kartica (popup)**: dodir na kartu je SAMO zatvara (capture `click` listener na
  `map.getContainer()` prije Leaflet-a) — inače dodir unutar odjela odmah otvori novu karticu.
- **KML slojevi trajno**: sadržaj u IndexedDB `usf_kml` (`_kmlSpremi`/`_kmlIdb`), u localStorage
  `usf_kml_layers` samo meta {col, vis, stil, idb:1} — veliki KML nije stao u ~5 MB localStorage i nestajao je
  pri ponovnom pokretanju/ažuriranju. Stari zapisi s `content` se sele pri `_kmlRestore`. SHP se odmah čuva kao KML
  (`_kmlIzGrupe`). Rezervna kopija ubacuje KML tekst u metu (`content`), vraćanje ga piše nazad u IDB.
- **Uređivanje KML/SHP** (`_kmlUrediMeni`, `_kmlUrediPodatke`, `_kmlUrediOblik`, `_kmlObrisiObjekat`,
  lista „▸ Objekti” i 📤 u KML sekciji): `pkml` veže sloj s `<Placemark>` (`_kmlPm`/`_kmlTip`/`_kmlGi`);
  izmjena ide u KML DOM → `XMLSerializer` → `_kmlObnovi` (sloj iznova, `usf_kml_layers`). Stilovi,
  ExtendedData i KMZ slike ostaju. SHP se pri prvoj izmjeni pretvara u KML (`_kmlIzGrupe`). Ugrađeni
  odjeli se ne uređuju. Stil sloja (`_kmlStilOtvori`: paleta/vlastita boja, debljina, puna/isprek/tačk,
  ispuna %) u `usf_kml_layers[ime].stil` → `pkml(doc, col, op, stil)` / `_kmlLeafletStil`. Stil objekta:
  inline `<Style>` + ExtendedData `usf_stil=1`/`usf_crta` (`_kmlUpisiStil`) — `pkml` ga poštuje SAMO uz
  `usf_stil` (tuđi KML stilovi ne mijenjaju izgled); `usf_*` se ne prikazuju u kartici. Uređivanje oblika:
  ↶ poništi (`istorija`), dodir na kartu dodaje tačku (`_kmlUredDodaj`), živa dužina/ha; ➕ novi objekat u
  sloju (`_kmlNoviObjekat`). Ikona Sakrij/Prikaži: `_okoDugme` (SVG oko), ne 🙈. Globalna const/let imena u index.html se NE smiju poklopiti sa static/js
  (`_kmlKoord` u odjeli.js) — test `tests/js/kml-uredjivanje.test.js`.
- **Više odsjeka jednog odjela** (kartica poligona → „☑ Više odsjeka”, `_odsPocni`): dodir na kartu
  uključuje/isključuje poligon (`_odsIzbor`, grana u `map.on('click')`), „Cijeli odjel” bira odsjeke istog
  broja (`_odsOdjel`: atribut ODJEL… ili prvi broj u nazivu) u istom sloju. `_odsSpoji`: `_turfUnija`
  (turf v6 `union(a,b)` / v7 `union(fc)`), pukotine ±1 m bafer; razdvojeni ⇒ samo izvještaj. Predaja:
  `npIzPrstena`, `USFSjek.izPrstena`, `_odjelIzvjestajGj` (odjeli.js `_odjelIzvjestajZa`).
- JS `alert/confirm/prompt` u APK-u: MainActivity `onJs*` s naslovom `app_name`
  ("GeoForest") — bez override-a WebView piše appassets.androidplatform.net.
- **Sačuvaj sliku (A4)** (Sjekačke linije, dugme `slika-sac`): `USFSlika.sacuvaj` — APK `AndroidDownload.save` (Downloads, MediaStore),
  desktop `<a download>`; „Slika (A4)” i dalje otvara share sheet.
- **Kartica poligona i providni prikaz**: popup KML objekta je širi (≤ 440 px, max 72vh, `touch-action: pan-y`); poligon NEMA „Obriši”
  (brisanje samo linija/tačaka; projekat Sjekačkih linija ima svoj „Izbriši”). „🖼 Sačuvaj sliku” → `_odjelSlika` → `USFSlika.sacuvaj`;
  susjedi na slici = svi poligoni slojeva koji su na karti (`x.sloj._map`). Stil sloja/objekta „Providno (samo dodir)” = `stil.providno`
  (`_kmlLeafletStil`: opacity 0, fillOpacity 0.001 — geometrija ostaje za klik; objekt: ExtendedData `usf_providno`). Test `tests/js/kml-providno.test.js`.
- **Slika odjela bez teksta** (`opis.cista`, samo `_odjelSlika`): jednaki bijeli okvir 36 px sa svih strana, nema zaglavlja/mjerila/legende/podnožja ni natpisa
  susjeda; „S” ispod strelice izostavljen. Pita se `prompt` za natpis (`opis.natpisGore`, gore u sredini; prazno = bez ičega, Odustani = ne sprema).
  Glavna granica (`glavni`) ima bijeli rub ispod crte da se ne gubi na podlozi (važi i za sjekačke linije).
- **Slika odjela — linije poligona**: SVE crno isprekidano, ISTO (odjel i susjedi 9 px `[30,14]` s bijelim rubom, `rub`), bez crvene; natpisi odjela i susjeda ostaju na slici (`_odjelOznaka`: atribut ODJEL · ODSJEK, inače naziv) — kao štampana granica na podlozi.
- **Sjekačke linije — sve projekte odjednom**: traka na vrhu liste (`sl-sve`): „Sakrij sve / Prikaži sve” (`p.vidljiv` svih, prekidač po stanju) i „Obriši sve (N)” (confirm, `pisi([])`, gasi vodič).
  Obrađuje se u `akcija` PRIJE `nadji(id)` (dugmad nemaju data-id). Test `tests/js/sjekacke-sve.test.js`.
- **Karte iz GitHub releasea** (`pogonboskrupa/KARTE`, Učitaj kartu → „☁ Karte za preuzimanje”): ZASEBNA lista `static/data/karte_github.json` (`id, naziv, opis, mb, url` — javni
  `…/releases/download/<tag>/<fajl>`, bez `enc`/`encm` (URL je javan, ali dugme je iza istog mjesečnog PIN-a — samo zaštita izbora); NE u karte_drive.json jer stariji APK-ovi zapis bez `enc` dešifruju i brišu ključ). Isti nativni tok `AndroidKarta.preuzmi`
  (`skiniDrive`: redirekti, Range, `.part`); Java dozvoljava samo drive.usercontent i taj GitHub prefiks (`jeDozvoljenaKarta`). DRAFT release se ne može skinuti — mora biti objavljen.
  Novu kartu: upload u release, pa dodati zapis u listu (nova lista na `FOREST-UNA-SANA` `codex-forest` radi bez APK-a). Test `tests/js/karte-github.test.js`.
- **Izbornik 🗂 (gore desno, `#layer-switch`)**: mrežne podloge, pa ispod njih okvir `.ls-offline` (zadebljan border, naslov „🗂 Offline karte”, ≤ 34vh uz skrol) sa SVIM offline kartama
  (`_sqlmapSyncLayerSwitch`, jedan dodir = `_sqlmapSelect`; ime bez .sqlitedb/.mbtiles).
- **Editor slojeva** (tab Karte → kartica „🎨 Editor slojeva” s dugmetom — kartica NE nabraja slojeve; `_kedListaOtvori` = list sa svim fajlovima (mini pregled,
  pretraga > 6; dodir = stil, 👁 vidljivost, 🔍 Na karti, ✏ Objekti → KML preglednik s otvorenim objektima; poslije editora vraća se u listu); isto dugme boje u KML pregledniku
  i „🎨 Boja, linija i ispuna” za objekat): `_kmlStilOtvori` = list s kartama **Linija** (boja, debljina 0,5–10, providnost linije, puna/isprek/tačk/crta-tačka, „Samo dodir”),
  **Ispuna** (providnost ispune 0–100 % + brzi izbor, boja ispune odvojena od linije ili „Ista kao linija”), **Oznake** (samo za sloj: natpisi). Šabloni (Granica odjela, Odjel, Put…),
  SVG pregled `_kedSvg`, ŽIVA primjena na karti (`uzivo`); Odustani vraća stil (objekat iz snimka `o0` — Leaflet setStyle mijenja options) i natpise (`ozn0`).
  Model `stil`: { w, crta, op (neprovidnost linije %), ispuna (%), ispunaBoja, providno } → `_kmlLeafletStil`; objekat u KML: LineStyle alfa = op, PolyStyle boja = ispunaBoja.
  Natpisi: localStorage `usf_oznake` po imenu sloja {on, polje, vel, boja, pozadina} (`_oznOsvjezi`: ne-interaktivni divIcon, zoom ≥ 12, ≤ 250). Testovi `oznake.test.js`, `kml-providno.test.js`.
- **Zadani stil novog fajla** (`_KML_STIL_NOVI`: puna linija 2 px, 90 %, ispuna 12 %) — KML/KMZ (i preuzet sa servera) i SHP; čuva se u meti sloja. Natpisi zadano isključeni.
  „↻ Osvježi” sloja sa servera ZADRŽAVA boju i stil (`_kmlZadrziStil` u `_driveKmlKraj` → `_vectorFileChosen`). Stil ugrađenog sloja: localStorage `usf_stil_ugradjeno` (odjeli.js).
- **Tragovi — kartice (v2.7.3)**: `_tragRegRender` crta karticu po tragu: mini SVG pregled rute (`_tragMiniSvg`, početak zeleno/kraj crveno), čipovi (dužina, `_tragTrajanje`, tačke, 📷 `t.tacke`, ⚠ prekidi), boja traga kao lijevi rub (`--tc`), skriven trag zasjenjen; glavna dugmad Zoom/oko/Stil/Pošalji, ostalo (Ugladi, Vrati, Preimenuj, Briši) u `<details class="treg-vise">`. Na vrhu zbir (ukupno km, na karti). Editor uglađivanja `#treg-ugl-<id>` nepromijenjen.
- **Moja lokacija i Moji podaci (v2.7.8)**: modal `#ab-loc-popup` ista veličina, nov izgled samo CSS-om (GPS status kao pilula s tačkom, prekidači kao pločice koje se zelene preko `:has(.loc-switch.on)`, sekundarna dugmad neutralna). Karte → Moji podaci: KML/SHP i Tragovi su `<details class="kl-det">` (stanje u localStorage `usf_kh_otv`, zadano sklopljeno).
- **KML na karti — performanse (v2.7.9)**: svi KML/SHP slojevi se crtaju na zajedničkom `_kmlRenderer` (`L.canvas`, pane `tragMsrLines`, padding 0,8, `smoothFactor` 1,6) koji se dodaje odmah poslije pane-a (ispod canvasa tragova/mjerenja). Veliki padding = pri povlačenju karte već je nacrtano i izvan ekrana, pa slojevi ne „iskaču” tek poslije otpuštanja. `_kmlRestore` popusti UI nit između slojeva i prikaže svaki čim je spreman. Novi KML sloj MORA dobiti `renderer: _kmlRenderer`.
- **Grupisanje KML slojeva (v2.8.0)**: `_kmlGrupisi(lista)` → grupe {id, naziv, ik, klasa, slojevi}. Ručna grupa (🏷 `_kmlGrDodijeli`, localStorage `usf_kml_grupe` ime sloja → grupa) ima prednost; inače način `usf_kml_grmod`: `izvor` (serverski/moji), `naziv` (`_kmlGrOcisti` skida godinu/brojeve/separatore; isti očišćeni naziv ≥ 2 sloja, ili isti korijen prve riječi ≥ 4 znaka; ostalo = „Ostali slojevi”), `vrsta` (poligoni/linije/tačke). Zaglavlje grupe (`_kmlGrHeader`): sklopi (`usf_kml_gr_skl`), 🔍 zumira na cijelu grupu, prekidač prikaza cijele grupe (preskače „samo za odabir”). Isti načini koriste i Karte → Moji podaci (`_khSlojevi`, podnaslovi).
- **Veličina tačaka KML sloja (v2.8.1)**: editor stila (`_kmlStilOtvori`, param `imaTac` = sloj ima tačke) ima karticu „● Tačke” (kod sloja samo s tačkama jedina uz Oznake): `stil.r` (2–30 px, bez njega stari 4 + debljina), `stil.tObrub` (isti/bijeli/crni/bez), providnost `stil.op`; `_kmlLeafletStil('Point')` ih čita, `setStyle` mijenja i radijus. Stil pojedinačnog objekta-tačke i dalje ide samo preko debljine.
- **Promjer tačke (v2.8.2)**: umjesto radijusa `stil.d` = VIDLJIVI promjer u px s obrubom (`_kmlTacD`; stari `stil.r` → 2r + 3): Leaflet `radius = (d − obrub)/2`, obrub 2 px (0 za „Bez”). Kartica „● Tačke” ima pregled u STVARNOJ veličini (HTML krugovi, `box-sizing:border-box`, `.ked-tac-pr`), ravnalo i procjenu u metrima na terenu pri trenutnom zumu.
- **Radijus prstenovi (v2.8.3)**: `_drawRadiusRings` crta po prstenu TRI sloja (bijeli oreol 6 px, plava isprekidana linija 2,5 px, oznaka `.rr-pil` — plava pilula s bijelim rubom); `_radiusCircles` je niz trojki [halo, krug, oznaka] — `_updateRadiusRings` ih ažurira istim redom.
- **Inventura šuma (v2.8.4)** (Meni → Rad na terenu, ispod Sjekačkih linija; `static/js/inventura.js`, `USFInv`, panel `inventura-panel`/`#inv-body`): KML/KMZ tačke = centri primjernih ploha (koordinata iz fajla; Placemark s poligonom ⇒ prosjek prstena), oznaka = name ili BROJ/ID/PLOHA. localStorage `usf_inventura` {r (zadano 25 m), unutra [m] (unutrašnji krugovi, „7; 12,5”), skupovi [{id, naziv, vis, tacke [{id, n, la, lo, ext, st:'snimljeno', t}]}]}; ponovni uvoz istog fajla zadržava `st` po oznaci. Karta: pane `inventuraPane` z 416 (bez dodira, vlastiti canvas), krug R (bijeli oreol + narandžasto/zeleno = nesnimljeno/snimljeno) i isprekidani unutrašnji tek od zoom 14, ≤ 400 krugova i ≤ 150 natpisa u pogledu. Dodir (izvor `_kartaKlikIzvor`): blizu centra = tačka, unutar R = poligon ⇒ kartica (Radi na krugu / Snimljeno). „Radi na krugu” (`radi`): pali GPS, traka `#inv-rad` svake 1 s iz `lastP`: udaljenost od centra (veliko, boja unutra/na granici ±1,5 m/vani), do granice, azimut prema centru + SVG strelica (s `_compassHeading` stvarni smjer), ● po unutrašnjem krugu; žuti aktivni krug s oznakama radijusa, križ u centru i linija ja→centar. „⏭ Sljedeća” = najbliža nesnimljena. Test `tests/js/inventura.test.js`.
- **Inventura — odjeli, brojevi, put, filter (v2.8.5)**: nazivi iz KML-a se NE crtaju na karti (samo u kartici/listi). `S.odjeli` [{id, naziv, boja}], `S.aktOdj`; krug dobija `t.odj`, `t.br` (tekst, sortira `poBroju`: broj pa tekst), `t.bt`. Tok: kartica kruga → „🔢 Obrojči krug” (`obrojci`): bez aktivnog odjela prvo `noviOdjel` (prijedlog naziva iz najmanjeg KML poligona ispod kruga, `_odjelOznaka`), zatim način obrojčavanja (`numOn`, traka `#inv-num` dolje: odjel, sljedeći broj, ↶ poništi zadnji, ✓ Gotovo; `body.inv-num-on` krije `#map-fabs`) — svaki dodir na krug pita broj (`imenuj`, prijedlog = max+1, prazno = ukloni, isti broj ⇒ prebaci). Natpis `.inv-br` = broj u boji odjela (zoom ≥ 13); put `crtajPut`: linija između uzastopnih brojeva + strelica `.inv-str` na sredini (≥ 40 px). Filter poligonom (`filtriraj` → `USFPrimka.nacrtaj`): `filt` SAMO u memoriji, `sveTacke()` vraća samo krugove unutra (crtanje, dodir, najbliža), čip `#inv-filt` ✕ ga skida. Dok se obuhvat crta (`crtamFilter`, v2.8.6) krugovi, brojevi i put se NE crtaju — vidi se teren.
- **Inventura — prikaz krugova (v2.8.7)**: `S.vid` (prekidač „Prikaži krugove”; sakrije sve, čip `#inv-vid` vraća) i `S.razm` (najsitnija razmjera, nazivnik; zadano 1:10 000, 0 = uvijek) → `krugVidljiv()` odlučuje o krugovima, brojevima, putu i dodiru (`_razmjera()`); centri ostaju dok je `S.vid`. Aktivni krug u „Radi na krugu” se uvijek crta.
- **Inventura — dizajn i prag razmjere (v2.8.8)**: panel = hero kartica (prsten % snimljeno, brojači, 4 brze akcije: Učitaj / Najbliža / Samo dio / Obrojči, traka stanja „krugovi vidljivi/sakriveni na razmjeri 1:N”), pretraga, kartice skupova, pa harmonika „Postavke i alati” (`.inv-acc`: Prikaz krugova, Odjeli, Radijusi; stanje u memoriji `otvoren['acc_*']`). Prag razmjere sada skriva i CENTRE (osim uz `S.centri` „Centri ostaju vidljivi”) — pri 1:26 000 krug od 25 m je ~4 px pa je izgledao kao centar-tačka. Presetovi 1:1 000 … 1:100 000.
- **Inventura — krugovi odjela (v2.8.9)**: `t.odj` = pripada odjelu (broj `t.br` nije obavezan; brisanje broja ostavlja članstvo, brisanje odjela skida oboje). Pri pravljenju odjela (`noviOdjel` → `izborKrugova`) dijalog nudi: 🎯 automatski (`poligoniOdjela`: poligoni „Granice taksacije” iz `_kmlPoligoniOdabir()` s istim brojem odjela kao u nazivu ili odjel poligona ispod kruga → `uPoligonu`), 👆 dodirom ili preskoči; zatim način izbora (`selOn`, `sel` Set, traka `#inv-sel`: broj odabranih, ◱ Poligon (dodaje krugove unutar nacrtanog), ☑ Sve vidljive, ✕ Očisti, Odustani, ✓ Gotovo) — dodir na krug uključi/isključi (kvačica, deblji obris). Gotovo upisuje `t.odj`; obrojčani krugovi se ne mogu skinuti. Članovi se crtaju s oreolom u boji odjela; panel: ☑ uz odjel ponovo otvara izbor. Poslije Gotovo pri novom odjelu nastavlja obrojčavanje.
- **Inventura — „Sakrij krugove izvan odjela” (v2.9.0)**: `S.samoOdj` + aktivni odjel (`S.aktOdj`) ⇒ `sveTacke()` vraća samo krugove s `t.odj === S.aktOdj` (crtanje, brojevi, put, dodir, najbliža); ne važi dok traje izbor krugova odjela (`selOn`). Prekidač: panel → Postavke i alati → Odjeli, dugme „🙈 Izvan odjela” u traci obrojčavanja `#inv-num`, i čip `#inv-odjchip` „◎ Samo Odjel N: M krugova ✕” za vraćanje. Odjel bez članova se ne može uključiti.
- **Moji slojevi — „Sakrij sve” (v2.9.2)**: zaglavlje kartice `#kh-lista` ima dugme `.kh-sakrij` („🙈 Sakrij sve” ⇄ „👁 Prikaži sve”, `_khMojiVid(on)`): korisnikovi KML/SHP slojevi (ne serverski, ne „samo za odabir”) i tragovi.
- **Meni — dizajn (v2.9.3)**: samo CSS (blok „Meni — dizajn” ispred `@media (min-width:700px)` panela): naslov grupe nosi boju `--gc` (po `:nth-of-type`) s kvadratićem i linijom koja blijedi; `.meni-card` ima lijevi rub i sjaj u `--mc`, ikona 46 px s radijalnim sjajem; `.meni-set` neisprekidan. HTML, ID-ovi i JS (`_meniStatusRender`, `_meniNedavnoRender`) netaknuti.
- **Brzina KML-a (v2.9.4)**: KML: `pkml` = petlja nad `_pkmlJedan`; `pkmlAsync` (≥ 400 Placemark-a) gradi sloj u komadima od 20 ms uz popuštanje UI niti — koristi ga `_kmlRestore` i `_kmlLoadFile` (8000 tačaka ≈ 0,2 s, najduža blokada ~45 ms). Tooltip tačke se veže lijeno na prvi `mouseover` (`_kmlTipLijeno`), klik ide kroz jedan zajednički `_kmlKlik` (`hit._kmlSloj` = roditeljska linija).
- **Izmjena sačuvanog mjerenja (v2.9.5)**: „✏ Uredi” na mjerenju (`_msrRegZoom`) postavlja `_mqmId` i pokreće `msrStart`; `msrStop` (Završi / zatvaranje panela / dvoklik) sada zove `_msrZavrsiIzmjenu` — sinhronizira, gasi `_mqmId`, briše sloj tačaka i ponovo crta sačuvana mjerenja. Prije su tačke poligona ostajale na karti i izlaz nije radio.
- **Kartica objekta (popup) — dizajn (v2.9.6)**: `_popKartica` (`.pk`) — boja objekta kao gornja traka (`.pk::before`), tip kao pilula `.pk-tip` pored datuma/sloja, PRVI red `.pk-redovi` je glavna vrijednost (19 px u boji `--pk-boja`), klizač u kartici `.pk-klizac`, akcije u 2 kolone (`glavno` preko cijele širine; usamljeno zadnje dugme se proteže). Isti HTML za KML, mjerenja, tragove i nagibe; red „Površina u m²” umjesto praznog naziva.
- **Tragovi — pregled i dizajn (v2.9.7)**: panel `#tragovi-panel`: KPI traka (`.treg-kpi`: ukupno km, broj, uspon, vrijeme), traka alata (`.treg-alat`, sticky): filter Svi/Na karti/Skriveni (`_tragFilt`), pretraga (od 5 tragova), redoslijed Najnoviji/Najduži/Po imenu (`_tragSort`), „Prikaži/Sakrij sve” (`_tragSviVid`); stanje samo u memoriji. Lista se crta u `#treg-kartice` (`_tragRegKartice`, da pretraga ne gubi fokus); `_tragStat` = dužina, uspon, trajanje, prosječna brzina (čip ⌀ km/h, ▲ uspon). Kartica: veći pregled rute 64 px, kilometri veliko desno u boji traga.
- **Mjerenja i Tačke — pregled i dizajn (v2.9.8)**: obje liste dijele obrazac Tragova (KPI pločice, sticky traka filtera/pretrage/sorta, kartice se crtaju u zasebnom kontejneru da pretraga ne gubi fokus; stanje samo u memoriji). Mjerenja (`_msrRegRender` → `_msrRegKartice`, `#msr-kartice`): `_msrVrijednost` = glavna vrijednost po vrsti (km / ha / nagib %), `_msrMiniSvg` pregled oblika, filter Sva/Udaljenost/Površina/Nagib, „Na karti” = `_msrRegPogled` (samo pogled + kartica), „Uredi” = `_msrRegZoom` (izmjena). Tačke (`tacke.js` `renderLista` → `renderKartice`, `#tk-kartice`, `LS` stanje): KPI (tačaka/fotografija/na karti), čipovi vrsta samo za postojeće (+ „Sa foto”), sort Najnovije/Najbliže meni/Po imenu, kartica s pilulom vrste u boji, minijaturom 64 px (+ broj fotografija) i udaljenošću desno.
- **Koordinatni sistem i dugmad (v2.9.9)**: Postavke → Koordinate i dugmad → „Koordinatni sistem” `_uiPrikaz.koord` = `mgi5` | `mgi6` | `wgs` (zadano mgi5); `_koordFmt(lat, lon, sist?)` → {naz, txt} je jedino mjesto formatiranja (badge `#geo-badge`, kartica tačke u tacke.js); dodir na koordinate u uglu karte mijenja sistem redom (`_koordSljedeci`). `wgsToMGI6` koristi isti `MGI-ZONE6` def (lon_0 18°, x_0 6 500 000). `_geoBadgeLast` čuva `ll` [lat, lon] (ne formatirani tekst) pa se promjena sistema vidi odmah. Zoom +/− i „Moja lokacija”: CSS blok iza `#ab-loc.active::after` — znakovi u `--ui-a1`, kratka razdjelnica, lokacija 56 px kao glavno dugme; aktivna (GPS) = zeleni gradijent s tačkom stanja.
- **Primka — pregled, tačke i fotografije (v3.0.0)**: iznad liste projekata `.pr-ukupno` (`ukupnoHtml`: projekata, ha ukupno, % primljeno, broj za popraviti / koliko kasni, zbirna traka; pretraga `#pr-trazi` od 5 projekata mijenja samo `#pr-projekti`). Kartica projekta ima pilulu % primljenog (`pctHtml`) i sažetak ha po klasi (`miniZbir`). Kartica odjela na karti (`popupOdjel`) i kartica dijela (`popup`) imaju „📷 Slikaj ovdje” i „📍 Dodaj tačku” → `USFPrimka.tackaOvdje(pid, lat, lng, foto)`: tačka na mjestu dodira kroz `USFTacke.nova` (naziv = vrsta · projekat); foto odmah otvara kameru, a „Dodaj tačku” pita vrstu (`TACKA_VRSTE`: loš šumski red, bespravna sječa, silazak sa vlake, suho/izvala, potkornjak, ostalo) pa otvara obrazac s opisom. Verzija je preskočila na 3.0.0 jer 2.9.9 → 3.0.0 po šemi.
