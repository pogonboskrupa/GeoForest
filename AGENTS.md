# GeoForest — napomene za agente

- Pravila projekta su u `CLAUDE.md` (verzija, APK, release, testovi).
- **Glavna grana je `main`** — s nje CI gradi APK i objavljuje GitHub Release
  (updater u app-u čita `api.github.com/repos/pogonboskrupa/GeoForest/releases`).
- **Testovi**: `for f in tests/js/*.test.js; do node "$f"; done` + Java testovi iz
  `android/test-java` (koraci u `.github/workflows/build-apk.yml`).
- Leaflet: svaki `pane: 'x'` mora imati `map.createPane('x')`; sloj iznad offline
  podloge (`offlineBasePane`, z 210) mora imati vlastiti pane.
