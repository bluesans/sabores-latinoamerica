#!/usr/bin/env node
// Fixtures doradas de la API PHP viva (todo 7 de .omo/plans/modernizar-sitio.md).
//
// capture.mjs ejecuta una matriz determinista contra la API viva (XAMPP por
// defecto), normaliza todo lo volátil (tokens, cookies, ids autoincrementales,
// timestamps, id hex del envelope de error, header Retry-After) y escribe un
// JSON por caso en php/. diff.mjs reutiliza runMatrix() para replayar la MISMA
// matriz contra otra base URL (p. ej. el server Node) y comparar fixture por
// fixture con diff legible.
//
// La matriz cubre TODAS las rutas de legacy/php-api/routes.php, incluidos los quirks:
// 401 sin token, 403 no-admin, 405 por método/path, OPTIONS 200 sin body,
// GET / → 404, envelope global {ok:false,error,id}, 409 duplicado, 422 de
// validación, ids (0→400, garbage→404, '12abc'→12), paginación, búsqueda y
// rate limit 429 con Retry-After.
//
// Uso:
//   node backend/tests/fixtures/capture.mjs [--base-url URL] [--verbose]
//
// Requisitos: XAMPP (Apache + MySQL) sirviendo api/ con su .env ya
// configurado; PHP y mysql en las rutas de XAMPP (override con PHP_BIN /
// MYSQL_BIN). El script se limpia a sí mismo: usuarios/recetas/ingredientes
// fixture y login_attempts se purgan antes y después de cada corrida.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES_DIR = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(FIXTURES_DIR, '..', '..', '..');
const PHP_BIN = process.env.PHP_BIN ?? 'C:\\xampp\\php\\php.exe';
const MYSQL_BIN = process.env.MYSQL_BIN ?? 'C:\\xampp\\mysql\\bin\\mysql.exe';

export const DEFAULT_BASE_URL = 'http://localhost/sabores-latinoamerica/api';

const USER_AGENT = 'fixtures7-parity/1.0';
const FIXTURE_USER = 'fixture7_user';
const FIXTURE_USER_PASS = 'Fixture7!Pass2026';
const FIXTURE_ADMIN = 'fixture7_admin';
const FIXTURE_ADMIN_PASS = 'Fixture7!Admin2026';
const FIXTURE_SHORT_PW_USER = 'fixture7_shortpw';
const FIXTURE_PREFIX = 'Fixture7';
const WRONG_PASSWORD = 'ClaveIncorrecta2026';

const ERROR_ID_RE = /^[0-9a-f]{16}$/;
const REFRESH_COOKIE_RE = /(?:^|; )sdl_refresh=([0-9a-f]{64})/;
const COOKIE_VALUE_RE = /^(sdl_refresh=)[0-9a-f]{64}/;

// ---------------------------------------------------------------------------
// Entorno, premisas y MySQL
// ---------------------------------------------------------------------------

function loadEnvFile() {
    const raw = readFileSync(resolve(REPO_ROOT, 'legacy', 'php-api', '.env'), 'utf8');
    const values = {};
    for (const line of raw.split(/\r?\n/)) {
        const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
        if (match === null) continue;
        let value = match[2].trim();
        if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
            value = value.slice(1, -1);
        }
        values[match[1]] = value;
    }
    return values;
}

function checkPremises(envFile) {
    const problems = [];
    if (envFile.APP_DEBUG !== '0') {
        problems.push(`APP_DEBUG debe ser "0" (valor en legacy/php-api/.env: ${envFile.APP_DEBUG ?? 'ausente'}).`);
    }
    if ((envFile.CORS_ORIGIN ?? '') !== '') {
        problems.push(`CORS_ORIGIN debe estar vacío (valor en legacy/php-api/.env: ${envFile.CORS_ORIGIN}).`);
    }
    const cookieSecure = envFile.COOKIE_SECURE ?? 'auto';
    if (cookieSecure !== 'auto') {
        problems.push(`COOKIE_SECURE debe ser "auto" o estar ausente (valor en legacy/php-api/.env: ${cookieSecure}).`);
    }
    if (problems.length > 0) {
        throw new Error(`Premisas de entorno inválidas — no se capturó nada:\n - ${problems.join('\n - ')}`);
    }
}

