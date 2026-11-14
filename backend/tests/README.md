# Tests del backend Node

## Suites actuales

- `tests/config.test.ts` — configuración validada con zod (todo 5).
- `tests/http-contract.test.ts` — capa HTTP / envelopes / CORS / health (todo 8).
- `tests/auth-core.test.ts` — JWT, bcrypt, cookies y refresh token, con cross-check PHP↔Node (todo 9).
- `tests/sessions.test.ts` — repositorio de sesiones sobre `sabores_node_test` (todo 10).
- `tests/rate-limit.test.ts` — rate limiting sobre `login_attempts` (todo 11).
- `tests/consent.test.ts` — migración 003 y `CONSENT_STRICT` (todo 15).
- `tests/migration-003.test.ts` — 003 incremental sobre 000-002 con datos (todo 15).
- `tests/account-delete.test.ts` — DELETE /auth/account (todo 16).
- `tests/resources.test.ts` — countries/stats/recipes/ingredients/search en paridad (todo 17).
- `tests/favorites.test.ts` — favoritos: toggle, orden, aislamiento y errores (todo 18).
- `tests/admin.test.ts` — admin: guards, data, CRUD, validaciones y sesiones (todo 19).
- `tests/create-admin.test.ts` — CLI create-admin: creación, idempotencia, --force y rechazo de rol user (todo 20).
- `tests/openapi.test.ts` — export OpenAPI determinista y cobertura de rutas (todo 21).
- `tests/port/**` — port 1:1 de la suite PHP (este todo 12).

## Port de la suite PHP (todo 12)

Estrategia: un archivo Vitest por archivo PHP. Los casos cuya capa aún no
existe quedan como `it.todo` con el todo que los cierra (NUNCA rojos). Los
casos ya cubiertos por otra suite se referencian explícitamente para no
duplicar estado ni reducir cobertura.

| Archivo PHP | Port Vitest | Casos PHP | Portados ahora | Cubiertos en otra suite | Pendientes (todo) |
|---|---|---:|---:|---:|---|
| `Integration/AdminSessionsTest.php` | `port/admin-sessions.test.ts` | 14 | 12 | 2 (`tests/sessions.test.ts`) | 0 |
| `Integration/AdminValidationTest.php` | `port/admin-validation.test.ts` | 25 | 25 | 0 | 0 |
| `Integration/AuthServiceTest.php` | `port/auth-service.test.ts` | 4 | 3 | 1 (`tests/rate-limit.test.ts`) | 0 |
| `Integration/CookieFlowTest.php` | `port/cookie-flow.test.ts` | 7 | 7 | 0 | 0 |
| `Integration/ErrorIdTest.php` | `port/error-id.test.ts` | 2 | 2 | 0 | 0 |
| `Integration/HardeningTest.php` | `port/hardening.test.ts` | 14 | 14 | 0 | 0 |
| `Integration/RemainingFlowTest.php` | `port/remaining-flow.test.ts` | 14 | 10 | 4 (`tests/create-admin.test.ts`) | 0 |
| `Integration/SearchEscapeTest.php` | `port/search-escape.test.ts` | 4 | 4 | 0 | 0 |
| `Integration/SmokeTest.php` | `port/smoke.test.ts` | 1 | 1 | 0 | 0 |
| `Integration/StatsCountryTest.php` | `port/stats-country.test.ts` | 2 | 2 | 0 | 0 |
| `Integration/TransactionSweepTest.php` | `port/transaction-sweep.test.ts` | 2 | 2 | 0 | 0 |
| `Unit/JwtTest.php` | `port/jwt.test.ts` | 8 | 8 (+2 de reloj) | 0 | 0 |
| `Unit/ValidationTest.php` | `port/validation.test.ts` | 13 | 13 | 0 | 0 |
| **Total** | | **110** | **103** | **7** | **0** |

Notas de mapeo:

- **AdminSessions**: todos los casos portados; metadata/truncación de UA viven además en `tests/sessions.test.ts`.
- **AdminValidation**: 25/25 portados.
- **AuthService**: los 4 casos cerrados en el todo 14 (register, duplicado, login roundtrip y 6.º register cubierto por `tests/rate-limit.test.ts`).
- **CookieFlow**: los 7 casos portados a HTTP en el todo 14 (register/login/refresh/reuse/logout/tampered/throttle).
- **Hardening**: completo; ids no numéricos públicos dan 405 (waiver de routing), admin conserva el cast (int) de recipes y el regex de sessions.
- **RemainingFlow**: health, byCountry, ingredient y favoritos portados; los 4 casos CLI viven en `tests/create-admin.test.ts`.
- **StatsCountry** y **SearchEscape**: completos en el todo 17.
- **TransactionSweep**: cascada a nivel DB y 404/efectos colaterales vía ruta admin.
- **JwtTest**: se agregaron los bordes que exige el todo 12 (±5s válidos / ±15s inválidos), además de los 8 casos originales.
- **Validation**: los 13 casos quedaron verdes en el todo 13 al portar `Validation.php`.
- El contrato HTTP de register/check se prueba además en `tests/auth-register-check.test.ts` contra las fixtures doradas.

## Ejecución

```bash
npm test                 # todas las suites (requiere MySQL para las de integración)
npm run test:fixtures    # replay de fixtures PHP contra el server Node (todo 22)
```

`vitest.config.ts` fija `fileParallelism: false` porque `tests/sessions.test.ts`,
`tests/rate-limit.test.ts` y los ports con DB comparten `sabores_node_test` y
hacen DROP/CREATE de la base scratch.

## Reglas

- Nunca correr tests contra `sabores_latinoamerica` (viva): el helper
  `tests/support/test-db.ts` aborta si el nombre no termina en `_test`.
- Los `it.todo` NO son deuda silenciosa: cada uno nombra el todo que lo cierra.
  El todo 22 exige cero pendientes.
- No se modifica `api/tests/**`; el PHP sigue siendo la especificación.
