# Sabores de Latinoamérica — Documentación técnica completa

> **Propósito de este documento:** explicar el proyecto de punta a punta —arquitectura, base de datos, cada endpoint de la API, cada módulo del frontend, el flujo de autenticación y un recorrido de uso real— para que alguien (persona o IA) sin ningún contexto previo pueda entenderlo y trabajar sobre él sin tener que leer todo el código fuente primero. Todos los ejemplos (JSON, SQL, datos) están tomados del código y los datos reales del proyecto.

## Índice

1. [Qué es el proyecto](#1-qué-es-el-proyecto)
2. [Stack tecnológico](#2-stack-tecnológico)
3. [Estructura de carpetas](#3-estructura-de-carpetas)
4. [Arquitectura general](#4-arquitectura-general)
5. [Base de datos](#5-base-de-datos)
6. [Backend — API REST (PHP + Slim 4)](#6-backend--api-rest-php--slim-4)
7. [Frontend (HTML + CSS + JS vanilla + Vue 3)](#7-frontend-html--css--js-vanilla--vue-3)
8. [Autenticación y autorización: flujo completo](#8-autenticación-y-autorización-flujo-completo)
9. [Recorrido de uso de punta a punta (ejemplo real)](#9-recorrido-de-uso-de-punta-a-punta-ejemplo-real)
10. [Cómo levantar el proyecto localmente](#10-cómo-levantar-el-proyecto-localmente)
11. [Cosas importantes a tener en cuenta](#11-cosas-importantes-a-tener-en-cuenta)
12. [Registro del rework (2026-08)](#12-registro-del-rework-2026-08)

---

## 1. Qué es el proyecto

**Sabores de Latinoamérica** es una aplicación web full-stack: un **atlas gastronómico interactivo** de Latinoamérica. Es una especie de single-page-app (sin router, pero con "pantallas" que se muestran/ocultan por CSS) donde el usuario:

- Ve un **mapa interactivo en SVG** de Latinoamérica, con zoom, paneo (arrastrar) y geografía real de los países.
- Hace clic en un país y se abre un **panel lateral** con sus recetas típicas: nombre, dificultad, tiempo de preparación, ingredientes y un video de YouTube.
- Puede **buscar** platos/países/ingredientes en tiempo real, marcar **recetas favoritas**, y tocar un ingrediente para ver en qué otras recetas del continente aparece.
- Si es el usuario **administrador** (cuenta sembrada por el CLI `api/bin/create-admin.php`; el registro web nunca crea admins), tiene un botón extra que abre un **panel de administración** (alta/baja/modificación de recetas, países e ingredientes) construido como un componente de Vue 3.

Es el tipo de proyecto típico de portfolio o trabajo de curso: **backend propio en PHP** con un micro-framework (Slim 4) hablando **JSON puro** por una API REST, **base de datos MySQL propia** con datos reales de 19 países y 57 recetas, y un **frontend sin frameworks pesados ni paso de build** (JS vanilla en módulos ES + un único componente Vue 3 versionado localmente). Está pensado para correr en un entorno **XAMPP** local (Apache + PHP + MySQL en `localhost`).

## 2. Stack tecnológico

| Capa | Tecnología | Detalle |
|---|---|---|
| Servidor web | Apache (vía XAMPP) | Sirve `htdocs/` como raíz del sitio |
| Backend | PHP ≥ 8.1 | `declare(strict_types=1)` en todos los archivos; autoload PSR-4 (`App\` → `api/src/`) |
| Micro-framework | [Slim 4](https://www.slimframework.com/) (`slim/slim ^4.12`, `slim/psr7 ^1.7`) | Solo enrutamiento + middlewares; **sin ORM ni motor de vistas** |
| Config | `vlucas/phpdotenv ^5.6` | Carga `api/.env` como variables de entorno |
| Base de datos | MySQL/MariaDB, charset `utf8mb4`, motor InnoDB | Acceso vía **PDO nativo** (sin ORM), 100% consultas preparadas |
| Autenticación | **JWT artesanal** (HS256, sin librerías) de vida corta, en memoria + refresh token rotativo en cookie `HttpOnly`, hasheado en tabla `sessions` | Ver sección 8 |
| Frontend | HTML5 + CSS3 + JavaScript vanilla (ES6+, módulos ES) | Sin bundler, sin framework de routing; `js/app.js` es el único `<script type="module">` e importa el resto del grafo |
| Panel admin | Vue 3 (`js/vendor/vue.global.prod.js`, versión fijada localmente) | Sin build step: el `template` vive como string dentro del `.js` |
| Mapa | SVG generado por JS + datos TopoJSON | Geografía real vía CDN, con **fallback** dibujado a mano si no hay conexión |
| Tipografías | Alfa Slab One (títulos) + Sofia Sans (texto), **autoalojadas** en `css/fonts/` como `.woff2` | Sin dependencia de Google Fonts: funcionan offline |
| Runner de tests JS | Node ≥ 18 (`node --test`) | Suites en `js/__tests__/` (`npm run test:js`) y linter de plantillas (`npm run lint:templates`) |
| QA de interfaz | Playwright (solo desarrollo) | Automatización de navegador para verificación visual y recorridos E2E manuales; no es dependencia de runtime |

No hay TypeScript, ni Docker, ni CI/CD. El esquema de base ya no vive en un dump suelto: `db/migrations/000_install.sql` es el baseline canónico y los cambios futuros son migraciones numeradas (convención en `db/migrations/README.md`; los dumps y patches históricos quedaron archivados en `db/legacy/`). Sí hay tests automatizados: PHPUnit en `api/tests/` (`composer test`, o invocando `vendor\phpunit\phpunit\phpunit` directamente si no hay Composer) y JS nativo en `js/__tests__/` (`npm run test:js`). El análisis estático del backend corre limpio en PHPStan nivel 8.

## 3. Estructura de carpetas

```
htdocs/                          ← raíz servida por Apache (carpeta típica de XAMPP)
├── index.html                   ← única página HTML de todo el frontend
├── README.md
├── package.json                 ← scripts npm del front: test:js y lint:templates
├── scripts/
│   └── lint-templates.mjs       ← linter de sinks innerHTML (prohíbe interpolar datos sin escape)
├── css/
│   ├── styles.css               ← todo el CSS del proyecto, con variables :root y @font-face
│   └── fonts/                   ← tipografías autoalojadas (.woff2: Alfa Slab One + Sofia Sans)
├── js/                          ← módulos ES; app.js importa todo el grafo
│   ├── config.js                ← URL base de la API (1 constante)
│   ├── data.js                  ← geometría de respaldo del mapa + paleta de colores + labels de dificultad
│   ├── util/
│   │   └── dom.js               ← builders puros de HTML (esc/safeUrl/buscador); sin DOM, testeables con node --test
│   ├── ui/
│   │   └── toast.js             ← aviso flotante compartido por auth/panel/mapa/admin
│   ├── vendor/
│   │   └── vue.global.prod.js   ← Vue 3 fijado localmente (sin CDN)
│   ├── __tests__/               ← suites con el runner nativo de Node (api/dom/smoke .test.mjs)
│   ├── api.js                   ← cliente HTTP hacia la API (fetch + timeouts + JWT en memoria)
│   ├── auth.js                  ← lógica de la pantalla de login/registro
│   ├── map.js                   ← mapa interactivo SVG (el módulo más complejo del proyecto)
│   ├── panel.js                 ← panel lateral de recetas + modal de ingredientes + favoritos
│   ├── admin.js                 ← panel de administración, componente Vue 3
│   └── app.js                   ← orquestador general: buscador, stats, auto-login, utilidades
├── db/
│   ├── migrations/
│   │   ├── 000_install.sql      ← baseline canónico: crea la BD, tablas, vista y datos semilla
│   │   └── README.md            ← convención de migraciones numeradas
│   └── legacy/                  ← dumps y patches históricos (solo lectura, no aplicar)
└── api/                         ← backend completo, subcarpeta con su propio front controller
    ├── index.php                ← front controller (arranca Slim)
    ├── routes.php               ← definición de todas las rutas
    ├── bin/
    │   └── create-admin.php     ← CLI que siembra la cuenta admin inicial (lee ADMIN_USER/ADMIN_PASS del .env)
    ├── tests/
    │   ├── bootstrap.php        ← bootstrap común (env de prueba) + enganche del harness de integración
    │   ├── Unit/                ← tests unitarios (Jwt, Validation), sin base de datos
    │   └── Integration/         ← tests contra MySQL real (base descartable sabores_latinoamerica_test,
    │                              reconstruida desde 000_install.sql en cada corrida)
    ├── composer.json / .lock    ← dependencias PHP
    ├── phpunit.xml              ← suites Unit e Integration
    ├── phpstan.neon             ← análisis estático, nivel 8
    ├── .env.example             ← plantilla de variables de entorno (copiar a .env)
    ├── .htaccess                ← reescribe toda request hacia index.php
    ├── .gitignore               ← ignora /vendor y .env
    ├── vendor/                  ← dependencias instaladas por Composer (Slim, PSR-7, phpdotenv, PHPUnit, PHPStan)
    └── src/
        ├── Controllers/         ← 9 controladores, uno por recurso
        │   ├── AuthController.php
        │   ├── CountryController.php
        │   ├── RecipeController.php
        │   ├── IngredientController.php
        │   ├── SearchController.php
        │   ├── StatsController.php
        │   ├── FavoriteController.php
        │   ├── AdminController.php
        │   └── HealthController.php   ← GET /health (chequeo de API y base de datos)
        ├── Middleware/
        │   ├── AuthMiddleware.php
        │   ├── AdminMiddleware.php
        │   ├── CorsMiddleware.php
        │   └── JsonErrorHandler.php   ← errores siempre en JSON, con id rastreable
        ├── Services/
        │   └── AuthService.php        ← lógica de register/login/refresh/logout, inyectable con un PDO
        └── Support/             ← helpers/servicios compartidos
            ├── Env.php
            ├── Database.php
            ├── Jwt.php
            ├── Auth.php
            ├── Cookies.php
            ├── Validation.php
            └── JsonResponder.php
```

Hay **dos capas independientes conviviendo en la misma carpeta servida por Apache**: el frontend estático vive en la raíz de `htdocs/`, y el backend vive en `htdocs/api/`, con su propio front controller y su propio `.htaccess`. Front y back se comunican **solo por HTTP/JSON** (`fetch`), como si fueran dos aplicaciones separadas, aunque convivan en el mismo host y XAMPP los sirva juntos.

## 4. Arquitectura general

```mermaid
flowchart LR
    subgraph CLIENTE["Navegador"]
        HTML["index.html"]
        JSF["JS vanilla (módulos ES)<br/>+ Vue 3 (vendor local)"]
    end

    subgraph SERVIDOR["Apache + PHP 8.1+ (XAMPP)"]
        HT[".htaccess<br/>reescribe todo a index.php"]
        IDX["api/index.php<br/>Slim 4 - front controller"]
        MW["Middlewares<br/>CORS / Routing / Error<br/>Auth y Admin por ruta"]
        CTRL["Controladores<br/>api/src/Controllers"]
        HT --> IDX --> MW --> CTRL
    end

    DB[("MySQL<br/>sabores_latinoamerica")]

    HTML --- JSF
    JSF -- "fetch() JSON<br/>Authorization: Bearer JWT" --> HT
    CTRL -- "PDO / SQL preparado" --> DB
    CTRL -- "respuesta JSON" --> JSF
```

Puntos clave:

- El **frontend no tiene paso de build**: `index.html` carga Vue desde `js/vendor/` y un único `<script type="module">` (`js/app.js`), que importa explícitamente al resto del grafo (`api.js`, `auth.js`, `map.js`, `panel.js`, `admin.js`, `util/dom.js`, `ui/toast.js`). Al ser módulos ES, ya no hay que mantener un orden global de scripts: cada archivo declara lo que usa (detalle exacto en la sección 7).
- El **backend sigue el patrón "front controller"**: toda request a `api/*` que no sea un archivo físico pasa por `api/index.php` (gracias al `.htaccess`), que arma la app de Slim, registra middlewares y rutas, y despacha al controlador correspondiente.
- **No hay vistas del lado del servidor.** El backend es una API REST pura que solo devuelve JSON. Todo el HTML lo genera el JS del cliente manipulando el DOM directamente (salvo el panel de admin, que usa Vue 3).
- La sesión **no usa sesiones PHP ni `localStorage`**: el access JWT vive solo en memoria del navegador y viaja en el header `Authorization: Bearer <token>`; el refresh token viaja en una cookie `HttpOnly` (`sdl_refresh`) que JavaScript no puede leer. Detalle completo en la sección 8.

## 5. Base de datos

### 5.1 Diagrama entidad-relación

```mermaid
erDiagram
    USERS ||--o{ SESSIONS : posee
    USERS ||--o{ FAVORITES : marca
    COUNTRIES ||--o{ RECIPES : contiene
    RECIPES ||--o{ RECIPE_INGREDIENT : usa
    INGREDIENTS ||--o{ RECIPE_INGREDIENT : aparece_en
    RECIPES ||--o{ FAVORITES : es_favorita_en

    USERS {
        int id PK
        string username UK
        string password "bcrypt"
        string role "'user' | 'admin'"
        datetime created_at
    }
    SESSIONS {
        bigint id PK
        int user_id FK
        string token UK "hash SHA-256 del refresh"
        datetime expires_at
        datetime revoked_at
    }
    COUNTRIES {
        int id PK
        int iso_code UK
        string name
        string emoji
        string tagline
    }
    RECIPES {
        int id PK
        int country_id FK
        string name
        text description
        string difficulty "easy medium hard"
        int time_minutes
        string youtube_id
    }
    INGREDIENTS {
        int id PK
        string name UK
    }
    RECIPE_INGREDIENT {
        int recipe_id PK_FK
        int ingredient_id PK_FK
    }
    FAVORITES {
        int user_id PK_FK
        int recipe_id PK_FK
        datetime created_at
    }
```

### 5.2 Las tablas, tal como están en `db/migrations/000_install.sql`

**`users`** — cuentas de usuario. La contraseña nunca se guarda en texto plano: se hashea con `password_hash()` (bcrypt) al registrarse. El rol solo puede setearlo el CLI `api/bin/create-admin.php`; el registro web siempre crea `user`.
```sql
CREATE TABLE `users` (
  `id`         INT NOT NULL AUTO_INCREMENT,
  `username`   VARCHAR(30)  NOT NULL,
  `password`   VARCHAR(255) NOT NULL,           -- bcrypt (password_hash)
  `role`       ENUM('user','admin') NOT NULL DEFAULT 'user',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_username` (`username`)
);
```

**`sessions`** — refresh tokens activos (uno o varios por usuario; permite tener sesión abierta en varios dispositivos y revocarlos individualmente marcando `revoked_at` o borrando la fila). La columna `token` guarda el **hash SHA-256** del token, nunca el valor crudo que recibe el navegador; cada refresh **rota** el token (revoca el viejo, crea uno nuevo) y si un token ya revocado vuelve a presentarse se borran todas las sesiones del usuario (sección 8).
```sql
CREATE TABLE `sessions` (
  `id`         BIGINT NOT NULL AUTO_INCREMENT,
  `user_id`    INT NOT NULL,
  `token`      CHAR(64) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` DATETIME NOT NULL,
  `revoked_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_token` (`token`),
  KEY `idx_sessions_user` (`user_id`),
  KEY `idx_sessions_user_revoked` (`user_id`, `revoked_at`),
  CONSTRAINT `fk_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);
```

**`login_attempts`** — rate limiter de intentos de login/registro por IP (la usa `Auth::checkLoginRate()`/`Auth::recordFailedLogin()`).
```sql
CREATE TABLE `login_attempts` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ip`           VARCHAR(45) NOT NULL,
  `username`     VARCHAR(30) NOT NULL DEFAULT '',
  `action`       ENUM('login','register') NOT NULL DEFAULT 'login',
  `attempted_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_login_attempts_ip_time` (`ip`, `attempted_at`),
  KEY `idx_login_attempts_username` (`username`),
  KEY `idx_login_attempts_action_ip_time` (`action`, `ip`, `attempted_at`)
);
```

**`countries`** — catálogo de países. `iso_code` es el código numérico ISO 3166-1 (ej. 32 = Argentina, 484 = México); el frontend lo usa como clave para unir con la geometría del mapa.
```sql
CREATE TABLE `countries` (
  `id`       INT NOT NULL,
  `iso_code` INT NOT NULL,
  `name`     VARCHAR(100) NOT NULL,
  `emoji`    VARCHAR(10)  DEFAULT NULL,
  `tagline`  VARCHAR(150) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_iso_code` (`iso_code`)
);
```

**`recipes`** — recetas, cada una ligada a un país.
```sql
CREATE TABLE `recipes` (
  `id`           INT NOT NULL AUTO_INCREMENT,
  `country_id`   INT NOT NULL,
  `name`         VARCHAR(200) NOT NULL,
  `description`  TEXT DEFAULT NULL,
  `difficulty`   ENUM('easy','medium','hard') DEFAULT NULL,
  `time_minutes` INT DEFAULT NULL,
  `youtube_id`   VARCHAR(30) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_recipe_country` (`country_id`),
  KEY `idx_recipes_country_name` (`country_id`, `name`),
  CONSTRAINT `fk_recipe_country` FOREIGN KEY (`country_id`) REFERENCES `countries` (`id`)
);
```

**`ingredients`** — catálogo **único** y normalizado de ingredientes (no se repiten por receta; "Cebolla" es una sola fila aunque la usen 15 recetas).
```sql
CREATE TABLE `ingredients` (
  `id`   INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(200) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ing_name` (`name`)
);
```

**`recipe_ingredient`** — tabla puente muchos-a-muchos entre recetas e ingredientes, con clave primaria compuesta y borrado en cascada.
```sql
CREATE TABLE `recipe_ingredient` (
  `recipe_id`     INT NOT NULL,
  `ingredient_id` INT NOT NULL,
  PRIMARY KEY (`recipe_id`,`ingredient_id`),
  KEY `fk_ri_ingredient` (`ingredient_id`),
  CONSTRAINT `fk_ri_recipe`     FOREIGN KEY (`recipe_id`)     REFERENCES `recipes` (`id`)     ON DELETE CASCADE,
  CONSTRAINT `fk_ri_ingredient` FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients` (`id`) ON DELETE CASCADE
);
```

**`favorites`** — recetas marcadas como favoritas por cada usuario (la usa `FavoriteController`).
```sql
CREATE TABLE `favorites` (
  `user_id`    INT NOT NULL,
  `recipe_id`  INT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `recipe_id`),
  KEY `idx_favorites_recipe` (`recipe_id`),
  CONSTRAINT `fk_favorites_user`   FOREIGN KEY (`user_id`)   REFERENCES `users` (`id`)   ON DELETE CASCADE,
  CONSTRAINT `fk_favorites_recipe` FOREIGN KEY (`recipe_id`) REFERENCES `recipes` (`id`) ON DELETE CASCADE
);
```

**Vista `v_estadisticas`** — precalcula los 4 números que se muestran en la barra de estadísticas del home:
```sql
CREATE OR REPLACE VIEW `v_estadisticas` AS
SELECT
  (SELECT COUNT(DISTINCT `country_id`) FROM `recipes`)                                   AS `paises_con_recetas`,
  (SELECT COUNT(*) FROM `recipes`)                                                       AS `total_recetas`,
  (SELECT COUNT(*) FROM `ingredients`)                                                   AS `ingredientes_distintos`,
  (SELECT COUNT(*) FROM `recipes` WHERE `youtube_id` IS NOT NULL AND `youtube_id` <> '') AS `recetas_con_video`;
```

### 5.3 Datos semilla incluidos

El baseline no solo crea el esquema: también lo llena con datos reales curados a mano.

| Entidad | Cantidad | Ejemplos |
|---|---|---|
| Países | 22 (19 con recetas + 3 "apagados") | México 🇲🇽, Argentina 🇦🇷, Brasil 🇧🇷, Perú 🇵🇪… Belice 🇧🇿, Haití 🇭🇹 y Puerto Rico 🇵🇷 están cargados pero **sin recetas** (a propósito, para mostrar el estado "próximamente" en el mapa) |
| Recetas | 57 | *Tacos al Pastor* (México), *Ceviche Peruano* (Perú), *Feijoada* (Brasil), *Bandeja Paisa* (Colombia), *Chivito Uruguayo* (Uruguay)… cada una con descripción, dificultad, minutos y un ID real de video de YouTube |
| Ingredientes | 185, únicos | "Cebolla", "Ajo", "Limón peruano", "Chile guajillo"… compartidos entre recetas |
| Relaciones receta↔ingrediente | ~330 filas | ej. la receta 10 (Ceviche Peruano) usa los ingredientes 56 a 62: Corvina o lenguado, Limón peruano, Ají limo, Cebolla morada, Culantro, Choclo, Camote |

## 6. Backend — API REST (PHP + Slim 4)

### 6.1 Punto de entrada: `api/index.php`

```php
require __DIR__ . '/vendor/autoload.php';

if (file_exists(__DIR__ . '/.env')) {
    Dotenv\Dotenv::createImmutable(__DIR__)->load();
}

$app = AppFactory::create();
$app->setBasePath(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'])));

$app->addBodyParsingMiddleware();
$app->addRoutingMiddleware();

// Errores convertidos a JSON.
$errorMiddleware = $app->addErrorMiddleware(Env::get('APP_DEBUG', '0') === '1', true, true);
$errorMiddleware->setDefaultErrorHandler(new JsonErrorHandler());

$app->add(CorsMiddleware::class); // agregado último => envuelve todo, incluidos errores

$app->options('/{routes:.+}', function ($request, $response) {
    return $response;
});

(require __DIR__ . '/routes.php')($app);
$app->run();
```

Detalles importantes:
- `setBasePath()` calcula automáticamente la subcarpeta donde corre (por ejemplo `/sabores-latinoamerica/api` si XAMPP lo sirve así), así el proyecto funciona sin importar en qué carpeta de `htdocs` se lo copie.
- **El orden de los `->add()` importa.** Slim apila los middlewares como "capas de una cebolla": el último agregado es el que se ejecuta **primero** al llegar la request (y último al salir la respuesta). Por eso `CorsMiddleware` se agrega al final: así envuelve absolutamente todo, incluso las respuestas de error, garantizando que los headers CORS estén siempre presentes.
- Hay una ruta comodín `OPTIONS /{routes:.+}` que responde vacío para no romper el *preflight* CORS de los navegadores antes de que el ruteo normal exija una coincidencia exacta.
- **Los errores siempre salen en JSON** gracias a `JsonErrorHandler` (el manejador por defecto del error middleware): mapea 404/405 y excepciones HTTP a mensajes amigables, genera un **`id` de error** de 8 caracteres hexa que incluye en el body (`{"ok":false,"error":"...","id":"a1b2c3d4"}`) y escribe una línea en el log de PHP con ese mismo id (`[api-error a1b2c3d4] Clase: mensaje in archivo:línea`) para poder rastrear el incidente completo desde el log. En modo debug (`APP_DEBUG=1`) el body agrega además `exception`, `message`, `file` y `line`.

### 6.2 Rutas: `api/routes.php`

| Método | Ruta | Controlador → método | Protección | Qué hace |
|---|---|---|---|---|
| GET | `/health` | HealthController → index | Pública | Chequeo de vida: responde `200` si API y MySQL responden, `503` si la base falla |
| POST | `/auth/register` | AuthController → register | Pública | Crea cuenta (bcrypt, siempre `role=user`); responde `access` y deja el refresh en cookie |
| POST | `/auth/login` | AuthController → login | Pública | Verifica credenciales, responde `access` y deja el refresh en cookie `sdl_refresh` |
| POST | `/auth/logout` | AuthController → logout | Pública | Revoca en `sessions` el refresh de la cookie y expira la cookie |
| POST | `/auth/refresh` | AuthController → refresh | Cookie *sdl_refresh* | Rota el refresh token y emite un `access` nuevo |
| GET | `/auth/check` | AuthController → check | Bearer *access* | Confirma sesión activa (usado para auto-login) |
| GET | `/countries` | CountryController → index | Bearer *access* | Lista países + cantidad de recetas de cada uno |
| GET | `/countries/{id}/recipes` | RecipeController → byCountry | Bearer *access* | Recetas de un país, con sus ingredientes |
| GET | `/stats` | StatsController → index | Bearer *access* | Estadísticas globales + top 8 ingredientes más usados |
| GET | `/ingredients/{id}` | IngredientController → show | Bearer *access* | Un ingrediente + todas las recetas que lo usan |
| GET | `/search?q=` | SearchController → index | Bearer *access* | Busca en países, recetas e ingredientes a la vez |
| GET | `/favorites` | FavoriteController → index | Bearer *access* | Recetas favoritas del usuario logueado |
| POST | `/favorites` | FavoriteController → toggle | Bearer *access* | Agrega/quita una receta de favoritos |
| GET | `/admin/data` | AdminController → list | Bearer *access* + rol `admin` | Todo el dataset (recetas, países, ingredientes) para el panel |
| POST | `/admin/recipes` | AdminController → saveRecipe | Bearer *access* + rol `admin` | Crea o edita una receta y sincroniza sus ingredientes |
| DELETE | `/admin/recipes/{id}` | AdminController → deleteRecipe | Bearer *access* + rol `admin` | Borra una receta |
| PUT | `/admin/countries/{id}` | AdminController → saveCountry | Bearer *access* + rol `admin` | Edita emoji/tagline de un país |
| PUT | `/admin/ingredients/{id}` | AdminController → renameIngredient | Bearer *access* + rol `admin` | Renombra un ingrediente |
| DELETE | `/admin/ingredients/{id}` | AdminController → deleteIngredient | Bearer *access* + rol `admin` | Borra un ingrediente (y sus relaciones, por `ON DELETE CASCADE`) |

Las rutas de `/admin/*` están agrupadas con `$app->group('/admin', ...)` y llevan **dos middlewares encadenados**:
```php
})->add(AdminMiddleware::class)->add(AuthMiddleware::class);
```
Por la misma razón que el CORS (última capa = primera en ejecutarse), esto corre **primero `AuthMiddleware`** (valida el JWT y completa quién es el usuario) **y después `AdminMiddleware`** (revisa que ese usuario tenga rol `admin`) — en ese orden, aunque en el código estén escritos al revés. El propio archivo lo aclara con un comentario: *"Debe aplicarse siempre después de AuthMiddleware (que llena auth_user)"*.

### 6.3 Middlewares

**`AuthMiddleware`** — exige un JWT válido en el header `Authorization`. Si falta o está vencido/corrupto, corta la request con `401` antes de llegar al controlador. Si es válido, cuelga los datos del usuario en el `Request` como atributo `auth_user`:
```php
public function __invoke(Request $request, Handler $handler): Response
{
    $token = Auth::bearerToken($request);
    $payload = $token ? Jwt::decode($token) : null;

    if (!$payload) {
        // ...responde 401 {"ok":false,"error":"Necesitás iniciar sesión."}
    }

    $request = $request->withAttribute('auth_user', [
        'user_id'  => (int) $payload['sub'],
        'username' => $payload['name'],
        'role'     => $payload['role'] ?? 'user',
    ]);
    return $handler->handle($request);
}
```

**`AdminMiddleware`** — lee ese mismo atributo `auth_user` (por eso debe ejecutarse después de `AuthMiddleware`) y corta con `403` si el rol no es `admin`.

**`CorsMiddleware`** — agrega a **toda** respuesta los headers `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Headers: Content-Type, Authorization` y `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`.

### 6.4 Clases de soporte (`api/src/Support`)

- **`Env`** — wrapper sobre `$_ENV`/`getenv()` con valor por defecto; evita repetir esa lógica en todos lados.
- **`Database`** — conexión PDO **singleton** (una sola instancia por request) a MySQL, con `ERRMODE_EXCEPTION` y `FETCH_ASSOC` por defecto.
- **`Jwt`** — implementación **manual** de JWT HS256 (sin librerías tipo `firebase/php-jwt`): codifica/decodifica header+payload en Base64URL y firma con `hash_hmac('sha256', ...)`, comparando con `hash_equals()` (comparación a tiempo constante, evita timing attacks). `issueAccess()` arma el payload estándar:
```php
public static function issueAccess(array $user): string
{
    return self::encode([
        'sub'  => (int) $user['id'],
        'name' => $user['username'],
        'role' => $user['role'] ?? 'user',
        'iat'  => time(),
        'exp'  => time() + Env::int('JWT_TTL', 900), // 900s = 15 minutos
    ]);
}
```
- **`Auth`** — helpers: extraer el token `Bearer` del header, leer el usuario ya adjuntado por el middleware, crear un refresh token (32 bytes aleatorios en hex; en la tabla `sessions` se guarda su **hash SHA-256**, nunca el valor crudo), buscar/revocar sesiones (con `FOR UPDATE` para el refresh) y un **rate limiter** de intentos por IP (`checkLoginRate`/`recordFailedLogin`: máximo 10 logins fallidos cada 5 minutos; `checkRegisterRate`: 5 registros cada 15). Cuando el límite se pasa, el controlador responde `429` con header `Retry-After`. *(La tabla `login_attempts` que esto usa está creada en el baseline canónico `db/migrations/000_install.sql`.)*
- **`Cookies`** — emite (`issue`) y limpia (`clear`) la cookie de refresh `sdl_refresh` (`HttpOnly`, `SameSite=Strict`, `Path` = base de la API, `Secure` según `COOKIE_SECURE`); como usa `withHeader()`, cada respuesta lleva como máximo un `Set-Cookie`, nunca duplicados.
- **`Validation`** — reglas de usuario y contraseña compartidas por registro/login (mismas que valida el frontend).
- **`JsonResponder`** — un `trait` con un solo método `json()` que todos los controladores usan para no repetir `json_encode` + headers en cada respuesta.

### 6.5 Controladores, uno por uno

#### `AuthController` — el más importante

- **`register`**: valida usuario (regex `^[\p{L}\p{N}_]{3,30}$`, o sea letras/números/guión bajo, 3 a 30 caracteres) y contraseña (mínimo 8 caracteres, máximo 72), y crea la cuenta con `password_hash()`. Si el username ya existe, el índice `UNIQUE` corta el `INSERT` y responde `409` con un mensaje amigable. **Siempre crea `role=user`**: el rol admin solo lo otorga el CLI `bin/create-admin.php`. Responde con el `access` para loguear directo tras registrarse; el refresh sale como cookie.
- **`login`**: chequea rate limit por IP (con `Retry-After` en el `429`), busca el usuario y valida con `password_verify()`. Si todo está bien devuelve el `access` nuevo y deja el refresh en la cookie.
- **`refresh`**: lee el token de la cookie `sdl_refresh` (el header `Authorization: Bearer` queda solo como fallback de transición), lo busca hasheado en `sessions` con `FOR UPDATE`, y si es válido **rota**: revoca el viejo, crea uno nuevo y emite un `access` nuevo. Si el token que llega ya estaba revocado, asume credencial robada y borra todas las sesiones del usuario.
- **`check`**: confirma que el `access` todavía es válido y que el usuario sigue existiendo en la base (usado al abrir la app para restaurar la sesión en silencio).
- **`logout`**: revoca en `sessions` el refresh token que viene en la cookie y expira la cookie, haya fila que revocar o no.

Ejemplo de respuesta de `POST /auth/login` (ojo: ningún token de refresh en el body):
```json
{
  "ok": true,
  "username": "chef_querubin",
  "role": "user",
  "access": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjcsIm5hbWUiOiJjaGVmX3F1ZXJ1YmluIiwicm9sZSI6InVzZXIiLCJpYXQiOjE3NTU1NTU1NTUsImV4cCI6MTc1NTU1NjQ1NX0.f3a8c1..."
}
```
El refresh viaja en un header aparte:
```
Set-Cookie: sdl_refresh=b7f1c0a9e3d84f21a6c9502e7fa1b3d0c8e5a17f...; Path=/sabores-latinoamerica/api; Max-Age=604800; HttpOnly; SameSite=Strict
```
El `access` decodificado (la parte del medio, el *payload*) es:
```json
{ "sub": 7, "name": "chef_querubin", "role": "user", "iat": 1755555555, "exp": 1755556455 }
```

#### `CountryController`
Un solo endpoint: `GET /countries`. Trae todos los países con la cantidad de recetas de cada uno usando `LEFT JOIN` + `COUNT` (así los países sin recetas también aparecen, con `recipe_count: 0`). El `GROUP BY` lista **todas** las columnas seleccionadas (`c.id, c.iso_code, c.name, c.emoji, c.tagline`) para ser compatible con `ONLY_FULL_GROUP_BY` en MySQL y también en MariaDB, que a diferencia de MySQL no infiere dependencia funcional desde la primary key:
```sql
SELECT c.id, c.iso_code, c.name, c.emoji, c.tagline, COUNT(r.id) AS recipe_count
FROM countries c LEFT JOIN recipes r ON r.country_id = c.id
GROUP BY c.id, c.iso_code, c.name, c.emoji, c.tagline ORDER BY c.id
```

#### `RecipeController`
`GET /countries/{id}/recipes`. Primero busca el país (404 si no existe), después sus recetas, y después **todos los ingredientes de todas esas recetas en una sola consulta** (con `WHERE ri.recipe_id IN (?,?,?...)`) para evitar el problema N+1 (una query por receta). Ejemplo de respuesta para `GET /countries/4/recipes` (Perú, id real en la base):
```json
{
  "ok": true,
  "country": { "id": 4, "name": "Perú", "emoji": "🇵🇪", "tagline": "La despensa del Pacífico" },
  "recipes": [
    {
      "id": 10, "name": "Ceviche Peruano",
      "description": "Pescado fresco marinado en limón con ají limo, cebolla morada y culantro...",
      "difficulty": "easy", "time_minutes": 25, "youtube_id": "oRw2YNE5kLU",
      "ingredients": [
        { "id": 56, "name": "Corvina o lenguado" },
        { "id": 57, "name": "Limón peruano" },
        { "id": 58, "name": "Ají limo" },
        { "id": 59, "name": "Cebolla morada" },
        { "id": 60, "name": "Culantro" },
        { "id": 61, "name": "Choclo" },
        { "id": 62, "name": "Camote" }
      ]
    }
  ]
}
```

#### `IngredientController`
`GET /ingredients/{id}`. Dado un ingrediente, devuelve todas las recetas (de cualquier país) que lo usan, ordenadas por país y receta. Es lo que alimenta el modal de "¿en qué otras recetas aparece este ingrediente?".

#### `SearchController`
`GET /search?q=`. Requiere mínimo 2 caracteres. Hace **tres búsquedas `LIKE` en paralelo** (países, recetas por nombre o descripción, ingredientes) y devuelve hasta 4/6/4 resultados de cada tipo respectivamente, en un solo JSON. Antes de armar los patrones, escapa los comodines de `LIKE` (`%`, `_` y la propia `\`) con `addcslashes()`, así el usuario busca texto literal y no patrones.

#### `StatsController`
`GET /stats`. Calcula los 4 contadores globales con **subconsultas propias e inline** (misma matemática que la vista `v_estadisticas`, pero sin leerla): así `/stats` sigue funcionando aunque la vista no exista y el endpoint queda portable entre instalaciones. Además devuelve el top 8 de ingredientes más usados en todo el sitio (`GROUP BY i.id, i.name` + `COUNT` + `ORDER BY uses DESC, i.name LIMIT 8`).

#### `HealthController`
`GET /health`, público. Ejecuta un `SELECT 1` contra la base y responde `200` con `{ ok, api, db, time }` si todo responde, o `503` si la base falla; útil para monitoreo y para que el front verifique la API. Como casi todos los controladores del proyecto, acepta un tercer parámetro opcional `PDO|array|null`: si le inyectan un PDO (los tests de integración lo hacen) lo usa, y si Slim le pasa el array de argumentos de ruta (su estrategia de invocación por defecto siempre pasa un tercer argumento posicional) o `null`, cae al `Database::connection()` compartido.

#### `FavoriteController`
- `GET /favorites`: recetas favoritas del usuario logueado (join `favorites` → `recipes` → `countries`).
- `POST /favorites` con body `{ "recipe_id": 10, "add": 1 }`: agrega (`INSERT IGNORE`, así no falla si ya estaba) o quita (`DELETE`) según el flag `add`.

#### `AdminController` — el CRUD completo
- **`list`**: trae de una sola vez todas las recetas (con sus ingredientes ya agrupados en PHP), todos los países y todos los ingredientes con su cantidad de usos — es el "dataset inicial" que consume el panel de Vue.
- **`saveRecipe`**: crea (`id=0`) o actualiza (`id>0`) una receta dentro de una **transacción**. Para los ingredientes, usa una estrategia simple de "borrar todo y recrear":
  ```php
  $pdo->prepare('DELETE FROM recipe_ingredient WHERE recipe_id = ?')->execute([$id]);
  foreach ((array) ($b['ingredients'] ?? []) as $nm) {
      $pdo->prepare('INSERT IGNORE INTO ingredients (name) VALUES (?)')->execute([$nm]);
      // ...busca el id (recién creado o ya existente) y lo linkea en recipe_ingredient
  }
  ```
  Es decir: si escribís el nombre de un ingrediente que no existe todavía, **se crea solo** en el catálogo. Si ya existe, se reutiliza (gracias al `UNIQUE KEY` sobre `name` + `INSERT IGNORE`).
- **`deleteRecipe`** / **`deleteIngredient`**: `DELETE` directo; los borrados en `recipe_ingredient` quedan cubiertos por `ON DELETE CASCADE`.
- **`saveCountry`**: solo permite editar `emoji` y `tagline` (no el nombre ni el `iso_code`, que son estructurales).
- **`renameIngredient`**: atrapa la excepción de PDO si el nuevo nombre choca con el `UNIQUE KEY` y responde `409` con un mensaje amigable en vez de un error 500:
  ```php
  } catch (PDOException $e) {
      return $this->json($response, ['ok' => false, 'error' => 'Ese nombre ya existe.'], 409);
  }
  ```

## 7. Frontend (HTML + CSS + JS vanilla + Vue 3)

### 7.1 `index.html` — la estructura de "pantallas"

Todo vive en un único HTML con tres bloques principales que se muestran/ocultan por CSS (clase `.on`):
- `#authScreen` — pantalla partida en dos: a la izquierda, presentación de la marca con banderines animados y un marquesina (marquee) de nombres de platos; a la derecha, el formulario de login/registro con pestañas.
- `#appScreen` — la app en sí: header con logo y usuario, el mapa, la barra de estadísticas y el footer.
- `#panel` (`<aside>`) — panel lateral deslizante, reutilizado para tres cosas distintas según el momento: recetas de un país, favoritos, o el panel de admin.
- `#ingModal` — modal centrado para "recetas que usan este ingrediente".

Solo hay dos etiquetas de script en el HTML: Vue versionado localmente (clásico, para que `admin.js` lo encuentre en `window.Vue`) y un único módulo ES que importa todo el grafo:
```html
<script src="js/vendor/vue.global.prod.js"></script>
<script type="module" src="js/app.js"></script>
```
`app.js` declara sus imports explícitos (`./api.js`, `./auth.js`, `./map.js`, `./panel.js`, `./admin.js`, `./ui/toast.js`, `./util/dom.js`), y cada uno de esos módulos hace lo propio con sus dependencias. Al ser módulos ES no hay variables globales compartidas: el orden de carga lo resuelve el grafo de imports, no la posición de las etiquetas.

### 7.2 Sistema de diseño (`css/styles.css`)

Tema oscuro definido con variables CSS en `:root`: `--ink` (fondo casi negro), `--panel`/`--panel2` (superficies), `--cream` (texto), y cuatro colores de acento inspirados en Latinoamérica: `--yellow` (maíz), `--aji` (rojo-naranja), `--jade` (verde) y `--rosa`. Tipografía: **Alfa Slab One** para títulos grandes (estilo cartel/afiche) y **Sofia Sans** para el resto. Responsive con dos breakpoints (`900px` y `720px`) que angostan el buscador y reordenan el header en mobile.

### 7.3 `js/config.js`
Una sola constante: `const API_URL = 'api';` (ruta relativa; se cambia por una URL absoluta si el front y la API viven en hosts distintos).

### 7.4 `js/data.js`
Define `MAP_SHAPES` (un arreglo de 22 países con su `iso_code`, nombre, emoji y un `path` SVG dibujado a mano — es el **mapa de respaldo** si falla la carga de geografía real), `FILLS` (paleta de 4 colores que se van rotando entre los países "encendidos") y `DIFF` (mapea `easy/medium/hard` a etiquetas en español y clases CSS `lv1/lv2/lv3`).

### 7.5 `js/api.js` — el cliente HTTP

Es un módulo ES que exporta un objeto único `API` y centraliza **todas** las llamadas al backend. Resuelve cuatro problemas transversales:

1. **Inyectar el JWT automáticamente** en cada request (`Authorization: Bearer <access>`).
2. **Mantener el access solo en memoria**: `API.access` es una propiedad del objeto, nada se escribe en `localStorage`. Al cargarse, el módulo además borra las claves `sdl_access`/`sdl_refresh` que pudieran quedar de versiones anteriores, para no dejar restos legibles por JS de sesiones viejas.
3. **Cortar requests colgadas con `fetchWithTimeout()`**: cada llamada pasa por un wrapper con `AbortController` y `setTimeout`, con timeout de 15 segundos para los endpoints normales (`REQUEST_TIMEOUT_MS`) y 5 segundos para el chequeo de `/health` (`HEALTH_TIMEOUT_MS`). Si el abort dispara, la promesa rechaza con un error claro en vez de dejar al usuario mirando una pantalla congelada.
4. **Refrescar el token solo cuando hace falta**: si una request da `401` (y no es una ruta de `/auth/`), pide un `access` nuevo contra `/auth/refresh` enviando la cookie (`credentials: 'include'`) y **reintenta la request original una sola vez** (parámetro `retried` para no entrar en loop infinito). Varias requests que fallan juntas comparten una misma promesa de refresh (`_refreshPromise`) para no disparar refreshes en paralelo:
```javascript
async _req(url, opts = {}, retried = false) {
  // ...agrega Authorization si hay access...
  let res = await fetch(url, opts);
  if (res.status === 401 && !retried && !AUTH_URL_PATTERN.test(url)) {
    await this.refreshSession();
    opts.headers['Authorization'] = 'Bearer ' + this.access;
    return this._req(url, opts, true);
  }
  // ...valida data.ok, lanza Error si algo falló...
}
```
El resto del objeto son métodos "de una línea" por endpoint (`getPaises()`, `getRecetas(id)`, `toggleFav(id, add)`, `adminSave(payload)`, etc.) que arman la URL y el body y delegan en `_req`.

### 7.6 `js/auth.js`
Controla la pantalla de login/registro: cambio de pestaña (login ⇄ registro), mostrar/ocultar contraseña, validación en vivo del usuario con la **misma regex que usa el backend** (`/^[\p{L}\p{N}_]{3,30}$/u` — validación duplicada a propósito: la del cliente es solo para UX inmediata, la del servidor es la que realmente protege), envío del formulario (llama `API.auth()` y guarda el access en memoria; el refresh llega como cookie `HttpOnly`, nunca en el body) y logout (avisa a la API para revocar la sesión y limpiar la cookie).

### 7.7 `js/map.js` — el módulo más complejo del proyecto

Construye el mapa **sin ninguna librería de mapas** (nada de Leaflet/D3-geo). Funciona en capas:

1. **Geografía real vía CDN**: intenta bajar un archivo TopoJSON (`world-atlas@2/countries-50m.json`, con `110m.json` como segunda opción más liviana) y lo cachea en `localStorage` para no re-descargarlo. `decodeTopo()` reconstruye los arcos y polígonos de cada país a partir del formato TopoJSON (que comprime coordenadas como diferencias acumuladas, no valores absolutos).
2. **Proyección propia**: `merc(lon, lat)` implementa a mano una proyección Mercator estándar; después el código calcula el bounding box de todos los países de Latinoamérica y arma una escala/traslación (`prj()`) para que todo entre en el `viewBox` de 1000×1110 del SVG.
3. **Fallback sin conexión**: si el `fetch` al CDN falla (sin internet, CDN bloqueado), usa directamente los `path` dibujados a mano en `MAP_SHAPES` (`js/data.js`) y muestra una insignia "🗺️ Mapa básico" en vez de "🌐 Mapa HD".
4. **Ubicación de las etiquetas de país**: calcula el centroide del polígono más grande de cada país (`ringCentroid2`) y verifica con un algoritmo de *point-in-polygon* (`pip2`, ray casting) que ese punto caiga realmente adentro (para países con forma de "U" o similares, el centroide geométrico puede caer afuera); si no, usa el centro del bounding box como respaldo.
5. **Interacción**: pan y zoom implementados a mano sobre **Pointer Events** (funciona igual con mouse, touch o lápiz): rueda del mouse hace zoom centrado en el cursor, doble clic hace zoom in, arrastrar con un dedo/mouse panea, dos dedos hacen pinch-zoom. Los botones `+`/`-`/`⌂` y el foco automático al seleccionar un país usan una función `animateView()` con *easing* cúbico (o instantánea si el usuario tiene activado "reducir movimiento" en su sistema).
6. Expone tres funciones globales para que otros módulos lo usen: `window.buildMap(countries)`, `window.focusCountry(g)`, `window.getCountryById(id)`.

### 7.8 `js/panel.js`
Maneja el panel lateral deslizante en sus tres usos:
- **`openPanel(country, svgGroup, focusRecipeId?)`**: pide en paralelo las recetas del país y los favoritos del usuario, arma una tarjeta (`cardHTML`) por receta con: nombre, botón de favorito (♥), badge de dificultad, descripción, tiempo formateado (`fmtTime`: `45` → `"45 min"`, `125` → `"2 h 5 min"`), chips de ingredientes clicleables, y un video de YouTube que se **carga recién al hacer clic** en el poster (lazy, para no pedir 6 iframes de YouTube de una).
- **`openFavorites()`**: la misma UI de panel pero listando las recetas marcadas como favoritas.
- **`openIngredientModal(id)`**: modal con todas las recetas (de cualquier país) que usan ese ingrediente; al tocar una fila, cierra el modal y salta directo al país/receta correspondiente en el mapa (`rowJump`).
- Un detalle importante: **`closePanel()` recarga toda la página** (`location.reload()`) si se hizo algún cambio en el panel de admin (`window.__adminDirty`), para que el mapa y los contadores de estadísticas se vuelvan a calcular con los datos nuevos, ya que esos no se actualizan de forma reactiva.

### 7.9 `js/admin.js` — el panel de administración en Vue 3

Es el único lugar del proyecto donde se usa un framework de UI. Se monta **bajo demanda** (`createApp(AdminApp).mount('#admRoot')`) recién cuando el usuario admin abre el panel, y se desmonta (`appInstance.unmount()`) al cerrarlo o al abrir cualquier otra cosa en el panel lateral. El componente tiene tres pestañas (recetas / países / ingredientes) manejadas con `ref`/`reactive` de la Composition API:
```javascript
const tab     = ref('recipes');
const editing = ref(null);           // null = sin formulario abierto
const data    = reactive({ recipes: [], countries: [], ingredients: [] });
```
El formulario de receta incluye un campo de texto para ingredientes separados por coma, con un `<datalist>` que autocompleta contra los ingredientes ya existentes — así se puede reutilizar un ingrediente existente o crear uno nuevo tipeándolo, sin un selector múltiple complejo. Cada mutación (guardar, borrar, renombrar) llama `markDirty()` (`window.__adminDirty = true`), la bandera que después lee `panel.js` para decidir si recargar la página al cerrar.

### 7.10 `js/app.js` — el orquestador

No tiene un solo tema, es el "pegamento" del resto de los módulos:
- Utilidades chicas: `$()` (alias de `querySelector`), `clamp()`, `toast()` (notificación flotante), `countUp()` (animación de conteo ascendente para los números de la barra de estadísticas, respetando `prefers-reduced-motion`).
- Arma dinámicamente los banderines animados y la marquesina de nombres de platos de la pantalla de login.
- `renderTopIngredients()`: inserta la tira de "ingredientes más usados" debajo de las estadísticas.
- `makeHeaderControls()`: inyecta en el header el buscador (con debounce de 250ms, dropdown de resultados agrupados por tipo, navegación con teclado), el botón de favoritos con contador, y el botón de admin (oculto salvo que `role === 'admin'`).
- `enterApp(name, isNew, role)`: la función que hace la transición completa de "recién logueado" a "app lista": cambia de pantalla, pone el avatar y nombre, decide si mostrar el botón de admin, carga países+estadísticas en paralelo, construye el mapa, anima los contadores y muestra un toast de bienvenida.
- Al final del archivo, una IIFE que corre al cargar la página e intenta un **auto-login silencioso** llamando `API.checkSession()`: como el access ya no está en memoria tras recargar, `checkSession()` prueba el refresh desde la cookie `sdl_refresh`; si todavía vive, entra directo a la app sin pedirle usuario/contraseña a quien ya tenía sesión abierta.

## 8. Autenticación y autorización: flujo completo

El modelo tiene dos piezas con vidas muy distintas:

- **Access token**: un JWT (HS256) que vive **15 minutos** por defecto (`JWT_TTL`) y se guarda **solo en memoria** del navegador (`API.access`, en `js/api.js`). Viaja en el header `Authorization: Bearer <token>` de cada request protegida y muere al cerrar o recargar la página: nunca toca `localStorage` ni ninguna cookie.
- **Refresh token**: un string aleatorio de 64 caracteres hexa (`bin2hex(random_bytes(32))`), vive **7 días** por defecto (`SESSION_DAYS`) y viaja **únicamente** como cookie `sdl_refresh` con los flags `HttpOnly` y `SameSite=Strict` (más `Secure` cuando se sirve por HTTPS, según `COOKIE_SECURE`). El navegador lo adjunta solo hacia la API y JavaScript no puede leerlo. En la base no se guarda el valor crudo sino su **hash SHA-256**, así que un dump de la tabla no sirve para hacerse pasar por nadie.

Flujo paso a paso:

1. **Login** (`POST /auth/login`; el registro funciona igual): el backend verifica la contraseña con `password_verify()`, emite el access JWT y crea el refresh token. La respuesta JSON trae `{ ok, username, role, access }`: **el refresh nunca va en el body**, sale como header `Set-Cookie: sdl_refresh=...; HttpOnly; SameSite=Strict; Path=<base de la API>; Max-Age=604800`.
2. **Storage**: `auth.js` llama `API.setTokens(res.access)` y el access queda en una variable en memoria. No queda nada de sesión persistido y legible por JS.
3. **Request autenticada**: cada llamada pasa por `_req()` en `api.js`, que inyecta `Authorization: Bearer <access>` si hay token.
4. **Expiración**: a los 15 minutos el JWT vence y la API responde `401`. `_req()` detecta ese código (en rutas que no sean de `/auth/`) y dispara el refresh antes de reintentar la request original **una sola vez** (parámetro `retried`, para no entrar en loop infinito).
5. **Refresh silencioso**: `POST /auth/refresh` con `credentials: 'include'`; la cookie viaja sola. El backend busca la fila por hash **con `FOR UPDATE`** dentro de una transacción, **revoca el token viejo y crea uno nuevo (rotación)**, y responde con un access nuevo más otra cookie. Si varias requests fallan a la vez, todas comparten una única promesa de refresh (`_refreshPromise`) y no se pisan entre sí.
6. **Restaurar tras recargar**: al cargar la página, una IIFE de `app.js` llama `API.checkSession()`; como el access ya no está en memoria, `checkSession()` hace el refresh silencioso desde la cookie y, si funciona, entra directo a la app sin pedir usuario ni contraseña.
7. **Logout** (`POST /auth/logout`): el backend marca `revoked_at` en la fila de la sesión y manda la orden de expirar la cookie; el cliente borra el access de memoria.
8. **Detección de reutilización**: si un token **ya revocado** se presenta de nuevo en `/auth/refresh` (señal clásica de robo de credencial), el backend borra **todas** las sesiones del usuario y responde `401`. La sesión termina en todos los dispositivos y hay que volver a loguearse.

```mermaid
sequenceDiagram
    actor U as Usuario
    participant F as Frontend (api.js)
    participant A as API (Slim)
    participant DB as MySQL

    U->>F: Envía usuario + contraseña
    F->>A: POST /auth/login
    A->>DB: SELECT * FROM users WHERE username=?
    DB-->>A: fila del usuario
    A->>A: password_verify(password, hash)
    A->>DB: INSERT INTO sessions (hash SHA-256 del refresh)
    A-->>F: 200 { access } + Set-Cookie sdl_refresh (HttpOnly)
    F->>F: access guardado solo en memoria
    F-->>U: enterApp() muestra el mapa

    Note over F,A: Más tarde, en cualquier request protegida:
    F->>A: GET /countries (Bearer access)
    A-->>F: 401 (access vencido: TTL de 15 min)
    F->>A: POST /auth/refresh (cookie sdl_refresh, credentials include)
    A->>DB: SELECT ... FOR UPDATE por hash
    A->>DB: revoca el token viejo e inserta el nuevo (rotación)
    A-->>F: 200 { access nuevo } + Set-Cookie sdl_refresh nueva
    F->>A: reintenta GET /countries (Bearer access nuevo)
    A-->>F: 200 { countries: [...] }
```

**Por qué cookie**: un token guardado en `localStorage` es legible por cualquier script que corra en la página, así que una sola vulnerabilidad XSS alcanza para robar la sesión completa. Con la cookie `HttpOnly` eso cambia: JavaScript no puede leerla ni escribirla, así que aun con XSS el refresh queda fuera de su alcance (y el access, que sí está en memoria, vence solo a los 15 minutos). El costo clásico de las cookies es CSRF, y acá está mitigado por dos lados: `SameSite=Strict` evita que el navegador adjunte la cookie en requests cross-site, y la API no usa credenciales cross-origin (front y API viven en el mismo host; el CORS no habilita `Allow-Credentials`).

Notas al margen del mismo paquete:
- Los rate limits de login (10 intentos por IP cada 5 minutos) y de registro (5 cada 15) responden `429` con header **`Retry-After`**, indicando los segundos que faltan para volver a intentar.
- El registro web crea siempre cuentas `role=user`; el rol admin solo lo otorga el CLI `api/bin/create-admin.php`.
- **Roles**: solo existen `user` y `admin`. El rol viaja *dentro* del JWT (`payload.role`), así que el backend no necesita ir a la base a cada request para saber si alguien es admin, simplemente lo lee del token ya validado. El frontend usa ese mismo dato para mostrar/ocultar el botón "🛠️ Admin".
- **`AuthMiddleware`** protege casi todo; **`AdminMiddleware`** además exige `role === 'admin'` en las rutas de `/admin/*`.

## 9. Recorrido de uso de punta a punta (ejemplo real)

Para entender cómo se conectan todas las piezas, este es un recorrido completo con datos reales de la base:

1. **Entra a `http://localhost/sabores-latinoamerica/`.** La IIFE de `app.js` intenta el auto-login silencioso (`API.checkSession()`); como es la primera vez no hay cookie de sesión previa, el refresh falla y se queda en `#authScreen`.
2. **Se registra** con usuario `chef_ana` y contraseña `mate1234`. `auth.js` valida el formato en el cliente, llama `API.auth('register', ...)` → `POST /auth/register`. Como todo registro web, la cuenta queda `role=user` (el admin se siembra aparte con `bin/create-admin.php`). La respuesta trae el `access` y el refresh llega como cookie `HttpOnly`; `auth.js` guarda el access en memoria y llama `enterApp('chef_ana', true, 'user')`.
3. **`enterApp` arma la pantalla principal**: pide `/countries` y `/stats` en paralelo, y le pasa el resultado a `buildMap()`. `map.js` intenta bajar el TopoJSON real desde el CDN; si lo consigue, dibuja los 22 países con geografía precisa y muestra la insignia "🌐 Mapa HD". Los 19 países con recetas quedan coloreados (rotando entre 4 colores); Belice, Haití y Puerto Rico quedan con una textura rayada (`url(#hatch)`, sin datos). Los contadores de la barra de estadísticas animan hasta `19 países · 57 recetas · 185 ingredientes · 57 recetas con video`.
4. **Toca Perú en el mapa.** `map.js` detecta el clic (`pointerup` sin arrastre), ve que `recipe_count > 0`, y llama `window.openPanel(info, g)`. `panel.js` pide en paralelo `GET /countries/4/recipes` y `GET /favorites`, y renderiza 3 tarjetas: *Ceviche Peruano*, *Lomo Saltado*, *Ají de Gallina* — cada una con su chip de dificultad, tiempo, ingredientes y poster de video.
5. **Toca el chip "Limón peruano"** dentro de la tarjeta del ceviche. `panel.js` abre el modal de ingrediente (`openIngredientModal(57)`), que llama `GET /ingredients/57` y muestra la lista de recetas de **todo el continente** que usan ese ingrediente (en este caso, solo el Ceviche Peruano, ya que es un ingrediente específico de esa receta).
6. **Cierra el modal y marca el Ceviche como favorito** (♥ en la tarjeta). `panel.js` llama `POST /favorites` con `{ "recipe_id": 10, "add": 1 }`; el backend hace `INSERT IGNORE INTO favorites (user_id, recipe_id) VALUES (7, 10)`. El contador de favoritos del header se actualiza a `1`.
7. **Para recorrer el panel de admin, entra con la cuenta sembrada por `api/bin/create-admin.php`** (chef_ana es `user`, así que no ve el botón "🛠️ Admin"). Ya como admin, toca el botón "🛠️ Admin" del header; `admin.js` monta el componente Vue dentro del panel lateral, pide `GET /admin/data`, y muestra la lista completa de recetas. Edita la descripción de "Ají de Gallina" y guarda: `POST /admin/recipes` con el payload completo de la receta (incluyendo la lista de ingredientes como texto separado por comas). El backend actualiza la fila, borra y recrea sus filas en `recipe_ingredient`, y responde `{ "ok": true, "id": 12 }`. Esto marca `window.__adminDirty = true`.
8. **Cierra el panel de admin.** Como `__adminDirty` está en `true`, `panel.js` hace `location.reload()` en vez de solo cerrar el panel, para que el mapa y las estadísticas reflejen cualquier cambio (por ejemplo, si hubiera borrado una receta y eso "apagara" un país).
9. **La próxima vez que abra la app** (aunque hayan pasado varios días, mientras sea dentro de los 7 días del `refresh`), el auto-login de `app.js` lo mete directo a la pantalla del mapa sin pedirle usuario y contraseña de nuevo.

## 10. Cómo levantar el proyecto localmente

1. Copiar la carpeta del proyecto dentro de `htdocs/` de XAMPP.
2. Importar el esquema canónico `db/migrations/000_install.sql`: phpMyAdmin → pestaña **Importar**, o desde la raíz del proyecto:
   ```bash
   mysql -u root -p --default-character-set=utf8mb4 sabores_latinoamerica < db/migrations/000_install.sql
   ```
   Si la base no existe, crearla antes (`CREATE DATABASE sabores_latinoamerica CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`). El baseline apunta a una base **vacía**: si ya tiene tablas, MySQL corta la importación con `ERROR 1050` a propósito (convención en `db/migrations/README.md`).
3. Instalar dependencias del backend (requiere [Composer](https://getcomposer.org)):
   ```bash
   cd api
   composer install
   ```
4. Copiar `api/.env.example` a `api/.env` y completar usuario/clave de MySQL, un `JWT_SECRET` propio largo y aleatorio (nunca dejar el valor de ejemplo en un entorno real) y `ADMIN_USER`/`ADMIN_PASS` para la cuenta admin inicial. Si se sirve por HTTPS, revisar también `COOKIE_SECURE`.
5. Sembrar la cuenta admin, desde `api/`:
   ```bash
   php bin/create-admin.php
   ```
   Correrlo **una sola vez**; con `--force` rota la contraseña de esa cuenta.
6. Entrar a `http://localhost/<carpeta-del-proyecto>/` e iniciar sesión con la cuenta admin sembrada en el paso anterior.

Nota: el registro web crea siempre usuarios comunes (`role=user`); el rol `admin` solo lo otorga `bin/create-admin.php`.

Variables de entorno (`api/.env`):

| Variable | Default | Uso |
|---|---|---|
| `DB_HOST` | `127.0.0.1` | Host de MySQL |
| `DB_NAME` | `sabores_latinoamerica` | Nombre de la base |
| `DB_USER` / `DB_PASS` | `root` / *(vacío)* | Credenciales |
| `JWT_SECRET` | *(placeholder — cambiar siempre)* | Clave para firmar los JWT |
| `JWT_TTL` | `900` (15 min) | Duración del access token, en segundos |
| `SESSION_DAYS` | `7` | Duración del refresh token, en días |
| `CORS_ORIGIN` | *(vacío)* | Dejarlo vacío si front y API comparten origen (no se emiten cabeceras CORS); `*` abre solo sin credenciales; un origen exacto lo permite con credenciales |
| `COOKIE_SECURE` | `auto` | Cookie de refresh: `auto` marca Secure solo por HTTPS; `1` siempre; `0` nunca (HTTP local) |
| `ADMIN_USER` / `ADMIN_PASS` | *(vacíos)* | Cuenta admin inicial que siembra `api/bin/create-admin.php` |
| `APP_DEBUG` | `0` | `1` para ver errores detallados de Slim (solo desarrollo) |

### 10.1 Verificación (tests y análisis estático)

Comandos exactos tal como se corren en la máquina de desarrollo actual. **Nota: Composer no está instalado en esta máquina**, así que en vez de `composer test`/`composer stan` se invocan los binarios por su ruta directa dentro de `api/vendor/`:

```bat
cd api
php vendor\phpunit\phpunit\phpunit --testsuite Unit
php vendor\phpunit\phpunit\phpunit --testsuite Integration
php vendor\phpstan\phpstan\phpstan analyse
```

Los tests de integración reconstruyen la base descartable `sabores_latinoamerica_test` desde `db/migrations/000_install.sql` al arrancar la suite (harness en `api/tests/Integration/bootstrap.php`), así que necesitan MySQL corriendo pero no tocan la base real.

Para el frontend (Node ≥ 18, desde la raíz del proyecto):

```bat
node --test "js/__tests__/*.test.mjs"
npm run lint:templates
```

`npm run test:js` es el atajo equivalente al `node --test` anterior; el linter revisa que ninguna interpolación sin escape llegue a un sink `innerHTML`.

## 11. Cosas importantes a tener en cuenta

### 11.1 ✅ El código y el `.sql` coinciden (resuelto)

Históricamente el dump provisto quedó atrás del código: le faltaban la columna `users.role`, la tabla `login_attempts` y la tabla `favorites`, así que el registro/login y los favoritos fallaban con errores de SQL hasta aplicar parches a mano.

Eso quedó **resuelto** con la reorganización de la capa de datos:

- **`db/migrations/000_install.sql` es ahora el baseline canónico**: fue generado desde la base real ya parcheada e incluye todo lo que el código usa (`users.role`, `sessions.revoked_at`, `login_attempts.action`, `favorites` e índices de performance), más los datos semilla limpios. Importarlo sobre una base vacía deja el proyecto funcional sin ningún paso manual.
- Los dumps y patches viejos quedaron **archivados como solo lectura en `db/legacy/`** (`sabores_latinoamerica.sql`, `sabores_latinoamerica.fixed.sql` y `patches/`) por si hace falta consultar la historia. No hay que aplicarlos nunca.
- Los cambios futuros de esquema son **migraciones numeradas nuevas** (`001_*.sql`, `002_*.sql`, ...) siguiendo la convención de `db/migrations/README.md`: nunca se edita el baseline ni una migración ya aplicada, se escribe una nueva.

### 11.2 Buenas prácticas que el proyecto ya aplica
- **100% consultas preparadas** (PDO con `?`), en ningún lado se concatena input del usuario directo en SQL; los patrones `LIKE` además escapan `%`, `_` y `\` para que la búsqueda sea literal.
- Contraseñas con `password_hash`/`password_verify` (bcrypt), nunca texto plano, con mínimo de 8 caracteres.
- El refresh token nunca se guarda crudo: viaja como cookie `HttpOnly`/`SameSite=Strict` y en la base solo está su **hash SHA-256**.
- Cada refresh **rota** el token (revoca el viejo, emite uno nuevo) y si un token ya revocado reaparece se asume robo de credencial y se revocan todas las sesiones del usuario.
- Rate limiting por IP en login y registro, respondiendo `429` con header `Retry-After`.
- Todo dato dinámico que entra a una plantilla HTML pasa por los builders escapadores de `js/util/dom.js` (`esc()`/`safeUrl()`), y `scripts/lint-templates.mjs` corta el paso si alguna interpolación sin escape apunta a un sink `innerHTML`.
- Comparación de firma JWT con `hash_equals()` (a tiempo constante, evita timing attacks).
- Validación duplicada cliente/servidor (UX inmediata + seguridad real).
- `RecipeController` evita el problema N+1 trayendo los ingredientes de varias recetas en una sola consulta con `IN (...)`.
- El backend corre limpio en **PHPStan nivel 8** (máximo rigor de análisis estático).

### 11.3 Otras notas útiles
- `Access-Control-Allow-Origin: *` es permisivo a propósito (pensado para desarrollo local); en producción normalmente se restringiría a un origen concreto.
- Todavía no hay CI/CD ni Docker. Sí hay tests automatizados: PHPUnit en `api/tests/` (unit + integración contra una base MySQL descartable `sabores_latinoamerica_test`, reconstruida desde el baseline) y JS nativo en `js/__tests__/` (`npm run test:js`). El esquema ya no se reimporta a ciegas: evoluciona con migraciones numeradas en `db/migrations/` (baseline `000_install.sql`), y los dumps históricos quedaron archivados en `db/legacy/`.
- **Herramientas de calidad del frontend**:
  - `js/util/dom.js` concentra builders puros de HTML (`esc()` para escapar los cinco caracteres peligrosos, `safeUrl()` para validar IDs de YouTube, armadores de tarjetas y filas de búsqueda). No tocan `document`, solo devuelven strings, así se testean con `node --test` sin DOM. Regla del proyecto: ningún sink `innerHTML` arma marcado con interpolaciones sueltas; consume estos builders.
  - `scripts/lint-templates.mjs` (atajo `npm run lint:templates`) es el guardián de esa regla: recorre los `.js` del front y corta con error si encuentra una interpolación `${...}` dentro de una asignación a `.innerHTML` que no empiece por `esc(`, `safeUrl(`, `iframeHTML(` o lleve el marcador de estático.
- El texto de la interfaz usa **voseo rioplatense** ("Entrá", "Creá tu cuenta", "Necesitás iniciar sesión") — útil de saber si se le pide a una IA que agregue textos nuevos y deban sonar consistentes con el resto.
- El módulo de mapa (`map.js`) es, con diferencia, el código más denso del proyecto: mezcla decodificación de TopoJSON, proyección cartográfica, geometría computacional (centroide, point-in-polygon) e interacción táctil/mouse unificada, todo sin dependencias externas.

## 12. Registro del rework (2026-08)

El proyecto pasó por un rework completo por olas, cada una con objetivo único y verificable. Resumen de las siete olas sobre un total de **36 commits**:

| Ola | Tema | Commits | Resultado |
|---|---|---|---|
| A | Higiene del baseline | 3 | Import limpio del proyecto original, fuera el `composer.phar` del web root y bloqueado el acceso HTTP a dotfiles y archivos sensibles |
| B | Capa de datos + bootstrap admin | 3 | `db/migrations/000_install.sql` como baseline canónico (pliega los patches legacy), CLI `bin/create-admin.php` que siembra la cuenta admin, y harness de integración contra MySQL real más runner JS con Node |
| C | Frontend modular y XSS fuera | 7 | Grafo explícito de módulos ES reemplaza la cadena de scripts globales, Vue versionado local y fuentes autoalojadas, builders escapadores en `util/dom.js`, todos los sinks `innerHTML` escapados y linter de plantillas como guardián |
| D | Endurecimiento de la API | 5 | Validación server-side completa en escrituras de recetas, checks de límites y existencia en mutaciones admin, contraseñas de mínimo 8 caracteres, búsqueda `LIKE` literal-safe, estadísticas desacopladas de la vista con `GROUP BY` estricto |
| E | Rework de autenticación | 6 | Refresh token como cookie `HttpOnly`/`SameSite=Strict` con rotación y detección de reutilización, access JWT solo en memoria, `429` con `Retry-After`, errores JSON con id rastreable, mapeo contenido de fallos SQL en escrituras admin y documentación del flujo |
| F | Resiliencia y accesibilidad de UI | 8 | Estados de carga/error/vacío en todas las superficies asíncronas, timeouts de request con abort limpio, manejo defensivo de inputs de borde, teclado y lectores de pantalla, correcciones de layout mobile, shimmer más visible y favicon/toast pulidos |
| G | Portones de calidad | 4 | PHPStan limpio en nivel 8, suites unitarias exhaustivas (Jwt, Validation), tests JS de funciones puras y lógica de reintento, cobertura de integración de controladores y ciclo de vida de auth |

Cada ola dejó la app funcional: nada quedó a medio migrar entre olas.
