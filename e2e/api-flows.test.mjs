// Replay E2E de flujos API, request-only (sin browser).
// Corre con: node --test e2e/api-flows.test.mjs
// Configurable: E2E_API (default API Node vía Apache), E2E_DB (cleanup), MYSQL_BIN.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';

const API = (process.env.E2E_API ?? 'http://localhost/sabores-latinoamerica/api/').replace(/\/+$/, '');
const DB = process.env.E2E_DB ?? 'sabores_latinoamerica';
const MYSQL_BIN = process.env.MYSQL_BIN ?? 'C:\\xampp\\mysql\\bin\\mysql.exe';

const stamp = Date.now().toString(36);
const USER = `e2e_api_${stamp}`.slice(0, 30);
const PASS = 'Temporal123';

function cleanup() {
    try {
        execFileSync(MYSQL_BIN, ['-u', 'root', DB, '-e', `DELETE FROM users WHERE username = '${USER}';`], { stdio: 'ignore' });
    } catch {
        // El flow feliz ya borra la cuenta; el cleanup es best-effort.
    }
}

async function call(method, path, { token, body } = {}) {
    const response = await fetch(`${API}/${path.replace(/^\/+/, '')}`, {
        method,
        headers: {
            ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const text = await response.text();
    let json = null;

    try {
        json = text === '' ? null : JSON.parse(text);
    } catch {
        json = null;
    }

    return { status: response.status, body: json, text };
}

test('api flow: register -> uso -> admin 403 -> delete -> login 401', async () => {
    let token = '';

    try {
        const registered = await call('POST', 'auth/register', {
            body: {
                username: USER,
                password: PASS,
                accept_terms: true,
                accept_privacy: true,
                age_confirmed: true
            }
        });

        assert.equal(registered.status, 200, `register: ${registered.text}`);
        token = registered.body.access;
        assert.ok(token, 'register devuelve access');

        const check = await call('GET', 'auth/check', { token });

        assert.equal(check.status, 200);
        assert.equal(check.body.username, USER);

        const countries = await call('GET', 'countries', { token });

        assert.equal(countries.status, 200);
        const country = countries.body.countries.find(item => item.recipe_count >= 2);

        assert.ok(country, 'hay un país con 2+ recetas');

        const page1 = await call('GET', `countries/${country.id}/recipes?page=1&per_page=1`, { token });
        const page2 = await call('GET', `countries/${country.id}/recipes?page=2&per_page=1`, { token });

        assert.equal(page1.body.pagination.page, 1);
        assert.equal(page2.body.pagination.page, 2);
        assert.notEqual(page1.body.recipes[0].id, page2.body.recipes[0].id);

        const added = await call('POST', 'favorites', { token, body: { recipe_id: 1, add: 1 } });

        assert.equal(added.status, 200);

        const favorites = await call('GET', 'favorites', { token });

        assert.equal(favorites.status, 200);
        assert.ok(favorites.body.favorites.some(item => item.id === 1));

        const removed = await call('POST', 'favorites', { token, body: { recipe_id: 1 } });

        assert.equal(removed.status, 200);
        assert.equal((await call('GET', 'favorites', { token })).body.favorites.length, 0);

        const forbidden = await call('GET', 'admin/sessions', { token });

        assert.equal(forbidden.status, 403);
        assert.equal(forbidden.body.error, 'Solo administradores.');

        const deleted = await call('DELETE', 'auth/account', { token, body: { password: PASS } });
        // El PHP v1 no expone DELETE /auth/account (es una adición del backend
        // Node, todo 16); en ese backend el flujo se valida hasta el 405.
        const phpWithoutDelete = deleted.status === 405 && deleted.body?.error === 'Método HTTP no permitido.';

        if (!phpWithoutDelete) {
            assert.equal(deleted.status, 200, `delete: ${deleted.text}`);

            const login = await call('POST', 'auth/login', { body: { username: USER, password: PASS } });

            assert.equal(login.status, 401, 'login posterior al delete debe fallar');
        }
    } finally {
        cleanup();
    }
});
