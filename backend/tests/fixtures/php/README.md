# Fixtures doradas de la API PHP viva

Captura determinista de request+response de **todas** las rutas de `api/routes.php`
(todo 7 de `.omo/plans/modernizar-sitio.md`), pensada como contrato de paridad para
el server Node de `backend/`: `capture.mjs` graba contra la API PHP viva y
`diff.mjs` replaya la misma matriz contra otra base URL y exige cero diferencias.

## Cómo regenerar y verificar

Requiere XAMPP sirviendo `api/` en `http://localhost/sabores-latinoamerica/api`
con su `.env` ya configurado. Antes de capturar nada, el script valida las
premisas de entorno: `APP_DEBUG=0`, `CORS_ORIGIN` vacío, `COOKIE_SECURE=auto`.

```bash
# Regenerar las 50 fixtures (desde la raíz del repo)
node backend/tests/fixtures/capture.mjs [--verbose] [--base-url URL]

# Comparar contra otra API (p. ej. el server Node, una vez implementado)
node backend/tests/fixtures/diff.mjs --base-url http://127.0.0.1:3001/sabores-latinoamerica/api

# O vía script npm (desde backend/)
npm run test:fixtures -- --base-url http://127.0.0.1:3001/sabores-latinoamerica/api
```

`diff.mjs` usa por defecto `http://127.0.0.1:3001/sabores-latinoamerica/api` (el
server Node). Flags: `--base-url URL` (o env `FIXTURES_BASE_URL`), `--fixtures-dir`
(por defecto `php/`), `--verbose` y `--inject-mismatch <caso>` (autotest: muta una
fixture esperada en memoria — status 9999 + `__mismatch_inyectado` — para comprobar
que el diff detecta y reporta). Exit 0 = paridad total; exit 1 = diff legible por caso.

`capture.mjs` es idempotente: dos corridas consecutivas producen bytes idénticos.
Además se limpia solo: purga usuarios `fixture7_*`, recetas e ingredientes
`Fixture7%` y `login_attempts` de `127.0.0.1`/`::1` antes y después de cada
corrida, y verifica que los cuatro conteos queden en 0.

## Estructura de una fixture

```json
{
    "case": "nombre_del_caso",
    "request": { "method": "GET", "path": "/countries", "query": {}, "headers": { "user-agent": "fixtures7-parity/1.0" }, "cookies": {}, "body": null },
    "response": { "status": 200, "headers": { "content-type": "application/json; charset=utf-8" }, "body": {} }
}
```

Los `path` de escritura usan placeholders (`<FIXTURE_RECIPE_ID>`, `<SESSION_ID>`, etc.).
La comparación es siempre como JSON parseado (el PHP escapa `/` como `\/`) con
deep-equal: el orden de las claves de objeto no importa, el de los arrays sí.
El formato del archivo sigue el estilo de biome (arrays de primitivos inline
cuando caben), para que `npx biome check` quede verde sin re-formatear.

## Índice de casos (50)

### Fase 0 — superficie pública y envelope global (5)

- `health` — GET /health → 200
- `root_404` — GET / → 404
- `ruta_desconocida_405` — GET /no-existe-este-path → 405
- `options_preflight` — OPTIONS /countries → 200 (body vacío)
- `countries_sin_token_401` — GET /countries sin token → 401

### Fase 1 — ciclo de vida de auth (10)

- `register_ok` — POST /auth/register → 200 (+ cookie refresh)
- `register_duplicado_409` — POST /auth/register (mismo usuario) → 409
- `register_password_corta_422` — POST /auth/register (password corta) → 422
- `register_username_invalido_422` — POST /auth/register (username inválido) → 422
- `login_ok` — POST /auth/login → 200
- `auth_check_ok` — GET /auth/check (Bearer) → 200
- `refresh_ok` — POST /auth/refresh (cookie) → 200 (rota la cookie)
- `refresh_sin_cookie_401` — POST /auth/refresh sin cookie → 401
- `refresh_cookie_invalida_401` — POST /auth/refresh con cookie inválida → 401
- `logout_ok` — POST /auth/logout (cookie vigente) → 200

### Fase 2 — lecturas protegidas (19)

