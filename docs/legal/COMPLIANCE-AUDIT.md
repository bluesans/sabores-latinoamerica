# Auditoría de compliance — FINAL (F1 + F2)

**Fecha**: 2026-11-14
**Alcance**: backend Node/Fastify + frontend React + base de datos, inventario de datos, terceros, copy y accesibilidad.
**Estado**: 20/20 ítems con evidencia. Este documento es factual y **no constituye asesoría legal**; debe revisarse con un profesional antes de publicar. Los datos del titular siguen como placeholders centralizados en `frontend/src/content/legal/owner.ts`.

## 1. Inventario de datos personales (ítem 7)

| Tabla | Campos | Finalidad | Retención / borrado |
|---|---|---|---|
| `users` | `username`, `password` (bcrypt cost 12), `role`, `consent_version`, `consented_at`, `age_confirmed`, `created_at` | Cuenta, autenticación y prueba de consentimiento | Hasta que la persona pide baja; `DELETE /auth/account` borra la fila y sus dependencias |
| `sessions` | `token` (sha256, nunca el refresh en claro), `user_id`, `ip`, `user_agent`, `created_at`, `expires_at`, `revoked_at` | Sesión, rotación y seguridad (IP/UA para auditoría de sesión) | `SESSION_DAYS=7`; expiradas/revocadas se purgan en refresh/login |
| `login_attempts` | `ip`, `username` intentado, `action`, `attempted_at` | Rate limiting anti-abuso | Se purga >1 hora en cada chequeo; no se usa para perfilado |
| `favorites` | `user_id`, `recipe_id`, `created_at` | Favoritos de la cuenta | Cascada al borrar usuario |

No se recolectan emails, teléfonos, ubicación precisa ni datos de pago. No hay analytics, píxeles publicitarios ni SDKs de terceros. El frontend guarda en `localStorage` solo `sdl_consent` (versión, timestamp y categorías), sin identificadores personales.

## 2. Logs (ítem 7)

- **Node**: logger Fastify en `warn` con `redact` para `authorization`, `cookie`, `set-cookie`, `password`, `access`, `refresh`, `token`, `secret`; los errores de admin pasan por `redactText`. Evidencia: `backend/tests/redaction.test.ts` (3 tests).
- **Frontend**: no hay logging de datos de usuario ni de respuestas de API.
- **PHP legacy**: retirado de la URL pública en el todo 27; `.htaccess` bloquea `legacy/` con 403. No corre en producción.

## 3. Terceros (ítem 8)

| Tercero | Uso | Licencia / condición | Estado F2 |
|---|---|---|---|
| `world-atlas@2` / Natural Earth | Geometría del mapa | Natural Earth dominio público; empaquetado ISC | **Vendorizado** en `frontend/public/data/countries-50m.json` y `countries-110m.json`; cero requests al CDN en runtime |
| `youtube-nocookie.com` | Video de receta | Términos de YouTube | Gate real: sin consentimiento no se crea el iframe ni se hace request. Evidencia: e2e `app.spec.ts` (0 requests a YouTube pre-consentimiento) |
| YouTube thumbnails | Poster de video | YouTube | **No se usan**: el poster es CSS local, así que tampoco hay request a `i.ytimg.com` antes del consentimiento |
| Fuentes Alfa Slab One / Sofia Sans | Tipografía | SIL Open Font License 1.1 | Servidas localmente desde `frontend/public/fonts/`; crédito en `/licencias` |
| Sin Google Fonts CDN, sin analytics, sin SDKs | — | — | Verificado en `index.html`, `src/`, `public/` y por red e2e |

## 4. Los 20 ítems m0027

