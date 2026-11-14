# QA visual y performance — Frontend F2

**Fecha**: 2026-11-14
**Build**: `frontend/dist` (Vite 8.3.8, React 19.3.1)
**Entorno**: XAMPP local, Apache sirviendo el SPA con `FallbackResource`, API Node en `127.0.0.1:3001` proxied.
**Referencias v1**: `docs/qa/reference-v1-app.png`, `docs/qa/reference-v1-auth.png` (capturadas del v1 antes del retiro).

## 1. Resultado

Sin regresiones P1 en mapa, panel, auth, legales ni admin. La identidad visual se mantiene (paleta, Alfa Slab One/Sofia Sans, mapa con fills por país) y se sumó la capa de motion/tokens. Se aceptaron dos diferencias conscientes:

- El header en 360 px envuelve en varias filas (búsqueda, favoritos, usuario, acciones) en lugar de esconder acciones en un menú. No hay overflow horizontal.
- El panel de país ocupa el ancho completo en móvil y cubre el header; se cierra con ✕, backdrop o Escape. Es el mismo patrón del v1.

## 2. Bundle y performance local

| Métrica | Valor |
|---|---|
| JS de entrada | 523.95 kB sin minificar / **168.43 kB gzip** |
| CSS | 28.46 kB / **6.90 kB gzip** |
| First paint (local, dev) | ~144 ms |
| First contentful paint | ~156 ms |
| DOMContentLoaded | ~121 ms |
| Topojson | vendorizado; cacheado en `localStorage` (`sdl_topo_50m_v1`) |
| Requests a CDNs | 0 (mapa, fuentes y video gateados) |

El chunk supera el umbral informativo de 500 kB sin comprimir; el peso real de red es 168 kB gzip. No se persiguió un score de Lighthouse: la medición es local con Vite dev y el objetivo del plan es detectar regresiones groseras, no vanity scores. Para producción, el build está minificado y sin sourcemaps.

## 3. QA visual por viewport

- **360×800**: mapa completo, lista alternativa, stats en 2×2, panel full-width, legales legibles, sin scroll horizontal (`scrollWidth - clientWidth <= 1`).
- **768×1024**: mapa 62vh, stats 2×2, panel lateral de 470 px, grid de ingredientes y footer sin solapamientos.
- **1440×900**: layout de referencia, mapa centrado, panel lateral, stats en 4 columnas, footer con enlaces legales.

Capturas de trabajo (no versionadas por tamaño): `.playwright-mcp/f2-desktop-1440.png`, `f2-tablet-768.png`, `f2-mobile-360-fresh.png`.

## 4. Evidencia automatizada

```
frontend: npx vitest run              -> 8 files / 24 tests passed
frontend: npx playwright test          -> 7 passed, 1 skipped (admin sin credenciales)
frontend: admin con usuario temporal   -> 1 passed (4 solapas, guardado sin reload, dirty-guard)
frontend: axe wcag22aa                 -> 0 violaciones en home, auth, legales y admin restringido
frontend: scripts/check-contrast.mjs   -> 19/19 pares AA
frontend: npm run build                -> exit 0
cutover Apache                         -> home React 200, deep-link 200, /api 200, legacy 403
rollback F2                            -> v1 servido 200 y API 200; re-flip React 200
```

## 5. Gaps aceptados / pendientes

- Los datos del titular en legales son placeholders visibles (`frontend/src/content/legal/owner.ts`).
- No hay i18n; todo el copy está en español rioplatense.
- La medición de performance es local y no reemplaza un Lighthouse de producción con red real.
- El contador GSAP puede aparecer a mitad de animación en capturas; al terminar muestra el valor exacto de la DB.
- El mapa móvil se probó con gestures emulados y teclado; falta una prueba con dispositivos físicos variados.
- La auditoría axe no sustituye una revisión con personas usuarias reales.
