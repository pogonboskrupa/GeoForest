#!/bin/bash
# Pokrenite JEDNOM da generišete potpisni ključ za GeoForest APK.
# Keystore i lozinke NIKAD u repo — čuvajte ih van repoa (bez ključa nema update-a preko instalirane app).
# CI ih čita iz GitHub Secrets: GEOFOREST_KEYSTORE_B64, GEOFOREST_STORE_PASSWORD,
# GEOFOREST_KEY_ALIAS, GEOFOREST_KEY_PASSWORD (Settings → Secrets and variables → Actions).

set -euo pipefail

KEYSTORE="${1:-geoforest-release.keystore}"
ALIAS="geoforest"

if [ -e "$KEYSTORE" ]; then
  echo "Već postoji: $KEYSTORE — ne prepisujem (novi ključ = korisnici ne mogu update)." >&2
  exit 1
fi

echo "=== Generisanje keystore-a za GeoForest APK ==="
# Lozinke keytool traži interaktivno — ne idu u historiju shell-a.
keytool -genkeypair \
  -keystore "$KEYSTORE" \
  -storetype PKCS12 \
  -alias "$ALIAS" \
  -keyalg RSA \
  -keysize 2048 \
  -validity 9125 \
  -dname "CN=GeoForest, O=Pogon Boskrupa, L=Bosanska Krupa, ST=USK, C=BA"

echo ""
echo "=== SHA-256 fingerprint ==="
keytool -list -v -keystore "$KEYSTORE" -alias "$ALIAS" | grep "SHA256:" | awk '{print $2}'

echo ""
echo "Keystore: $KEYSTORE (alias: $ALIAS)"
echo "GitHub Secrets:"
echo "  GEOFOREST_KEYSTORE_B64   = izlaz: base64 -w0 $KEYSTORE"
echo "  GEOFOREST_STORE_PASSWORD = lozinka keystore-a"
echo "  GEOFOREST_KEY_ALIAS      = $ALIAS"
echo "  GEOFOREST_KEY_PASSWORD   = lozinka ključa (PKCS12: ista kao keystore)"
