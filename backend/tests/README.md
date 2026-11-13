# Tests del backend Node

## Suites actuales

- `tests/config.test.ts` — configuración validada con zod (todo 5).
- `tests/http-contract.test.ts` — capa HTTP / envelopes / CORS / health (todo 8).
- `tests/auth-core.test.ts` — JWT, bcrypt, cookies y refresh token, con cross-check PHP↔Node (todo 9).
- `tests/sessions.test.ts` — repositorio de sesiones sobre `sabores_node_test` (todo 10).
- `tests/rate-limit.test.ts` — rate limiting sobre `login_attempts` (todo 11).
- `tests/port/**` — port 1:1 de la suite PHP (este todo 12).

## Port de la suite PHP (todo 12)

Estrategia: un archivo Vitest por archivo PHP. Los casos cuya capa aún no
existe quedan como `it.todo` con el todo que los cierra (NUNCA rojos). Los
casos ya cubiertos por otra suite se referencian explícitamente para no
duplicar estado ni reducir cobertura.

| Archivo PHP | Port Vitest | Casos PHP | Portados ahora | Cubiertos en otra suite | Pendientes (todo) |
|---|---|---:|---:|---:|---|
| `Integration/AdminSessionsTest.php` | `port/admin-sessions.test.ts` | 14 | 2 | 2 (`tests/sessions.test.ts`) | 10 (19, 14) |
| `Integration/AdminValidationTest.php` | `port/admin-validation.test.ts` | 25 | 0 | 0 | 25 (19) |
| `Integration/AuthServiceTest.php` | `port/auth-service.test.ts` | 4 | 0 | 1 (`tests/rate-limit.test.ts`) | 3 (13, 14) |
| `Integration/CookieFlowTest.php` | `port/cookie-flow.test.ts` | 7 | 0 | 3 (`tests/sessions.test.ts`, `tests/rate-limit.test.ts`) | 4 (14) |
| `Integration/ErrorIdTest.php` | `port/error-id.test.ts` | 2 | 2 | 0 | 0 |
| `Integration/HardeningTest.php` | `port/hardening.test.ts` | 14 | 3 | 0 | 11 (17, 18, 13, 19) |
| `Integration/RemainingFlowTest.php` | `port/remaining-flow.test.ts` | 14 | 3 | 0 | 11 (17, 18, 20) |
| `Integration/SearchEscapeTest.php` | `port/search-escape.test.ts` | 4 | 0 | 0 | 4 (17) |
| `Integration/SmokeTest.php` | `port/smoke.test.ts` | 1 | 1 | 0 | 0 |
| `Integration/StatsCountryTest.php` | `port/stats-country.test.ts` | 2 | 0 | 0 | 2 (17) |
| `Integration/TransactionSweepTest.php` | `port/transaction-sweep.test.ts` | 2 | 1 | 0 | 1 (19) |
| `Unit/JwtTest.php` | `port/jwt.test.ts` | 8 | 8 (+2 de reloj) | 0 | 0 |
| `Unit/ValidationTest.php` | `port/validation.test.ts` | 13 | 0 | 0 | 13 (13) |
| **Total** | | **110** | **20** | **6** | **84** |

Notas de mapeo:

- **AdminSessions**: la truncación de user-agent y la persistencia de IP/UA en rotación se validan en `tests/sessions.test.ts`; el throttle de refresh y el logout bajo throttle se portaron a nivel service (repo + rate limit).
- **CookieFlow**: rotación y reuse-detection se validan en `tests/sessions.test.ts`; el 11.º login fallido en `tests/rate-limit.test.ts`. Falta la capa HTTP (todo 14).
- **AuthService**: el 6.º register está cubierto por la simulación de `tests/rate-limit.test.ts`.
- **TransactionSweep**: el caso de cascada se porta a nivel DB (el contrato real es `ON DELETE CASCADE`); el 404 depende del controller admin (todo 19).
- **JwtTest**: se agregaron los bordes que exige el todo 12 (±5s válidos / ±15s inválidos), además de los 8 casos originales.
- `Validation` no tiene módulo todavía; se implementa en el todo 13.

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