- `countries_ok` — GET /countries → 200
- `country_recipes_ok` — GET /countries/4/recipes → 200
- `country_recipes_paginado` — GET /countries/4/recipes?per_page=2&page=1 → 200
- `country_recipes_pagina_fuera_de_rango` — GET /countries/4/recipes?per_page=2&page=99 → 200
- `country_recipes_id_cero_400` — GET /countries/0/recipes → 400
- `country_recipes_id_inexistente_404` — GET /countries/9999/recipes → 404
- `country_recipes_id_alfanumerico_405` — GET /countries/12abc/recipes → 405
- `stats_ok` — GET /stats → 200
- `ingredient_ok` — GET /ingredients/1 → 200
- `ingredient_inexistente_404` — GET /ingredients/99999 → 404
- `search_vacia` — GET /search?q= → 200
- `search_un_caracter` — GET /search?q=a → 200
- `search_con_datos` — GET /search?q=taco → 200
- `search_consulta_larga` — GET /search?q=<151 chars> → 200
- `favorites_vacio` — GET /favorites → 200
- `favorites_agregar` — POST /favorites {recipe_id:1, add:1} → 200
- `favorites_lista` — GET /favorites → 200
- `favorites_quitar` — POST /favorites {recipe_id:1} → 200
- `favorites_vacio_final` — GET /favorites → 200

### Fase 3 — administración (13)

- `admin_login_ok` — POST /auth/login (admin fixture) → 200
- `admin_sessions_forbidden_403` — GET /admin/sessions con token común → 403
- `admin_data_ok` — GET /admin/data → 200
- `admin_sessions_ok` — GET /admin/sessions → 200
- `admin_recipe_create_ok` — POST /admin/recipes → 200
- `admin_ingredient_rename_ok` — PUT /admin/ingredients/{id} → 200
- `admin_ingredient_delete_ok` — DELETE /admin/ingredients/{id} → 200
- `admin_country_update_ok` — PUT /admin/countries/4 (mismos valores) → 200
- `admin_recipe_delete_ok` — DELETE /admin/recipes/{id}abc → 200 (quirk de id)
- `admin_recipe_delete_id_invalido_404` — DELETE /admin/recipes/abc → 404
- `admin_country_id_cero_400` — PUT /admin/countries/0 → 400
- `admin_session_revoke_ok` — DELETE /admin/sessions/{id} → 200
- `admin_session_revoke_de_nuevo_404` — DELETE /admin/sessions/{id} (ya revocada) → 404

### Fase 4 — abuso (3, va al final)

- `refresh_reutilizacion_401` — POST /auth/refresh con cookie ya rotada → 401
  (reuse-detection: revoca todas las sesiones del usuario)
- `login_credenciales_incorrectas_401` — POST /auth/login (password incorrecta) → 401
- `login_rate_limit_429` — POST /auth/login (reintentos) → 429 + Retry-After
  (agota la ventana de rate limit; por eso es el último caso de la matriz)

## Normalizaciones

Todo lo volátil se reemplaza por placeholders estables antes de escribir la fixture:

- **Tokens JWT**: campo `access` → `<ACCESS_TOKEN>`; el header `authorization` del
  request usa `<ACCESS_TOKEN>` o `<ADMIN_ACCESS_TOKEN>`.
- **Envelope de error**: el `id` hex de 16 caracteres → `<ERROR_ID>`.
- **Timestamps**: `time` ISO del health y `created_at`/`expires_at`/`revoked_at`
  de `/admin/sessions` → `<TIMESTAMP>`.
- **Set-Cookie**: el valor `sdl_refresh=<64-hex>` → `sdl_refresh=<REFRESH_TOKEN>`.
- **`Retry-After`** → `<RETRY_AFTER>`.
- **Ids autoincrementales de escrituras**: `<FIXTURE_RECIPE_ID>`,
  `<FIXTURE_INGREDIENT_ID_A>` / `<FIXTURE_INGREDIENT_ID_B>`, `<SESSION_ID>`
  (también en el `path` de la request).
- **Sesiones admin**: filas re-ordenadas por contenido (el orden real depende de
  la DB y no es determinista entre corridas).
- **IP**: `::1` → `127.0.0.1` (paridad de `ip()` entre PHP y runners locales).
- **User-Agent**: `fixtures7-parity/1.0` en register/login/admin; en refresh queda `null`.
- Excepción intencional: `refresh_cookie_invalida_401` conserva la cookie literal
  (`de` × 32) para que el caso de verificación sea exacto.

## Headers

- **Incluidos** en `response.headers`: `content-type`, `www-authenticate`,
  `retry-after` (valore masking) y `set-cookie` (array enmascarado).
- **Ignorados** (varían por runtime y no son contrato): `Server`, `X-Powered-By`, `Date`.

## Limpieza e idempotencia

- Los datos fixture viven solo durante la corrida: usuario `fixture7_user`,
  admin `fixture7_admin` (vía `php api/bin/create-admin.php` con credenciales
  fixture) y receta/ingredientes `Fixture7%`.
- `login_attempts` se purga antes y después (los contadores del rate limit viven
  en la DB y sesgarían la idempotencia).
- La verificación final de limpieza (4 conteos en 0) se imprime en modo `--verbose`
  y aborta la captura si algo quedó sucio.
- No hay tokens ni secretos reales en las fixtures: los únicos valores sensibles
  son placeholders; las credenciales `fixture7_*` son cuentas de prueba efímeras.