function resolveDb(envFile) {
    const db = {
        host: process.env.DB_HOST ?? envFile.DB_HOST ?? '127.0.0.1',
        name: process.env.DB_NAME ?? envFile.DB_NAME ?? 'sabores_latinoamerica',
        user: process.env.DB_USER ?? envFile.DB_USER ?? 'root',
        pass: process.env.DB_PASS ?? envFile.DB_PASS ?? ''
    };
    if (!/(?:_test|_parity)$/.test(db.name) && process.env.ALLOW_LIVE_FIXTURES !== '1') {
        throw new Error(`capture.mjs se niega a escribir en "${db.name}": usá una DB *_test/_parity o ALLOW_LIVE_FIXTURES=1 explícito.`);
    }
    return db;
}

function mysql(db, sql) {
    const args = ['-h', db.host, '-u', db.user];
    if (db.pass !== '') args.push(`-p${db.pass}`);
    args.push('--default-character-set=utf8mb4', '-N', '-B', db.name, '-e', sql);
    return execFileSync(MYSQL_BIN, args, { encoding: 'utf8' }).trim();
}

function assertDbReachable(db) {
    try {
        mysql(db, 'SELECT 1');
    } catch (error) {
        throw new Error(`No pude conectarme a MySQL (${db.host}/${db.name}): ${error instanceof Error ? error.message : String(error)}`);
    }
}

function cleanupFixtures(db) {
    mysql(db, `DELETE FROM users WHERE username IN ('${FIXTURE_USER}', '${FIXTURE_ADMIN}', '${FIXTURE_SHORT_PW_USER}')`);
    mysql(db, `DELETE FROM recipes WHERE name LIKE '${FIXTURE_PREFIX}%'`);
    mysql(db, `DELETE FROM ingredients WHERE name LIKE '${FIXTURE_PREFIX}%'`);
    mysql(db, `DELETE FROM login_attempts WHERE ip IN ('127.0.0.1', '::1')`);
}

function verifyClean(db) {
    const row = mysql(
        db,
        `SELECT (SELECT COUNT(*) FROM users WHERE username IN ('${FIXTURE_USER}', '${FIXTURE_ADMIN}', '${FIXTURE_SHORT_PW_USER}')), (SELECT COUNT(*) FROM recipes WHERE name LIKE '${FIXTURE_PREFIX}%'), (SELECT COUNT(*) FROM ingredients WHERE name LIKE '${FIXTURE_PREFIX}%'), (SELECT COUNT(*) FROM login_attempts WHERE ip IN ('127.0.0.1', '::1'))`
    );
    const [users, recipes, ingredients, attempts] = row.split('\t').map(part => Number(part));
    if ((users ?? 0) + (recipes ?? 0) + (ingredients ?? 0) + (attempts ?? 0) !== 0) {
        throw new Error(`Limpieza incompleta: users=${users} recipes=${recipes} ingredients=${ingredients} attempts=${attempts}`);
    }
    return { users, recipes, ingredients, attempts };
}

function createAdminFixture() {
    const output = execFileSync(PHP_BIN, [resolve(REPO_ROOT, 'legacy', 'php-api', 'bin', 'create-admin.php')], {
        cwd: REPO_ROOT,
        env: { ...process.env, ADMIN_USER: FIXTURE_ADMIN, ADMIN_PASS: FIXTURE_ADMIN_PASS },
        encoding: 'utf8'
    });
    if (!output.includes('Admin creado')) {
        throw new Error(`create-admin.php no confirmó la creación del admin fixture: ${output.trim()}`);
    }
}

// ---------------------------------------------------------------------------
// Normalización: todo lo volátil se reemplaza por placeholders estables.
// ---------------------------------------------------------------------------

function maskSetCookie(value) {
    return value.replace(COOKIE_VALUE_RE, '$1<REFRESH_TOKEN>');
}

function normalizeBody(value) {
    if (Array.isArray(value)) return value.map(item => normalizeBody(item));
    if (value !== null && typeof value === 'object') {
        const out = {};
        for (const [key, item] of Object.entries(value)) out[key] = normalizeField(key, item);
        return out;
    }
    return value;
}

