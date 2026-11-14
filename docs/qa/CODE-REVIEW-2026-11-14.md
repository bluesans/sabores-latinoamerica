# Revisión extensiva — 2026-11-14

**Alcance**: repo completo, serving Apache, DB viva, CI y compliance. Cinco revisiones independientes (backend, frontend, DB/deploy, compliance/seguridad, e2e/a11y) sobre HEAD `e69c2a1` + ajustes posteriores.
**Estado**: sin P1 técnicos abiertos. Quedan P2 operativos/legales que requieren decisión del titular o infraestructura.

## Corregido en esta revisión

| Severidad | Hallazgo | Fix |
|---|---|---|
| P1 | `LegalPage.test` seguía esperando el placeholder del titular y rompía la suite | Test deriva de `OWNER` (nombre, email, jurisdicción, domicilio) |
| P1 | Rollback F2 documentado ya no servía el v1 (movido a `legacy/frontend-v1`) y el rollback pre-F2 exponía `backend/`, `db/`, `.git` | README con rollback real (copiar v1 + restaurar conf) y reglas 403 para `.git`, `.env`, `backend`, `db`, `frontend`, `node_modules`, `.omo`, `.codegraph` tanto en `.htaccess` como en el bloque F2 |
| P2 | OpenAPI declaraba `accepted_terms`/`accepted_privacy`/`consent_version`; el server lee `accept_terms`/`accept_privacy` | Corregido en `openapi.ts`, `openapi.json` y `api/types.d.ts`; 400 documentado |
| P2 | Refresh concurrente entre pestañas podía revocar todas las sesiones por reuse-detection | `navigator.locks` single-flight cross-tab con fallback |
| P2 | Cache de React Query sobrevivía a expiración/borrado | `cancelQueries` + `clear()` al pasar a guest |
| P2 | Panel sin semántica modal ni focus trap | `role="dialog"`, `aria-modal`, Tab trap y backdrop fuera del tab order |
| P2 | `CONSENT_STRICT` fallaba abierto | Default `1`; tests lo fuerzan a `0` explícitamente |
| P2 | Versión de consentimiento backend `2026-10` vs frontend `2026-11` | Unificada en `2026-11` (verificado en DB al registrar) |
| P2 | Admin pisaba drafts de otras filas al guardar | Init única + `hasDirtyDrafts`/`refreshDirty`; tab descarta de verdad |
| P2 | `capture.mjs` podía mutar la DB viva sin guard | Rechaza DB que no termine en `_test`/`_parity` salvo `ALLOW_LIVE_FIXTURES=1` |
| P3 | Combobox sin `aria-activedescendant` | IDs por opción + atributo en el input |
| P3 | Modal de ingrediente con carrera de respuestas | Guard de secuencia por request |
| P3 | Banner de cookies no aparecía en auth y tapaba el formulario en 360 | Banner en guest + padding inferior en auth móvil |
| P3 | Segundo 401 no expulsaba la sesión | Dispara `sdl:auth-expired` al reintento 401 |
| P3 | Password cliente por caracteres vs backend por bytes | Chequeo con `TextEncoder` |
| P3 | `ErrorBoundary` usaba `location.reload` | Link de vuelta al inicio |
| P3 | `owner.ts` con comment desactualizado | Comment y datos legales actualizados |
| P3 | Backup previo a 003 | Nuevo dump `20261114_003641.sql` con consentimientos |

## Abierto / requiere decisión

### P2 operativos
1. **Índices hot path**: `sessions.expires_at` y `login_attempts.attempted_at` no tienen índice; la purga de sesiones corre dentro de la transacción de refresh. Recomendación: migración 004 con índices y purga probabilística/fuera de transacción.
2. **Access token tras borrado**: un admin borrado conserva permisos hasta 15 min. Recomendación: revalidar admin en DB o `token_version` en claims.
3. **Headers/CSP**: faltan CSP, `Referrer-Policy`, `Permissions-Policy` y `Cache-Control: no-store` en auth/admin/favoritos; la API no hereda XCTO del `.htaccess`.
4. **Infra local**: MySQL escucha en `0.0.0.0` y la app usa `root` sin password; Apache en HTTP. En producción: bind loopback, usuario mínimo, TLS, `COOKIE_SECURE=1`, HSTS.
5. **CI**: no corre e2e/axe/contraste ni `npm audit`; MariaDB 10.4 EOL; Actions por tag mutable.
6. **Backups**: dump nuevo OK; falta documentar que el restore debe aplicar 003/004 y rotar logs.

### Legal / privacidad (revisión profesional)
- Falta **domicilio legal completo** (calle, número, CP); “Ciudad de Buenos Aires” no es domicilio. El campo `OWNER.address` quedó como placeholder visible.
- Evaluar **RNBD** (Ley 25.326 arts. 21/24) y **transferencia internacional a Google/YouTube** (art. 12); declarar Google LLC y qué datos se transfieren (ya se menciona en privacidad).
- Unificar base legal/plazos: se ajustaron plazos a 10 días corridos (acceso) y 5 hábiles (rectificación/supresión), pero el texto completo debe revisarlo un abogado.
- **PII en repo público**: `owner.ts` con nombre + Gmail personal está en el working tree, aún sin commit. Si se commitea, queda en el historial público. Recomendación: alias profesional, 2FA y evaluar cargar los datos por variable de entorno en build.
- Menores: el umbral 13+ autodeclarado no reemplaza consentimiento parental en Argentina; definir 18+ o flujo parental.
- Faltan email verificado/recuperación de cuenta y procedimiento formal de derechos; la baja autenticada sí existe.

### P3 aceptados
- Pinch táctil no automatizado.
- Bundle único ~525 kB (168 kB gzip); GSAP/React.lazy podrían dividir.
- TopoJSON de 756 kB cacheado en localStorage.
- `sitemap`/`robots`, `SECURITY.md`, `LICENSE`, textos OFL completos.
- Deep-link a receta solo funciona en página 1 (hoy ningún país supera 3 recetas).
- `window.confirm` en cambio de solapa/borrados de admin (navegación sí es in-app).
- Cuenta `hola` de QA con sesión/favorito: confirmar si se conserva o se borra.

## Verificación ejecutada

```
backend:  npm test                 -> 28 files / 294 tests passed
backend:  npm run lint             -> 0 errores
backend:  npm run typecheck        -> 0
backend:  npm run openapi:check    -> OK
backend:  npm run build            -> OK; Node reiniciado (PID 19420)
frontend: npx vitest run           -> 11 files / 29 tests passed
frontend: npx tsc --noEmit         -> 0
frontend: npx biome check .        -> 0 errores
frontend: npm run build            -> OK
frontend: check-contrast           -> 19/19 AA
e2e:      npx playwright test      -> 7 passed + 1 skip (preview y Apache)
DB:       register sin checks      -> 400; con checks -> 2026-11, age=1
HTTP:     home 200, API 200, legacy/.env/backend/db 403
```

## Recomendación de cierre

1. Definir los datos legales faltantes (domicilio, CUIT/razón social, alias de correo) y revisar con un profesional.
2. Decidir si `owner.ts` se commitea (PII) o se mueve a variables de entorno.
3. Planificar migración 004 de índices y revalidación de admin como siguiente iteración.
4. Endurecer infraestructura/headers antes de exponer el sitio a Internet.
