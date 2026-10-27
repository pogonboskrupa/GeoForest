#!/bin/bash
# Kopira web fajlove u android/app/src/main/assets/
# Pokrenuti iz korijenskog direktorija projekta: bash android/copy-assets.sh

set -euo pipefail

ASSETS_DIR="android/app/src/main/assets"

rm -rf "$ASSETS_DIR"
mkdir -p "$ASSETS_DIR"
mkdir -p "$ASSETS_DIR/static"
mkdir -p "$ASSETS_DIR/geo"

# Glavni fajlovi
cp index.html "$ASSETS_DIR/"
cp manifest.json "$ASSETS_DIR/"
cp sw.js "$ASSETS_DIR/"

# Ikone
cp icon-192.png "$ASSETS_DIR/"
cp icon-512.png "$ASSETS_DIR/"
cp icon-maskable-512.png "$ASSETS_DIR/"
cp apple-touch-icon.png "$ASSETS_DIR/"

# GeoJSON / KML podaci (opciono, ne ruši build ako fajl ne postoji)
cp -r geo/* "$ASSETS_DIR/geo/" 2>/dev/null || true
cp -r static/* "$ASSETS_DIR/static/" 2>/dev/null || true

echo "Assets kopirani u $ASSETS_DIR/"
echo "Ukupna velicina: $(du -sh $ASSETS_DIR | cut -f1)"

# Fail the build instead of shipping an APK that needs the network to boot.
for asset in index.html static/libs/leaflet.min.js static/libs/leaflet.min.css static/libs/proj4.js static/libs/turf.min.js static/libs/sql-wasm.js static/libs/sql-wasm.wasm static/js/firebase-init.js static/js/dem-local.js static/js/odjeli.js static/js/nagib-poligon.js static/js/tacke.js static/js/sjekacke.js static/js/primka.js static/js/ikone.js static/js/inventura.js static/js/mjerenja-profil.js static/js/slika-karte.js static/js/drive-karte.js static/js/tabovi.js static/js/karte-tab.js static/js/postavke.js static/css/geoforest.css static/data/karte_drive.json static/data/kml_drive.json static/data/karte_github.json static/data/dem_opcine.tif static/libs/geotiff.js; do
  test -s "$ASSETS_DIR/$asset" || { echo "Missing offline asset: $asset" >&2; exit 1; }
done
