# Sabores de Latinoamérica 🌽

[![CI](https://github.com/bluesans/sabores-latinoamerica/actions/workflows/ci.yml/badge.svg)](https://github.com/bluesans/sabores-latinoamerica/actions/workflows/ci.yml)

Atlas gastronómico interactivo: **frontend React 19 + Vite** y **backend Node 24
+ Fastify + MySQL**. El sitio actual se sirve como SPA en
`http://localhost/sabores-latinoamerica/` y consume la API en
`/sabores-latinoamerica/api`. El PHP y el frontend vanilla originales quedaron
retirados, sin servir, en `legacy/php-api/` y `legacy/frontend-v1/`.

## Qué hay en el repo

| Carpeta | Contenido |
|---|---|
| `backend/` | API Node/Fastify, Drizzle/mysql2, tests Vitest, OpenAPI, CLI admin |
| `frontend/` | SPA React 19 + Vite, tests Vitest/RTL, e2e Playwright + axe |
| `db/migrations/` | Esquema canónico y migraciones aditivas 000–003 |
| `docs/legal/` | Auditoría de compliance (20/20) y textos legales |
| `e2e/` | Flujos API request-only (siguen vigentes) |
| `legacy/` | PHP v1 y frontend vanilla v1, bloqueados por Apache con 403 |

## Backend Node (F1, sirviendo vía Apache)

```bash
cd backend
npm ci
cp .env.example .env     # completar DB_*, JWT_SECRET, ADMIN_*
npm run build
npm start                # escucha en 127.0.0.1:3001 (loopback)
```

- **Parar**: `Ctrl+C` o terminar `node dist/server.js` (PID en `backend/server.pid` si usás el arranque documentado).
- **Health**: `GET /sabores-latinoamerica/api/health` (200 con `db:true`).
- **Admin inicial**: `npm run create-admin` (lee `ADMIN_USER`/`ADMIN_PASS` de `backend/.env`; `-- --force` rota la clave).
- **Tests**: `npm test`, `npm run lint`, `npm run typecheck`, `npm run openapi:check`.
- **Proxy**: `backend/.env` debe tener `TRUST_PROXY=127.0.0.1`; no usar `true`/`1`.
- **Consentimiento**: `CONSENT_STRICT=1` exige los tres checks en el registro web (F2). Los usuarios legacy pueden tener las columnas de consentimiento en `NULL`.

## Frontend React (F2)

```bash
cd frontend
npm ci                  # frontend/.npmrc fija legacy-peer-deps por el peer de openapi-typescript
npm run dev             # http://localhost:5173/sabores-latinoamerica/
npm test                # Vitest + RTL
npm run lint            # Biome
npm run typecheck
npm run build           # dist/
npm run api:types       # regenera src/api/types.d.ts desde backend/openapi.json
npm run e2e             # Playwright + axe (requiere API/DB y consentimiento)
```

- **Dev**: Vite proxya `/sabores-latinoamerica/api` a `http://localhost`, así que
  alcanza con tener Apache + Node corriendo.
- **Base**: `vite.config.ts` usa `base: '/sabores-latinoamerica/'`; el router usa
  el mismo basename. `VITE_API_BASE` se puede sobreescribir en `frontend/.env`.
- **Datos**: los topojson de Natural Earth están vendorizados en
  `frontend/public/data/` (50m con fallback 110m + siluetas locales). No hay
  requests al CDN en runtime.
- **Consentimiento**: `sdl_consent` en `localStorage` (versión, timestamp y
  categorías), re-consulta a los 183 días. El video de YouTube solo se carga con
  `thirdParty=true` y click explícito, usando `youtube-nocookie.com`.

## Puesta en marcha (XAMPP)

1. Copiá la carpeta `sabores-latinoamerica/` dentro de `htdocs/`.
2. Importá el esquema canónico `db/migrations/000_install.sql` en una base vacía
   (phpMyAdmin → Importar, o `mysql -u root -p --default-character-set=utf8mb4
   sabores_latinoamerica < db/migrations/000_install.sql`). Aplicá luego 001–003.
3. Instalá backend y frontend: `cd backend && npm ci`; `cd ../frontend && npm ci`.
4. Copiá `backend/.env.example` a `backend/.env` y completá MySQL, `JWT_SECRET`
   (mínimo 32 caracteres), `ADMIN_USER`/`ADMIN_PASS`, `TRUST_PROXY=127.0.0.1`.
5. Compilá y arrancá el backend; sembrá el admin:
   ```bash
   cd backend
   npm run build
   npm start                # otra consola
   npm run create-admin
   ```
6. Compilá el frontend: `cd frontend && npm run build`.
7. Entrá a `http://localhost/sabores-latinoamerica/` e iniciá sesión.

> El registro web crea siempre usuarios comunes (`role=user`). El rol `admin`
> solo lo otorga `npm run create-admin`.

## Apache: cutover y rollback

El `httpd.conf` de XAMPP tiene dos bloques. F1 (API):

```apache
ProxyPass /sabores-latinoamerica/api http://127.0.0.1:3001/sabores-latinoamerica/api
ProxyPassReverse /sabores-latinoamerica/api http://127.0.0.1:3001/sabores-latinoamerica/api
```

F2 (SPA + fallback de deep-links + bloqueo de legacy):

```apache
Alias /sabores-latinoamerica/ "C:/xampp/htdocs/sabores-latinoamerica/frontend/dist/"
<Directory "C:/xampp/htdocs/sabores-latinoamerica/frontend/dist">
    Options FollowSymLinks
    AllowOverride None
    Require all granted
    RewriteEngine On
    RewriteRule ^legacy(?:/|$) - [F,L,NC]
    FallbackResource /sabores-latinoamerica/index.html
</Directory>
```

**Rollback F2 de un paso**: restaurá
`C:\xampp\apache\conf\httpd.conf.sabores-pre-f2.bak` (o comentá el bloque
`Alias`/`Directory`), `httpd -k restart` y verificá que vuelve el v1
(`authScreen` en el HTML). Para re-flipear, restaurá
`httpd.conf.sabores-f2.bak`. El proxy `/api` sigue ganando sobre el Alias.

**Rollback F1**: comentá las dos líneas `ProxyPass` y reiniciá Apache; el PHP
legacy no está servido por la regla `.htaccess`/Rewrite, así que el rollback real
de F1 es restaurar el backup previo. El health debe dar 200 y
`sessions.ip` guarda la IP que Apache envía en `X-Forwarded-For`.

## Arquitectura

- **Frontend**: React 19 + TypeScript + Vite; React Router (rutas reales
  `/pais/:id`, legales, `/admin`), TanStack Query, GSAP (contadores),
  Lenis (scroll suave, respeta `prefers-reduced-motion`). El mapa es SVG propio
  con topojson vendorizado, proyección mercator, point-in-polygon y centroides
  portados 1:1 del v1; incluye gestures (pan/zoom/pinch), roving tabindex APG y
  una lista alternativa de países.
- **Backend**: API REST en `backend/src` (Fastify 5, rutas en `routes/`, datos
  `mysql2` + Drizzle). OpenAPI versionado en `backend/openapi.json`.
- **Auth**: access JWT de 15 min solo en memoria; refresh token aleatorio
  hasheado (SHA-256) en `sessions`, cookie `sdl_refresh` HttpOnly /
  SameSite=Strict, rotación y detección de reutilización. `DELETE /auth/account`
  borra cuenta, sesiones y favoritos con guard de último admin.
- **Legacy**: `legacy/php-api/` y `legacy/frontend-v1/`; Apache responde 403 para
  `/legacy/*` (regla del `.htaccess` y del bloque F2).

## Notas

- El access token nunca se persiste; el refresh vive en una cookie HttpOnly. Los
  rate limits de login/registro/refresh/borrado responden `429` con `Retry-After`.
- Admin: pestaña **Sesiones** con usuario, IP y user-agent; revocación individual
  y dirty-guard in-app (nunca `location.reload`).
- Paginación: `GET /countries/{id}/recipes?page=N&per_page=M` devuelve
  `pagination:{page,per_page,total,total_pages}`; sin parámetros devuelve todo.
- Los países sin recetas (Belice, Haití, Puerto Rico) se muestran apagados y se
  encienden al cargarles recetas.
- Migraciones numeradas en `db/migrations/` (forward-only); los dumps históricos
  quedaron en `db/legacy/` como lectura.
- `backend/.env`, `frontend/.env` y `legacy/php-api/.env` no se versionan. No
  subas secretos ni credenciales.
- Compliance: `docs/legal/COMPLIANCE-AUDIT.md` (20/20 ítems, evidencia y riesgos
  residuales). Los datos del titular son placeholders en
  `frontend/src/content/legal/owner.ts` y requieren revisión profesional.

## Scripts y checks

```bash
cd backend && npm test              # Vitest (requiere MySQL)
cd backend && npm run lint
cd backend && npm run typecheck
cd backend && npm run openapi:check
cd backend && npm run create-admin

cd frontend && npm test             # Vitest + RTL (24 tests)
cd frontend && npm run typecheck
cd frontend && npm run lint         # Biome
cd frontend && npm run build
cd frontend && npm run e2e          # Playwright + axe (7 tests + admin opcional)
cd frontend && npm run contrast     # 19 pares AA

npm run test:e2e:api                # flujo API request-only (E2E_API configurable)
npm run test:e2e                    # alias de frontend/e2e
```

El CI (`.github/workflows/ci.yml`) corre `backend-node` (MariaDB 10.4, migraciones
000–003, tests/lint/typecheck/openapi) y `frontend` (npm ci, Vitest, Biome,
typecheck, build y chequeo de drift de `api:types`). El E2E necesita XAMPP/API
local y se corre a mano antes de cambios grandes.
