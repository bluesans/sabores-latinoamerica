# Sabores de Latinoamérica 🌽

[![CI](https://github.com/bluesans/sabores-latinoamerica/actions/workflows/ci.yml/badge.svg)](https://github.com/bluesans/sabores-latinoamerica/actions/workflows/ci.yml)

Atlas gastronómico interactivo (front vanilla JS + Vue 3 para el panel de admin,
API REST en PHP con **Slim 4**, base de datos MySQL).

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
3. Instalá las dependencias del backend (necesitás [Composer](https://getcomposer.org)):
   ```
   cd sabores-latinoamerica/api
   composer install
   ```
4. Copiá `api/.env.example` a `api/.env` y completalo: usuario/clave de MySQL,
   `JWT_SECRET` (una clave larga y aleatoria propia) y `ADMIN_USER`/`ADMIN_PASS`
   para la cuenta admin inicial. Si servís por HTTPS, revisá también `COOKIE_SECURE`.
5. Sembrá la cuenta admin (desde `api/`):
   ```
   php bin/create-admin.php
   ```
   Corrélo **una sola vez**; si más adelante querés rotar esa contraseña, usá `--force`.
6. Entrá a: http://localhost/sabores-latinoamerica/ e iniciá sesión con la cuenta
   admin que sembraste en el paso anterior.

> **Nota:** el registro web crea siempre usuarios comunes (`role=user`). El rol
> `admin` solo lo otorga `bin/create-admin.php`.

## Arquitectura

- **Frontend**: HTML + CSS + JS vanilla como módulos ES (`js/app.js` importa el resto:
  `js/map.js`, `js/panel.js`, `js/auth.js`, `js/util/dom.js`, `js/ui/toast.js`)
  más un componente **Vue 3** versionado localmente en `js/vendor/` (sin build step)
  para el panel de administración (`js/admin.js`). Toda la comunicación con el
  backend pasa por `js/api.js`.
- **Backend**: API REST construida con **Slim 4** (`api/index.php` es el front controller,
  las rutas están en `api/routes.php`, los controladores en `api/src/Controllers`).
  Requiere `composer install` para traer las dependencias (`slim/slim`, `slim/psr7`,
  `vlucas/phpdotenv`).
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
- El archivo `api/.env` **no se versiona** (está en `.gitignore`). Nunca subas tu
  `JWT_SECRET` real ni credenciales de base de datos al repositorio.

## Scripts y checks

```bash
cd api && php vendor/bin/phpunit   # 120 tests (Unit + Integration, con MySQL)
cd api && composer stan            # phpstan, 0 errores
npm run test:js                    # 58 tests JS
npm run lint                       # biome check
npm run check                      # tsc --noEmit
npm run test:e2e                   # smoke E2E contra XAMPP vivo (crea y borra un usuario e2e_smoke_*)
```

El CI (`.github/workflows/ci.yml`) corre todo lo anterior en cada push,
menos el E2E (necesita el XAMPP local; correlo a mano antes de pushear cambios grandes).
