# Sabores de Latinoamérica 🌽

[![CI](https://github.com/bluesans/sabores-latinoamerica/actions/workflows/ci.yml/badge.svg)](https://github.com/bluesans/sabores-latinoamerica/actions/workflows/ci.yml)

Atlas gastronómico interactivo (frontend v1 vanilla JS + Vue 3 para el panel de
admin; backend **Node 24 + Fastify + MySQL** desde F1). El PHP original quedó
retirado, sin servir, en `legacy/php-api/`.

## Backend Node (F1, sirviendo vía Apache)

El backend de F1 vive en `backend/` (Node 24 + Fastify + MySQL) y es el que
responde hoy en `http://localhost/sabores-latinoamerica/api` a través del
`ProxyPass` de Apache. El PHP v1 quedó retirado en `legacy/php-api/` (bloqueado
por `.htaccess`; no se sirve).

```bash
cd backend
npm ci
cp .env.example .env     # completar DB_*, JWT_SECRET, ADMIN_*
npm run build
npm start                # escucha en 127.0.0.1:3001 (loopback)
```

- **Parar**: `Ctrl+C` en la consola o terminar el proceso `node dist/server.js`.
- **Health**: `GET /sabores-latinoamerica/api/health` (200 con `db:true`).
- **Admin inicial**: `npm run create-admin` (lee `ADMIN_USER`/`ADMIN_PASS` de `backend/.env`; `-- --force` rota la clave).
- **Tests**: `npm test`, `npm run lint`, `npm run typecheck`, `npm run openapi:check`.
- **Requisito de proxy**: `backend/.env` debe tener `TRUST_PROXY=127.0.0.1`. No usar `true`/`1`: solo se confía en el loopback de Apache.

### Cutover / rollback (F1)

El snippet de Apache está en `C:\xampp\apache\conf\httpd.conf`:

```apache
ProxyPass /sabores-latinoamerica/api http://127.0.0.1:3001/sabores-latinoamerica/api
ProxyPassReverse /sabores-latinoamerica/api http://127.0.0.1:3001/sabores-latinoamerica/api
```

**Rollback de un paso**: comentar esas dos líneas, reiniciar Apache
(`httpd -k restart`) y verificar que el PHP vuelve a servir (un `DELETE
/auth/account` sin token da `405` en PHP y `401` en Node). Para re-flipear,
descomentar y reiniciar. Con el proxy activo, el `health` de Apache debe
responder 200 y `sessions.ip` debe guardar la IP que Apache envía en
`X-Forwarded-For` (en local el cliente es 127.0.0.1).

## Puesta en marcha (con XAMPP)

1. Copiá la carpeta `sabores-latinoamerica/` dentro de `htdocs/`.
2. Importá el esquema canónico `db/migrations/000_install.sql`:
   - phpMyAdmin → pestaña **Importar** → elegí `db/migrations/000_install.sql`, o
   - consola (desde la raíz del proyecto):
     ```
     mysql -u root -p --default-character-set=utf8mb4 sabores_latinoamerica < db/migrations/000_install.sql
     ```
   Si la base no existe, creala primero. El script apunta a una base **vacía**:
   si ya tiene tablas, MySQL corta la importación con `ERROR 1050` a propósito
   (convención en `db/migrations/README.md`).
3. Instalá las dependencias del backend Node:
   ```
   cd sabores-latinoamerica/backend
   npm ci
   ```
4. Copiá `backend/.env.example` a `backend/.env` y completalo: usuario/clave de
   MySQL, `JWT_SECRET` (una clave larga y aleatoria propia), `ADMIN_USER`/`ADMIN_PASS`
   y `TRUST_PROXY=127.0.0.1` si Apache proxya. Si servís por HTTPS, revisá también `COOKIE_SECURE`.
5. Compilá y sembrá la cuenta admin:
   ```
   npm run build
   npm start                # en otra consola, deja el backend en 127.0.0.1:3001
   npm run create-admin     # con el backend detenido o en otra consola
   ```
   `create-admin` es idempotente; `-- --force` rota la contraseña.
6. Entrá a: http://localhost/sabores-latinoamerica/ e iniciá sesión con la cuenta
   admin que sembraste.

> **Nota:** el registro web crea siempre usuarios comunes (`role=user`). El rol
> `admin` solo lo otorga `npm run create-admin`.

## Arquitectura

- **Frontend**: HTML + CSS + JS vanilla como módulos ES (`js/app.js` importa el resto:
  `js/map.js`, `js/panel.js`, `js/auth.js`, `js/util/dom.js`, `js/ui/toast.js`)
  más un componente **Vue 3** versionado localmente en `js/vendor/` (sin build step)
  para el panel de administración (`js/admin.js`). Toda la comunicación con el
  backend pasa por `js/api.js`.
- **Backend**: API REST en **Node 24 + Fastify 5** (`backend/src`, rutas en
  `backend/src/routes`, datos con `mysql2` + Drizzle). El PHP Slim 4 original está
  en `legacy/php-api/` como referencia histórica y no se sirve.
- **Legacy**: `legacy/php-api/` (PHP + Composer) y, tras F2, `legacy/frontend-v1/`.
  Apache bloquea todo `legacy/` con 403.
- **Auth**: access JWT de corta duración (15 min) que vive **solo en memoria** del navegador, más un refresh token aleatorio guardado hasheado (SHA-256) en la tabla
  `sessions` y entregado como cookie `HttpOnly` / `SameSite=Strict` (`sdl_refresh`), con rotación en cada refresh y detección de reutilización.
  Middleware `AuthMiddleware`/`AdminMiddleware` protegen las rutas.

## Notas

- Seguridad de sesión: el access token nunca se persiste (nada en `localStorage`), el refresh viaja en una cookie `HttpOnly`
  que JavaScript no puede leer, y los rate limits de login/registro/refresh responden `429` con header `Retry-After`.
  El flujo completo está en la sección 8 de `documentacion-tecnica-sabores-latinoamerica.md`.
- El panel admin tiene una pestaña **Sesiones** (`GET/DELETE /admin/sessions`): lista sesiones activas
  con usuario, IP y user-agent, y permite revocarlas una por una.
- `GET /countries/{id}/recipes` acepta `?page=N&per_page=M` (máx 100) y siempre devuelve
  `pagination:{page,per_page,total,total_pages}`; sin parámetros devuelve todo como antes.
- Los ids de ruta son numéricos (`{id:[0-9]+}`); un id malformado responde `400`, uno inexistente `404`.
- Los países "apagados" del mapa son los que no tienen recetas en la BD
  (Belice, Haití, Puerto Rico). Agregá recetas y se encienden solos.
- Las estadísticas las calcula `StatsController` con consultas propias (misma matemática
  que la vista `v_estadisticas`, pero sin depender de que la vista exista).
- Los cambios de esquema van como migraciones numeradas en `db/migrations/`
  (convención en `db/migrations/README.md`); los dumps y patches históricos
  quedaron archivados, solo lectura, en `db/legacy/`.
- Los archivos `backend/.env` y `legacy/php-api/.env` **no se versionan**. Nunca subas tu
  `JWT_SECRET` real ni credenciales de base de datos al repositorio.

## Scripts y checks

```bash
cd backend && npm test              # suite Node (Vitest, requiere MySQL)
cd backend && npm run lint
cd backend && npm run typecheck
cd backend && npm run openapi:check
cd legacy/php-api && php vendor/bin/phpunit  # legado PHP (no corre en CI)
cd legacy/php-api && composer stan           # legado PHP (no corre en CI)
npm run test:js                     # 58 tests JS v1
npm run lint                        # biome check
npm run check                       # tsc --noEmit
npm run test:e2e                    # smoke UI contra XAMPP
npm run test:e2e:api                # flujo API request-only (E2E_API configurable)
```

El CI (`.github/workflows/ci.yml`) corre `backend-node` y `frontend` en cada push,
menos el E2E (necesita el XAMPP local; correlo a mano antes de pushear cambios grandes).
El job PHP fue retirado junto con la API v1.
