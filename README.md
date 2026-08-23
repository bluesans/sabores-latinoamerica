# Sabores de Latinoamérica 🌽

Atlas gastronómico interactivo (front vanilla JS + Vue 3 para el panel de admin,
API REST en PHP con **Slim 4**, base de datos MySQL).

## Puesta en marcha (con XAMPP)

1. Copiá la carpeta `sabores-latinoamerica/` dentro de `htdocs/`.
2. Instalá las dependencias del backend (necesitás [Composer](https://getcomposer.org)):
   ```
   cd sabores-latinoamerica/api
   composer install
   ```
3. Copiá `api/.env.example` a `api/.env` y ajustá los valores (usuario/clave de MySQL,
   `JWT_SECRET` con una clave larga y aleatoria propia).
4. Abrí phpMyAdmin → pestaña **Importar** → elegí `db/sabores_latinoamerica.sql`.
   (o en consola: `mysql -u root -p < db/sabores_latinoamerica.sql`)
5. Entrá a: http://localhost/sabores-latinoamerica/
6. Creá tu cuenta desde la web (las contraseñas se guardan con bcrypt).

## Arquitectura

- **Frontend**: HTML + CSS + JS vanilla (`js/app.js`, `js/map.js`, `js/panel.js`, `js/auth.js`)
  más un componente **Vue 3** (vía CDN, sin build step) para el panel de administración
  (`js/admin.js`). Toda la comunicación con el backend pasa por `js/api.js`.
- **Backend**: API REST construida con **Slim 4** (`api/index.php` es el front controller,
  las rutas están en `api/routes.php`, los controladores en `api/src/Controllers`).
  Requiere `composer install` para traer las dependencias (`slim/slim`, `slim/psr7`,
  `vlucas/phpdotenv`).
- **Auth**: JWT (access token de corta duración) + refresh token persistido en la tabla
  `sessions`. Middleware `AuthMiddleware`/`AdminMiddleware` protegen las rutas.

## Notas

- Los países "apagados" del mapa son los que no tienen recetas en la BD
  (Belice, Haití, Puerto Rico). Agregá recetas y se encienden solos.
- Las estadísticas salen de la vista `v_estadisticas`.
- El archivo `api/.env` **no se versiona** (está en `.gitignore`). Nunca subas tu
  `JWT_SECRET` real ni credenciales de base de datos al repositorio.
