// Smoke E2E contra el servidor XAMPP vivo.
// Corre con: npm run test:e2e
// Requiere Apache+MySQL arriba y api/.env válido. Crea UN usuario
// `e2e_smoke_*` y su logout lo deja sin sesiones; el borrado de la fila
// se hace post-run (ver nota CLEANUP al final).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const BASE = process.env.E2E_BASE ?? 'http://localhost/sabores-latinoamerica/';
const API = new URL('api/', BASE).toString();
const CHROME = process.env.CHROME_PATH
    ?? 'C:\\Users\\WinterOS\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe';

const stamp = Date.now().toString(36);
const USER = `e2e_smoke_${stamp}`.slice(0, 30);
const PASS = 'Temporal123';

let browser;
let context;
let page;
const pageErrors = [];
const consoleErrors = [];

test('setup: lanzar chromium', async () => {
    browser = await chromium.launch({ executablePath: CHROME });
    context = await browser.newContext();
    page = await context.newPage();
    page.on('pageerror', (err) => pageErrors.push(String(err)));
    page.on('console', (msg) => {
        // Chrome loguea "Failed to load resource: 401" cuando checkSession()
        // prueba restaurar la sesion via POST /auth/refresh sin cookie al
        // arrancar. Es el probe de sesion por diseño (se captura y muestra
        // el login); solo fallamos ante otros errores de consola.
        if (msg.type() === 'error'
            && !msg.text().includes('favicon')
            && !msg.text().includes('401')) consoleErrors.push(msg.text());
    });
});

test('app: arranca sin pageerrors', async () => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('#authScreen.on', { timeout: 10000 });
    assert.equal(pageErrors.length, 0, `pageerrors: ${pageErrors.join(' | ')}`);
    assert.equal(consoleErrors.length, 0, `console.error: ${consoleErrors.join(' | ')}`);
});

test('api: health y guards sin auth', async () => {
    const req = context.request;
    const health = await req.get(new URL('health', API).toString());
    assert.equal(health.status(), 200);
    const hbody = await health.json();
    assert.equal(hbody.db, true);

    const noAuth = await req.get(new URL('countries', API).toString());
    assert.equal(noAuth.status(), 401);

    // 'abc' no matchea {id:[0-9]+}, pero el catch-all OPTIONS /{routes:.+}
    // si matchea el path -> Slim responde 405 (metodo no permitido) en vez
    // de 404. En ambos casos el recurso GET no existe: lo que importa es no-200.
    const badId = await req.get(new URL('countries/abc/recipes', API).toString());
    assert.equal(badId.status(), 405);

    const noRefresh = await req.post(new URL('auth/refresh', API).toString(), { data: {} });
    assert.equal(noRefresh.status(), 401);

    const noAdmin = await req.get(new URL('admin/sessions', API).toString());
    assert.equal(noAdmin.status(), 401);
});

test('auth: register -> uso -> logout -> refresh rechazado', async () => {
    const req = context.request;
    const reg = await req.post(new URL('auth/register', API).toString(), {
        data: { username: USER, password: PASS },
    });
    assert.equal(reg.status(), 200);
    const rbody = await reg.json();
    assert.ok(rbody.access, 'register devuelve access token');
    const token = rbody.access;
    const auth = { headers: { Authorization: `Bearer ${token}` } };

    const check = await req.get(new URL('auth/check', API).toString(), auth);
    assert.equal(check.status(), 200);
    assert.equal((await check.json()).username, USER);

    const countries = await req.get(new URL('countries', API).toString(), auth);
    assert.equal(countries.status(), 200);
    const clist = (await countries.json()).countries ?? (await countries.json()).data ?? [];
    const withRecipes = clist.find((c) => (c.recipe_count ?? 0) >= 2);
    assert.ok(withRecipes, 'hay un pais con 2+ recetas para paginar');
    const cid = withRecipes.id;

    const p1 = await (await req.get(new URL(`countries/${cid}/recipes?per_page=1&page=1`, API).toString(), auth)).json();
    const p2 = await (await req.get(new URL(`countries/${cid}/recipes?per_page=1&page=2`, API).toString(), auth)).json();
    assert.equal(p1.pagination.page, 1);
    assert.equal(p2.pagination.page, 2);
    assert.notEqual(p1.recipes[0].id, p2.recipes[0].id);

    const forbidden = await req.get(new URL('admin/sessions', API).toString(), auth);
    assert.equal(forbidden.status(), 403);

    const out = await req.post(new URL('auth/logout', API).toString());
    assert.equal(out.status(), 200);

    const stale = await req.post(new URL('auth/refresh', API).toString(), { data: {} });
    assert.equal(stale.status(), 401);
});

test('teardown: cerrar browser', async () => {
    await browser.close();
});

// CLEANUP (fuera del browser, con acceso a MySQL):
//   DELETE FROM users WHERE username LIKE 'e2e\_smoke\_%';
// Las sessions caen por ON DELETE CASCADE. login_attempts es telemetria y se purga sola.