function normalizeField(key, value) {
    if (typeof value === 'string') {
        if (key === 'access' && value.startsWith('eyJ')) return '<ACCESS_TOKEN>';
        if (key === 'id' && ERROR_ID_RE.test(value)) return '<ERROR_ID>';
        if (key === 'time' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return '<TIMESTAMP>';
    }
    return normalizeBody(value);
}

function maskCreatedRecipe(fixture) {
    if (typeof fixture.response.body.id === 'number') fixture.response.body.id = '<FIXTURE_RECIPE_ID>';
    return fixture;
}

function maskAdminSessions(fixture) {
    const rows = (fixture.response.body.sessions ?? []).map(row => ({
        id: '<SESSION_ID>',
        username: row.username,
        created_at: '<TIMESTAMP>',
        expires_at: '<TIMESTAMP>',
        revoked_at: row.revoked_at === null ? null : '<TIMESTAMP>',
        ip: row.ip,
        user_agent: row.user_agent
    }));
    // created_at tiene precisión de segundos: el orden real puede variar entre
    // corridas; ordeno por contenido para que la fixture sea determinista.
    rows.sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
    fixture.response.body.sessions = rows;
    return fixture;
}

// ---------------------------------------------------------------------------
// Cliente HTTP + registro de fixtures
// ---------------------------------------------------------------------------

function createApi(baseUrl, log, strict) {
    const root = baseUrl.replace(/\/+$/, '');
    const cases = [];
    const anomalies = [];

    async function perform(spec) {
        const url = new URL(`${root}${spec.path}`);
        if (spec.query !== undefined) {
            for (const [key, value] of Object.entries(spec.query)) url.searchParams.set(key, value);
        }
        const headers = { 'user-agent': USER_AGENT };
        if (spec.token) headers.authorization = `Bearer ${spec.token}`;
        if (spec.cookie !== undefined && spec.cookie !== null) headers.cookie = `sdl_refresh=${spec.cookie}`;
        if (spec.body !== undefined) headers['content-type'] = 'application/json';
        const res = await fetch(url, {
            method: spec.method,
            headers,
            body: spec.body === undefined ? undefined : JSON.stringify(spec.body)
        });
        const text = await res.text();
        let body = null;
        if (text !== '') {
            try {
                body = JSON.parse(text);
            } catch {
                body = text;
            }
        }
        if (strict && spec.expectStatus !== undefined && res.status !== spec.expectStatus) {
            throw new Error(`Caso ${spec.name}: esperaba status ${spec.expectStatus}, recibí ${res.status}. Body: ${text.slice(0, 200)}`);
        }
        return {
            status: res.status,
            body,
            text,
            contentType: res.headers.get('content-type'),
            wwwAuthenticate: res.headers.get('www-authenticate'),
            retryAfter: res.headers.get('retry-after'),
            setCookies: res.headers.getSetCookie()
        };
    }

    function record(spec, raw) {
        const fixture = {
            case: spec.name,
            request: {
                method: spec.method,
                path: spec.pathTemplate ?? spec.path,
                query: spec.query ?? {},
                headers: {},
                cookies: {},
                body: spec.body ?? null
            },
            response: {
                status: raw.status,
                headers: {},
                body: normalizeBody(raw.body)
            }
        };
        fixture.request.headers['user-agent'] = USER_AGENT;
        if (spec.token) fixture.request.headers.authorization = `Bearer ${spec.tokenLabel ?? '<ACCESS_TOKEN>'}`;
        if (spec.body !== undefined) fixture.request.headers['content-type'] = 'application/json';
        if (spec.cookie !== undefined && spec.cookie !== null) {
            fixture.request.cookies.sdl_refresh = spec.maskCookie === false ? spec.cookie : '<REFRESH_TOKEN>';
        }
        if (raw.contentType !== null) fixture.response.headers['content-type'] = raw.contentType;
        if (raw.wwwAuthenticate !== null) fixture.response.headers['www-authenticate'] = raw.wwwAuthenticate;
        if (raw.retryAfter !== null) fixture.response.headers['retry-after'] = '<RETRY_AFTER>';
        if (raw.setCookies.length > 0) fixture.response.headers['set-cookie'] = raw.setCookies.map(maskSetCookie);
        const masked = spec.mask === undefined ? fixture : spec.mask(fixture);
        cases.push({ name: spec.name, fixture: masked });
        log(`  · ${spec.name} → ${raw.status}`);
        return masked;
    }

    return {
        cases,
        anomalies,
        perform,
        record,
        call: async spec => {
            const raw = await perform(spec);
            record(spec, raw);
            return raw;
        }
    };
}

function readCookie(raw) {
    for (const cookie of raw.setCookies) {
        const match = REFRESH_COOKIE_RE.exec(cookie);
        if (match !== null) return match[1];
    }
    return null;
}

async function assertApiReachable(baseUrl) {
    const url = `${baseUrl.replace(/\/+$/, '')}/health`;
    let response;
    try {
        response = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
    } catch (error) {
        throw new Error(`La API no responde en ${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const body = await response.json().catch(() => null);
    if (response.status !== 200 || body === null || body.db !== true) {
        throw new Error(`Health check inesperado en ${url}: status ${response.status}, body ${JSON.stringify(body)}`);
    }
}

// ---------------------------------------------------------------------------
// Matriz de casos (secuencia estricta: la última fase agota el rate limit)
// ---------------------------------------------------------------------------

async function runSequence(api, db, log, strict) {
    const { call, perform, record } = api;

    function requireCookie(cookie, caseName) {
        if (cookie !== null) return cookie;
        if (strict) throw new Error(`Caso ${caseName}: no encontré la cookie sdl_refresh en Set-Cookie.`);
        api.anomalies.push(`Caso ${caseName}: sin cookie sdl_refresh — sigo en modo diff.`);
        return null;
    }

    function requireInt(value, message) {
        if (!Number.isInteger(value)) throw new Error(message);
        return value;
    }

    // ---------- Fase 0: superficie pública y envelope global ----------
    log('→ Fase 0: salud, 404/405/OPTIONS, 401 sin token');
    await call({ name: 'health', method: 'GET', path: '/health', expectStatus: 200 });
    await call({ name: 'root_404', method: 'GET', path: '/', expectStatus: 404 });
    await call({ name: 'ruta_desconocida_405', method: 'GET', path: '/no-existe-este-path', expectStatus: 405 });
    await call({ name: 'options_preflight', method: 'OPTIONS', path: '/countries', expectStatus: 200 });
    await call({ name: 'countries_sin_token_401', method: 'GET', path: '/countries', expectStatus: 401 });

    // ---------- Fase 1: ciclo de vida de auth ----------
    log('→ Fase 1: register/login/check/refresh/logout');
    const registered = await call({ name: 'register_ok', method: 'POST', path: '/auth/register', body: { username: FIXTURE_USER, password: FIXTURE_USER_PASS }, expectStatus: 200 });
    requireCookie(readCookie(registered), 'register_ok');
    const registerSetCookie = registered.setCookies.join('; ');
    if (registerSetCookie.includes('; Secure')) {
        const message = 'COOKIE_SECURE=auto sobre HTTP no debería emitir el flag Secure (premisa de comportamiento).';
        if (strict) throw new Error(message);
        api.anomalies.push(message);
    }
    if (!registerSetCookie.includes('HttpOnly') || !registerSetCookie.includes('SameSite=Strict')) {
        const message = `La cookie sdl_refresh perdió atributos esperados: ${registerSetCookie}`;
        if (strict) throw new Error(message);
        api.anomalies.push(message);
    }
    let userToken = registered.body.access;

    await call({ name: 'register_duplicado_409', method: 'POST', path: '/auth/register', body: { username: FIXTURE_USER, password: FIXTURE_USER_PASS }, expectStatus: 409 });
    await call({ name: 'register_password_corta_422', method: 'POST', path: '/auth/register', body: { username: FIXTURE_SHORT_PW_USER, password: '123' }, expectStatus: 422 });
    await call({ name: 'register_username_invalido_422', method: 'POST', path: '/auth/register', body: { username: 'ab', password: FIXTURE_USER_PASS }, expectStatus: 422 });

    const logged = await call({ name: 'login_ok', method: 'POST', path: '/auth/login', body: { username: FIXTURE_USER, password: FIXTURE_USER_PASS }, expectStatus: 200 });
    const loginCookie = requireCookie(readCookie(logged), 'login_ok');
    userToken = logged.body.access;

    await call({ name: 'auth_check_ok', method: 'GET', path: '/auth/check', token: userToken, expectStatus: 200 });

    const refreshed = await call({ name: 'refresh_ok', method: 'POST', path: '/auth/refresh', cookie: loginCookie, expectStatus: 200 });
    const refreshCookie = requireCookie(readCookie(refreshed), 'refresh_ok');

    await call({ name: 'refresh_sin_cookie_401', method: 'POST', path: '/auth/refresh', expectStatus: 401 });
    await call({ name: 'refresh_cookie_invalida_401', method: 'POST', path: '/auth/refresh', cookie: 'de'.repeat(32), maskCookie: false, expectStatus: 401 });
    await call({ name: 'logout_ok', method: 'POST', path: '/auth/logout', cookie: refreshCookie, expectStatus: 200 });

    // ---------- Fase 2: lecturas protegidas ----------
    log('→ Fase 2: countries/stats/ingredients/search/favorites');
    await call({ name: 'countries_ok', method: 'GET', path: '/countries', token: userToken, expectStatus: 200 });
    await call({ name: 'country_recipes_ok', method: 'GET', path: '/countries/4/recipes', token: userToken, expectStatus: 200 });
    await call({ name: 'country_recipes_paginado', method: 'GET', path: '/countries/4/recipes', query: { per_page: '2', page: '1' }, token: userToken, expectStatus: 200 });
    await call({ name: 'country_recipes_pagina_fuera_de_rango', method: 'GET', path: '/countries/4/recipes', query: { per_page: '2', page: '99' }, token: userToken, expectStatus: 200 });
    await call({ name: 'country_recipes_id_cero_400', method: 'GET', path: '/countries/0/recipes', token: userToken, expectStatus: 400 });
    await call({ name: 'country_recipes_id_inexistente_404', method: 'GET', path: '/countries/9999/recipes', token: userToken, expectStatus: 404 });
    await call({ name: 'country_recipes_id_alfanumerico_405', method: 'GET', path: '/countries/12abc/recipes', token: userToken, expectStatus: 405 });
    await call({ name: 'stats_ok', method: 'GET', path: '/stats', token: userToken, expectStatus: 200 });
    await call({ name: 'ingredient_ok', method: 'GET', path: '/ingredients/1', token: userToken, expectStatus: 200 });
    await call({ name: 'ingredient_inexistente_404', method: 'GET', path: '/ingredients/99999', token: userToken, expectStatus: 404 });
    await call({ name: 'search_vacia', method: 'GET', path: '/search', query: { q: '' }, token: userToken, expectStatus: 200 });
    await call({ name: 'search_un_caracter', method: 'GET', path: '/search', query: { q: 'a' }, token: userToken, expectStatus: 200 });
    await call({ name: 'search_con_datos', method: 'GET', path: '/search', query: { q: 'taco' }, token: userToken, expectStatus: 200 });
    await call({ name: 'search_consulta_larga', method: 'GET', path: '/search', query: { q: 'a'.repeat(151) }, token: userToken, expectStatus: 200 });
    await call({ name: 'favorites_vacio', method: 'GET', path: '/favorites', token: userToken, expectStatus: 200 });
    await call({ name: 'favorites_agregar', method: 'POST', path: '/favorites', token: userToken, body: { recipe_id: 1, add: 1 }, expectStatus: 200 });
    await call({ name: 'favorites_lista', method: 'GET', path: '/favorites', token: userToken, expectStatus: 200 });
    await call({ name: 'favorites_quitar', method: 'POST', path: '/favorites', token: userToken, body: { recipe_id: 1 }, expectStatus: 200 });
    await call({ name: 'favorites_vacio_final', method: 'GET', path: '/favorites', token: userToken, expectStatus: 200 });

    // ---------- Fase 3: administración ----------
    log('→ Fase 3: admin (login, 403, data, sesiones, CRUD con quirks)');
    const adminLogged = await call({ name: 'admin_login_ok', method: 'POST', path: '/auth/login', body: { username: FIXTURE_ADMIN, password: FIXTURE_ADMIN_PASS }, expectStatus: 200 });
    const adminToken = adminLogged.body.access;
    const adminTokenLabel = '<ADMIN_ACCESS_TOKEN>';

    await call({ name: 'admin_sessions_forbidden_403', method: 'GET', path: '/admin/sessions', token: userToken, expectStatus: 403 });
    await call({ name: 'admin_data_ok', method: 'GET', path: '/admin/data', token: adminToken, tokenLabel: adminTokenLabel, expectStatus: 200 });
    await call({ name: 'admin_sessions_ok', method: 'GET', path: '/admin/sessions', token: adminToken, tokenLabel: adminTokenLabel, expectStatus: 200, mask: maskAdminSessions });

    const created = await call({
        name: 'admin_recipe_create_ok',
        method: 'POST',
        path: '/admin/recipes',
        token: adminToken,
        tokenLabel: adminTokenLabel,
        body: { name: `${FIXTURE_PREFIX} Receta QA`, country_id: 4, description: `${FIXTURE_PREFIX}: receta temporal de la matriz de paridad.`, difficulty: 'medium', time_minutes: '30', ingredients: [`${FIXTURE_PREFIX} Ingrediente A`, `${FIXTURE_PREFIX} Ingrediente B`] },
        expectStatus: 200,
        mask: maskCreatedRecipe
    });
    const recipeId = requireInt(created.body.id, `admin_recipe_create_ok: respuesta sin id numérico (${JSON.stringify(created.body)})`);

    const ingredientRows = mysql(db, `SELECT id, name FROM ingredients WHERE name IN ('${FIXTURE_PREFIX} Ingrediente A', '${FIXTURE_PREFIX} Ingrediente B') ORDER BY name`)
        .split(/\r?\n/)
        .filter(line => line !== '');
    if (ingredientRows.length !== 2) throw new Error(`Esperaba 2 ingredientes fixture en la DB y encontré ${ingredientRows.length}.`);
    const ingredientA = requireInt(Number(ingredientRows[0].split('\t')[0]), 'No pude resolver el id del ingrediente fixture A.');
    const ingredientB = requireInt(Number(ingredientRows[1].split('\t')[0]), 'No pude resolver el id del ingrediente fixture B.');

    await call({ name: 'admin_ingredient_rename_ok', method: 'PUT', path: `/admin/ingredients/${ingredientA}`, pathTemplate: '/admin/ingredients/<FIXTURE_INGREDIENT_ID_A>', token: adminToken, tokenLabel: adminTokenLabel, body: { name: `${FIXTURE_PREFIX} Ingrediente A (renombrado)` }, expectStatus: 200 });
    await call({ name: 'admin_ingredient_delete_ok', method: 'DELETE', path: `/admin/ingredients/${ingredientB}`, pathTemplate: '/admin/ingredients/<FIXTURE_INGREDIENT_ID_B>', token: adminToken, tokenLabel: adminTokenLabel, expectStatus: 200 });

    // PUT de país con los MISMOS valores que ya tiene (no muta la DB viva).
    const countryBefore = mysql(db, 'SELECT emoji, tagline FROM countries WHERE id = 4');
    const [countryEmoji, countryTagline] = countryBefore.split('\t');
    if (!countryEmoji || !countryTagline) throw new Error('No pude leer emoji/tagline del país 4 (¿cambió el seed?).');
    await call({ name: 'admin_country_update_ok', method: 'PUT', path: '/admin/countries/4', token: adminToken, tokenLabel: adminTokenLabel, body: { emoji: countryEmoji, tagline: countryTagline }, expectStatus: 200 });
    const countryAfter = mysql(db, 'SELECT emoji, tagline FROM countries WHERE id = 4');
    if (countryAfter !== countryBefore) throw new Error('El PUT de país con mismos valores cambió la fila; aborto para no ensuciar la DB viva.');

    await call({ name: 'admin_recipe_delete_ok', method: 'DELETE', path: `/admin/recipes/${recipeId}abc`, pathTemplate: '/admin/recipes/<FIXTURE_RECIPE_ID>abc', token: adminToken, tokenLabel: adminTokenLabel, expectStatus: 200 });
    const recipeLeft = mysql(db, `SELECT COUNT(*) FROM recipes WHERE id = ${recipeId}`);
    if (recipeLeft !== '0') {
        const message = `La receta fixture ${recipeId} sigue en la DB tras el DELETE.`;
        if (strict) throw new Error(message);
        api.anomalies.push(message);
    }
    await call({ name: 'admin_recipe_delete_id_invalido_404', method: 'DELETE', path: '/admin/recipes/abc', token: adminToken, tokenLabel: adminTokenLabel, expectStatus: 404 });
    await call({ name: 'admin_country_id_cero_400', method: 'PUT', path: '/admin/countries/0', token: adminToken, tokenLabel: adminTokenLabel, body: { emoji: 'x', tagline: 'y' }, expectStatus: 400 });

    const adminSessionRaw = mysql(db, `SELECT s.id FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.username = '${FIXTURE_ADMIN}' ORDER BY s.id DESC LIMIT 1`);
    const adminSessionId = requireInt(Number(adminSessionRaw), `No pude resolver la sesión del admin fixture (mysql devolvió "${adminSessionRaw}").`);
    await call({ name: 'admin_session_revoke_ok', method: 'DELETE', path: `/admin/sessions/${adminSessionId}`, pathTemplate: '/admin/sessions/<SESSION_ID>', token: adminToken, tokenLabel: adminTokenLabel, expectStatus: 200 });
    await call({ name: 'admin_session_revoke_de_nuevo_404', method: 'DELETE', path: `/admin/sessions/${adminSessionId}`, pathTemplate: '/admin/sessions/<SESSION_ID>', token: adminToken, tokenLabel: adminTokenLabel, expectStatus: 404 });

    // ---------- Fase 4: abuso (reutilización de refresh + rate limit de login) ----------
    log('→ Fase 4: reutilización de refresh y rate limit 429 (al final: agota la ventana)');
    await call({ name: 'refresh_reutilizacion_401', method: 'POST', path: '/auth/refresh', cookie: loginCookie, expectStatus: 401 });
    const sessionsLeft = Number(mysql(db, `SELECT COUNT(*) FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.username = '${FIXTURE_USER}'`));
    if (sessionsLeft !== 0) {
        const message = `La reutilización de refresh debe borrar TODAS las sesiones del usuario fixture y quedan ${sessionsLeft}.`;
        if (strict) throw new Error(message);
        api.anomalies.push(message);
    }

    await call({ name: 'login_credenciales_incorrectas_401', method: 'POST', path: '/auth/login', body: { username: FIXTURE_USER, password: WRONG_PASSWORD }, expectStatus: 401 });
    let rateLimited = null;
    let lastRaw = null;
    const loopStatuses = [];
    for (let attempt = 0; attempt < 12 && rateLimited === null; attempt++) {
        const raw = await perform({ name: 'login_rate_limit_429', method: 'POST', path: '/auth/login', body: { username: FIXTURE_USER, password: WRONG_PASSWORD } });
        lastRaw = raw;
        loopStatuses.push(raw.status);
        if (raw.status === 429) rateLimited = raw;
    }
    if (rateLimited === null) {
        const message = `El rate limit de login no respondió 429 en 12 intentos seguidos (status: ${loopStatuses.join(', ')}).`;
        if (strict) throw new Error(message);
        api.anomalies.push(message);
        rateLimited = lastRaw;
    }
    const unauthorized = loopStatuses.filter(status => status === 401).length;
    if (loopStatuses.at(-1) !== 429 || unauthorized !== 9) {
        const message = `Patrón de rate limit inesperado: [${loopStatuses.join(', ')}] — esperaba 9×401 y luego 429.`;
        if (strict) throw new Error(message);
        api.anomalies.push(message);
    }
    if (rateLimited.retryAfter === null) {
        const message = 'El 429 de login no trajo el header Retry-After.';
        if (strict) throw new Error(message);
        api.anomalies.push(message);
    }
    record({ name: 'login_rate_limit_429', method: 'POST', path: '/auth/login', body: { username: FIXTURE_USER, password: WRONG_PASSWORD } }, rateLimited);
}

// ---------------------------------------------------------------------------
// Runner compartido (capture.mjs y diff.mjs)
// ---------------------------------------------------------------------------

export async function runMatrix({ baseUrl = DEFAULT_BASE_URL, log = () => {}, strict = true } = {}) {
    const envFile = loadEnvFile();
    checkPremises(envFile);
    const db = resolveDb(envFile);
    assertDbReachable(db);
    await assertApiReachable(baseUrl);

    const api = createApi(baseUrl, log, strict);
    cleanupFixtures(db);
    log('→ limpieza previa OK; creando admin fixture con create-admin.php');
    createAdminFixture();

    let error = null;
    try {
        await runSequence(api, db, log, strict);
    } catch (sequenceError) {
        error = sequenceError;
    } finally {
        cleanupFixtures(db);
        const cleanup = verifyClean(db);
        log(`→ limpieza final OK (${JSON.stringify(cleanup)})`);
        api.anomalies.push(`Limpieza final verificada: ${JSON.stringify(cleanup)}`);
    }
    return { cases: api.cases, anomalies: api.anomalies, error };
}

// ---------------------------------------------------------------------------
// Serialización JSON compatible con biome (lineWidth 320): los arrays de
// primitivos se colapsan en una línea si caben; el resto se expande igual que
// JSON.stringify(value, null, 4). Verificado byte a byte contra la salida de
// `npx biome format` sobre las 50 fixtures de esta matriz.
// ---------------------------------------------------------------------------

const JSON_LINE_WIDTH = 320;
const JSON_PAD = '    ';

function isPrimitive(value) {
    return value === null || typeof value !== 'object';
}

function stringifyValue(value, depth, prefixLength) {
    if (Array.isArray(value)) {
        if (value.length === 0) return '[]';
        if (value.every(isPrimitive)) {
            const inline = `[${value.map(item => JSON.stringify(item)).join(', ')}]`;
            if (prefixLength + inline.length <= JSON_LINE_WIDTH) return inline;
        }
        const pad = JSON_PAD.repeat(depth + 1);
        const items = value.map(item => `${pad}${stringifyValue(item, depth + 1, pad.length)}`);
        return `[\n${items.join(',\n')}\n${JSON_PAD.repeat(depth)}]`;
    }
    if (value !== null && typeof value === 'object') {
        const keys = Object.keys(value);
        if (keys.length === 0) return '{}';
        const pad = JSON_PAD.repeat(depth + 1);
        const entries = keys.map(key => {
            const prefix = `${pad}${JSON.stringify(key)}: `;
            return `${prefix}${stringifyValue(value[key], depth + 1, prefix.length)}`;
        });
        return `{\n${entries.join(',\n')}\n${JSON_PAD.repeat(depth)}}`;
    }
    return JSON.stringify(value);
}

function stringifyFixture(fixture) {
    return `${stringifyValue(fixture, 0, 0)}\n`;
}

// ---------------------------------------------------------------------------
// CLI de captura: escribe un JSON por caso en php/
// ---------------------------------------------------------------------------

async function main() {
    const argv = process.argv.slice(2);
    let baseUrl = DEFAULT_BASE_URL;
    let verbose = false;
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--base-url') baseUrl = argv[++i];
        else if (arg === '--verbose') verbose = true;
        else if (arg === '--help' || arg === '-h') {
            console.log('Uso: node backend/tests/fixtures/capture.mjs [--base-url URL] [--verbose]');
            return;
        } else throw new Error(`Argumento desconocido: ${arg}`);
    }
    const log = verbose ? message => console.log(message) : () => {};
    const { cases, error } = await runMatrix({ baseUrl, log });
    if (error !== null) throw error;

    const outputDir = resolve(FIXTURES_DIR, 'php');
    mkdirSync(outputDir, { recursive: true });
    const expected = new Set(cases.map(item => `${item.name}.json`));
    for (const file of readdirSync(outputDir)) {
        if (file.endsWith('.json') && !expected.has(file)) rmSync(resolve(outputDir, file));
    }
    for (const item of cases) {
        writeFileSync(resolve(outputDir, `${item.name}.json`), stringifyFixture(item.fixture));
    }
    console.log(`✔ ${cases.length} fixtures capturadas en backend/tests/fixtures/php/`);
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    main().catch(error => {
        console.error(`✘ ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
    });
}
