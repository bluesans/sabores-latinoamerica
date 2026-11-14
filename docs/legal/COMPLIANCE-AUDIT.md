# Auditoría de compliance — Parte 1 (F1)

**Fecha**: 2026-11-13
**Alcance**: backend F1 (Node/Fastify + MySQL), inventario de datos y terceros del v1.
**Estado**: F1 con evidencia real; los ítems de F2 quedan planificados. Este documento es factual y **no constituye asesoría legal**; debe revisarse con un profesional antes de publicar.

## 1. Inventario de datos personales (ítem 7)

| Tabla | Campos | Finalidad | Retención / borrado |
|---|---|---|---|
| `users` | `username`, `password` (bcrypt cost 12), `role`, `consent_version`, `consented_at`, `age_confirmed`, `created_at` | Cuenta, autenticación y prueba de consentimiento | Hasta que la persona pide baja; `DELETE /auth/account` borra la fila y sus dependencias |
| `sessions` | `token` (sha256, nunca el refresh en claro), `user_id`, `ip`, `user_agent`, `created_at`, `expires_at`, `revoked_at` | Sesión, rotación y seguridad (IP/UA para auditoría de sesión) | `SESSION_DAYS=7`; expiradas/revocadas se purgan en refresh/login |
| `login_attempts` | `ip`, `username` intentado, `action`, `attempted_at` | Rate limiting anti-abuso | Se purga >1 hora en cada chequeo; no se usa para perfilado |

No se recolectan emails, teléfonos, ubicación precisa ni datos de pago. No hay analytics ni píxeles de terceros.

## 2. Logs (ítem 7)

- **PHP v1**: `JsonErrorHandler` loguea `[api-error <id>] <clase>: <mensaje> in <archivo>:<línea>`. No loguea body, cookies ni Authorization. Riesgo residual: un `PDOException` podría incluir un valor de fila (p. ej. username duplicado) en el mensaje; los controllers capturan los casos esperados y no lo loguean.
- **Node F1**: `[api-error <id>]` sin datos; `APP_DEBUG=1` agrega detalle al response pero no a los logs. Logger Fastify en `warn` (no loguea requests) con `redact` para `authorization`, `cookie`, `set-cookie`, `password`, `access`, `refresh`, `token`, `secret`; los errores de admin pasan por `redactText`.
- **Prueba**: `backend/tests/redaction.test.ts` (3 tests) verifica que passwords, Bearer, cookies y tokens no aparecen en el output redactado.

## 3. Terceros actuales (ítem 8)

| Tercero | Uso | Origen / licencia | Plan F2 |
|---|---|---|---|
| `cdn.jsdelivr.net/npm/world-atlas@2` (`countries-50m/110m.json`) | Geometría del mapa | Natural Earth (dominio público); paquete `world-atlas` ISC | Descargar y versionar en `frontend/public/data/`, sin CDN en runtime |
| `youtube-nocookie.com/embed` | Video de receta tras click | YouTube (términos del servicio) | Mantener `nocookie`, click-to-load y gate de consentimiento explícito (todo 36/38) |
| YouTube thumbnails (`i.ytimg.com` si aplica) | Poster de video | YouTube | Servir poster local o gate de consentimiento antes de request |
| Fuentes `Alfa Slab One` y `Sofia Sans` (`.woff2` locales) | Tipografía | SIL Open Font License 1.1 (Google Fonts) | Copiar al bundle + página `/licencias` con OFL |
| Sin Google Fonts CDN, sin analytics, sin SDKs de terceros | — | — | Verificado por búsqueda de URLs externas |

## 4. Los 20 ítems m0027

| # | Ítem | Fase | Estado F1 / evidencia | Plan F2 |
|---:|---|---|---|---|
| 1 | Política de privacidad | F2 | Pendiente | Página `/privacidad` basada en el inventario de §1 |
| 2 | Términos de servicio | F2 | Pendiente | Página `/terminos` |
| 3 | Política de reembolsos | F1 | **N/A verificado**: no hay compras, pagos ni suscripciones en rutas/código | Documentar N/A en legal |
| 4 | Política de cookies | F2 | Pendiente | Página `/cookies` + detalle de `sdl_refresh` (HttpOnly, SameSite=Strict) |
| 5 | Banner de consentimiento de cookies | F2 | Pendiente | Banner real, rechazo con igual prominencia, sin pre-tildado |
| 6 | Checkboxes de consentimiento en formularios | F1 parcial | Migración 003 + `CONSENT_STRICT` validan términos/privacidad/edad; el registro web crea usuarios sin checks por defecto (transición) | UI de registro con 3 checks + `CONSENT_STRICT=1` (todo 40) |
| 7 | Sin datos innecesarios | F1 | **Completado**: inventario §1; solo username/hash/consentimiento, IP/UA de sesión y telemetría de rate limit | Revisar en QA final |
| 8 | Auditoría de SDKs/terceros | F1 | **Completado**: inventario §3; no hay analytics/SDKs | Vendorizar topojson, gate de video y licencias |
| 9 | Quitar dark patterns | F2 | Pendiente | Checklist de simetría/salidas claras (todo 40) |
| 10 | Quitar cargos ocultos | F1 | **N/A verificado**: no hay checkout ni cargos | Documentar N/A |
| 11 | Quitar reseñas falsas | F1 | **N/A verificado**: no existe feature de reseñas | Documentar N/A |
| 12 | Claims sostenidos | F2 | Parcial: stats del sitio salen de DB (19 países/57 recetas); no hay claims de marketing nuevos | Auditar todo el copy (todo 40) |
| 13 | Alt text en imágenes | F2 | Pendiente | Auditoría + axe (todos 35/41) |
| 14 | Contraste de color | F2 | Pendiente | Tokens + script de contraste AA (todo 29) |
| 15 | Navegación por teclado | F2 | Pendiente | Mapa APG + focus management (todos 35/41) |
| 16 | Datos del negocio/contacto | F2 | Pendiente: no hay datos del titular provistos | Página `/contacto`; **requiere datos reales del usuario** |
| 17 | Consentimiento de edad / datos de menores | F1 parcial | Campo `age_confirmed` + `CONSENT_STRICT`; sin flujo UI aún | Check de edad + política de menores (revisión legal) |
| 18 | Link de unsubscribe | F1 | **N/A verificado**: el producto no envía emails | Documentar N/A |
| 19 | Licencias de fuentes/imágenes | F1 parcial | Inventario §3: OFL para fuentes, Natural Earth PD / world-atlas ISC | Página `/licencias` + archivos de licencia en el bundle |
| 20 | Borrado de datos a pedido | F1 | **Completado**: `DELETE /auth/account` con password, guard de último admin, cascadas y tests (todo 16) | Botón/flujo en la UI (todo 32) |

## 5. Evidencia ejecutable

```
backend/tests/redaction.test.ts                       -> 3 passed
backend/tests/account-delete.test.ts                 -> 7 passed (delete/cascadas/último admin)
backend/tests/fixtures/php/*account*                 -> paridad de borrado
```

## 6. Riesgos residuales

- El v1 PHP podría loguear un valor de fila dentro de un `PDOException` no esperado; el retiro del PHP (todo 27) elimina ese camino.
- La IP y el user-agent son datos personales: se usan solo para sesión/rate limit y se retienen 7 días/1 hora respectivamente.
- Falta revisión legal profesional de los textos y de la base legal de tratamiento.