| # | Ítem | Estado | Evidencia |
|---:|---|---|---|
| 1 | Política de privacidad | **Completado** | `/privacidad` (`src/content/legal/pages.tsx`): datos, finalidades, retención, derechos, enlace al borrado |
| 2 | Términos de servicio | **Completado** | `/terminos`: uso, edad 13+, cuenta, PI, enlaces externos |
| 3 | Política de reembolsos | **Completado (N/A)** | `/reembolsos`: sitio gratuito, sin pagos ni suscripciones; qué hacer ante un cobro ajeno |
| 4 | Política de cookies | **Completado** | `/cookies`: tabla real `sdl_refresh`, `sdl_consent`, YouTube; sin analítica |
| 5 | Banner de consentimiento | **Completado** | `CookieBanner.tsx` + `ConsentContext`: sin pre-tildado, «Rechazar» y «Aceptar todas» misma clase/prominencia, persistencia y re-consulta a 183 días. Tests RTL + e2e |
| 6 | Checkboxes de consentimiento | **Completado** | Registro con 3 checks obligatorios, submit bloqueado sin ellos; backend `CONSENT_STRICT=1` verificado: register sin checks → 400. Evidencia e2e auth + curl |
| 7 | Sin datos innecesarios | **Completado** | Inventario §1; sin email/teléfono/pago/analytics |
| 8 | Auditoría de SDKs/terceros | **Completado** | Inventario §3; topojson vendorizado, video gateado, fuentes locales |
| 9 | Sin dark patterns | **Completado** | Checklist §5: simetría de botones, sin urgencia falsa, sin misdirection, cierre/rechazo siempre disponible, sin bloqueo del sitio |
| 10 | Sin cargos ocultos | **Completado (N/A)** | Sin checkout, precios ni cobros en rutas/código; `/reembolsos` lo declara |
| 11 | Sin reseñas falsas | **Completado (N/A)** | No existe feature de reseñas ni testimonios |
| 12 | Claims sostenidos | **Completado** | Stats del home salen de `GET /stats` (19 países / 57 recetas / 185 ingredientes / 57 videos en la DB actual). Copy sin promesas de salud, resultados ni marketing. Auditoría §6 |
| 13 | Alt text / nombres accesibles | **Completado** | SVG con `aria-label` por país, botones con nombre, `aria-hidden` en decorativos; axe wcag22aa 0 violaciones en home/auth/legal/admin |
| 14 | Contraste AA | **Completado** | `frontend/scripts/check-contrast.mjs`: 19 pares, todos ≥4.5:1 texto normal y ≥3:1 grande/UI. Evidencia en la salida del script |
| 15 | Navegación por teclado | **Completado** | Roving tabindex APG en el mapa, flechas/Home/End/Enter/Space/Escape, skip-link, focus al abrir/cerrar panel y modal, focus por ruta. e2e de teclado puro |
| 16 | Datos de contacto | **Completado con placeholders** | `/contacto` y footer usan `OWNER` centralizado; **faltan los datos reales del titular** (marcados visiblemente) |
| 17 | Edad / menores | **Completado (UI + backend)** | Check «13 años o más» obligatorio en registro; `age_confirmed` persistido; texto de menores en términos. Revisión legal pendiente |
| 18 | Unsubscribe | **Completado (N/A)** | El producto no envía emails ni newsletters; sin formulario de suscripción |
| 19 | Licencias | **Completado** | `/licencias`: OFL, Natural Earth PD, world-atlas ISC, librerías MIT/Apache; fuentes locales |
| 20 | Borrado de datos | **Completado** | `DELETE /auth/account` + diálogo «Mi cuenta» con password; 403/409 manejados; post-borrado vuelve a auth. Tests backend + e2e |

## 5. Checklist de dark patterns (ítem 9)

- [x] «Rechazar» y «Aceptar todas» comparten clase, tamaño y peso visual (`.cookie-btn`); ninguno está destacado.
- [x] No hay pre-tildado de categorías no esenciales (ni siquiera existe un toggle pre-marcado).
- [x] El banner no bloquea el sitio: se puede navegar y decidir después.
- [x] No hay cuenta regresiva, urgencia falsa, texto culpabilizador ni «aceptar para continuar».
- [x] Rechazar terceros no degrada funciones esenciales: solo impide cargar videos hasta cambiar de opinión.
- [x] La decisión se puede reabrir desde el footer («Preferencias de cookies»).
- [x] El flujo de borrado de cuenta explica consecuencias y pide confirmación con contraseña; no esconde la salida.
- [x] Errores de API se muestran con el mensaje real, sin culpar a la persona.

## 6. Auditoría de claims y copy (ítem 12)

- Contadores del home: provienen de `/stats`; no hay números hardcodeados en el JSX.
- «19 países · 57 recetas» es un snapshot de la DB actual; se recalcula al cargar.
- No se afirma «el mejor», «auténtico garantizado», propiedades medicinales, ni resultados de salud.
- El proyecto se declara educativo y sin fines de venta en footer y páginas legales.
- No hay testimonios, reseñas, sellos de calidad ni certificaciones inventadas.
- Los textos legales advierten «Pendiente de revisión profesional» y no prometen cumplimiento definitivo.
- Los datos del titular son placeholders visibles; no se inventó nombre, CUIT, dirección ni email.

## 7. Evidencia ejecutable

```
frontend: npm test                    -> 8 files / 24 tests passed
frontend: npm run build               -> exit 0
frontend: npm run typecheck           -> exit 0
frontend: npx biome check .           -> exit 0 (solo warnings de estilo preexistentes)
frontend: node scripts/check-contrast.mjs -> 19/19 pares AA
frontend: npx playwright test         -> 7 passed + 1 skipped (admin sin credenciales)
frontend: npx playwright test e2e/admin.spec.ts (con admin temporal) -> 1 passed
backend:  npm test                    -> suite completa verde (incluye fixtures y seguridad)
backend:  register sin checks         -> 400 con mensaje de consentimiento
```

## 8. Riesgos residuales y pendientes humanos

- **Datos del titular**: `frontend/src/content/legal/owner.ts` contiene placeholders; completar antes de publicar.
- **Revisión legal profesional**: los textos describen el sistema real, pero deben validarse contra la jurisdicción aplicable (base legal, plazos de respuesta, derechos).
- **YouTube**: se usa `youtube-nocookie.com` y click-to-load; el tratamiento posterior depende de YouTube y de la decisión de la persona.
- **IP/User-Agent**: son datos personales usados para sesión/rate limit; retención 7 días/1 hora. No se usan para perfilado.
- **Accesibilidad**: axe no detecta todo (p. ej. calidad de alt text o comprensión); se hizo QA de teclado y contraste, pero una auditoría con personas usuarias sigue recomendada.
- **Idioma**: todo el copy está en español rioplatense; no hay i18n todavía.
