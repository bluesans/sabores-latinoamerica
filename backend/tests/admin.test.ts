/**
 * Rutas de administración en paridad (todo 19): guards, admin data, CRUD,
 * validaciones 422, quirks de (int) y sesiones.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createTestPool, reloadTestSchema } from './support/test-db.js';

const API = '/sabores-latinoamerica/api';
const FIXTURES_DIR = fileURLToPath(new URL('./fixtures/php/', import.meta.url));

type Fixture = { response: { status: number; headers: Record<string, string>; body: Record<string, unknown> | null } };

function fixture(name: string): Fixture {
    return JSON.parse(readFileSync(`${FIXTURES_DIR}${name}.json`, 'utf8')) as Fixture;
}

let pool: Pool;
let app: FastifyInstance;
let adminAccess = '';
let userAccess = '';

function auth(access: string): { authorization: string } {
    return { authorization: `Bearer ${access}` };
}

async function inject(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, access = adminAccess, payload?: unknown): Promise<Awaited<ReturnType<FastifyInstance['inject']>>> {
    return app.inject({
        method,
        url: `${API}${url}`,
        headers: auth(access),
        ...(payload === undefined ? {} : { payload: payload as object })
    });
}

beforeAll(async () => {
    const config = loadConfig();

    await reloadTestSchema(config);
    pool = createTestPool(config);
    app = createApp({ config, db: pool });
    await app.ready();

    await pool.execute("UPDATE countries SET name = 'República Dominicana' WHERE id = 19");

    // Dos usuarios: admin_main se promueve y re-loguea; admin_plain queda user.
    for (const username of ['admin_main', 'admin_plain']) {
        const registered = await app.inject({ method: 'POST', url: `${API}/auth/register`, payload: { username, password: 'Temporal123' } });

        expect(registered.statusCode).toBe(200);
        userAccess = String(registered.json().access);
    }

    await pool.execute("UPDATE users SET role = 'admin' WHERE username = 'admin_main'");

    const login = await app.inject({ method: 'POST', url: `${API}/auth/login`, payload: { username: 'admin_main', password: 'Temporal123' } });

    expect(login.statusCode).toBe(200);
    adminAccess = String(login.json().access);
}, 60000);

afterAll(async () => {
    await app.close();
    await pool.end();
});

describe('guards', () => {
    it('sin token -> 401; user -> 403 exacto', async () => {
        const anonymous = await app.inject({ method: 'GET', url: `${API}/admin/sessions` });

        expect(anonymous.statusCode).toBe(401);
        expect(anonymous.headers['www-authenticate']).toBe('Bearer');

        const forbidden = await inject('GET', '/admin/sessions', userAccess);
        const expected = fixture('admin_sessions_forbidden_403');

        expect(forbidden.statusCode).toBe(403);
        expect(forbidden.headers['www-authenticate']).toBeUndefined();
        expect(forbidden.json()).toEqual(expected.response.body);
    });
});

describe('GET /admin/data', () => {
    it('admin_data_ok: 57 recetas, 22 países y 185 ingredientes exactos', async () => {
        const response = await inject('GET', '/admin/data');

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual(fixture('admin_data_ok').response.body);
    });
});

describe('POST /admin/recipes', () => {
    it('crea receta completa, normaliza campos y vincula ingredientes', async () => {
        const response = await inject('POST', '/admin/recipes', adminAccess, {
            name: 'Fixture19 Receta QA',
            country_id: 4,
            description: 'Fixture19: receta temporal.',
            difficulty: 'medium',
            time_minutes: '30',
            youtube_id: 'abcdefghijk',
            ingredients: ['Fixture19 Ing A', 'Fixture19 Ing B']
        });
        const body = response.json();
        const id = Number(body.id);

        expect(response.statusCode).toBe(200);
        expect(body).toEqual({ ok: true, id });

        const [rows] = await pool.execute<RowDataPacket[]>('SELECT country_id, name, description, difficulty, time_minutes, youtube_id FROM recipes WHERE id = ?', [id]);

        expect(rows[0]).toMatchObject({ country_id: 4, name: 'Fixture19 Receta QA', description: 'Fixture19: receta temporal.', difficulty: 'medium', time_minutes: 30, youtube_id: 'abcdefghijk' });

        const [links] = await pool.execute<RowDataPacket[]>('SELECT COUNT(*) AS total FROM recipe_ingredient WHERE recipe_id = ?', [id]);

        expect(Number(links[0]?.['total'])).toBe(2);

        await pool.execute('DELETE FROM recipes WHERE id = ?', [id]);
    });

    it('actualiza una receta existente', async () => {
        const created = await inject('POST', '/admin/recipes', adminAccess, { name: 'Fixture19 Update', country_id: 1, ingredients: [] });
        const id = Number(created.json().id);
        const updated = await inject('POST', '/admin/recipes', adminAccess, { id, name: 'Fixture19 Updated', country_id: 2, difficulty: 'hard', time_minutes: 0, ingredients: ['Sal'] });

        expect(updated.statusCode).toBe(200);
        expect(updated.json()).toEqual({ ok: true, id });

        const [rows] = await pool.execute<RowDataPacket[]>('SELECT country_id, name, difficulty, time_minutes, description FROM recipes WHERE id = ?', [id]);

        expect(rows[0]).toMatchObject({ country_id: 2, name: 'Fixture19 Updated', difficulty: 'hard', time_minutes: 0, description: '' });

        await pool.execute('DELETE FROM recipes WHERE id = ?', [id]);
    });

    it('id desconocido -> 404 y no crea vínculos huérfanos', async () => {
        const response = await inject('POST', '/admin/recipes', adminAccess, { id: 99999, name: 'Nope', country_id: 1, ingredients: ['Sal'] });

        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({ ok: false, error: 'Receta no encontrada.' });
    });

    it('validaciones 422 con top-level error del primer campo', async () => {
        const cases: Array<[Record<string, unknown>, string, Record<string, string>]> = [
            [{}, 'El nombre es obligatorio.', { name: 'El nombre es obligatorio.', country_id: 'País inválido.' }],
            [{ name: 'x'.repeat(201), country_id: 1 }, 'El nombre no puede superar los 200 caracteres.', { name: 'El nombre no puede superar los 200 caracteres.' }],
            [{ name: 'Probe', country_id: 'abc' }, 'País inválido.', { country_id: 'País inválido.' }],
            [{ name: 'Probe', country_id: 9999 }, 'País inválido.', { country_id: 'País inválido.' }],
            [{ name: 'Probe', country_id: 1, difficulty: 'extreme' }, 'Dificultad inválida.', { difficulty: 'Dificultad inválida.' }],
            [{ name: 'Probe', country_id: 1, time_minutes: -1 }, 'Tiempo inválido.', { time_minutes: 'Tiempo inválido.' }],
            [{ name: 'Probe', country_id: 1, time_minutes: 100001 }, 'Tiempo inválido.', { time_minutes: 'Tiempo inválido.' }],
            [{ name: 'Probe', country_id: 1, time_minutes: '1.5' }, 'Tiempo inválido.', { time_minutes: 'Tiempo inválido.' }],
            [{ name: 'Probe', country_id: 1, youtube_id: 'short' }, 'ID de YouTube inválido (11 caracteres).', { youtube_id: 'ID de YouTube inválido (11 caracteres).' }],
            [{ name: 'Probe', country_id: 1, youtube_id: 'abc defghijk' }, 'ID de YouTube inválido (11 caracteres).', { youtube_id: 'ID de YouTube inválido (11 caracteres).' }],
            [{ name: 'Probe', country_id: 1, description: 'x'.repeat(10001) }, 'La descripción no puede superar los 10000 caracteres.', { description: 'La descripción no puede superar los 10000 caracteres.' }],
            [{ name: 'Probe', country_id: 1, ingredients: ['x'.repeat(201)] }, 'El nombre del ingrediente no puede superar los 200 caracteres.', { ingredients: 'El nombre del ingrediente no puede superar los 200 caracteres.' }]
        ];

        for (const [payload, message, errors] of cases) {
            const response = await inject('POST', '/admin/recipes', adminAccess, payload);

            expect(response.statusCode, message).toBe(422);
            expect(response.json()).toEqual({ ok: false, error: message, errors });
        }
    });
});

describe('DELETE /admin/recipes/:id', () => {
    it('borra por (int) PHP: "<id>abc" funciona y "abc" da 404', async () => {
        const created = await inject('POST', '/admin/recipes', adminAccess, { name: 'Fixture19 Delete', country_id: 1, ingredients: [] });
        const id = Number(created.json().id);

        const deleted = await inject('DELETE', `/admin/recipes/${id}abc`);

        expect(deleted.statusCode).toBe(200);
        expect(deleted.json()).toEqual({ ok: true });

        const invalid = await inject('DELETE', '/admin/recipes/abc');
        const expected = fixture('admin_recipe_delete_id_invalido_404');

        expect(invalid.statusCode).toBe(404);
        expect(invalid.json()).toEqual(expected.response.body);
    });
});

describe('PUT /admin/countries/:id', () => {
    it('actualiza emoji/tagline y valida id/longitudes', async () => {
        expect((await inject('PUT', '/admin/countries/4', adminAccess, { emoji: '🇵🇪', tagline: 'La despensa del Pacífico' })).json()).toEqual({ ok: true });

        const zero = await inject('PUT', '/admin/countries/0', adminAccess, {});
        const expected = fixture('admin_country_id_cero_400');

        expect(zero.statusCode).toBe(400);
        expect(zero.json()).toEqual(expected.response.body);

        expect((await inject('PUT', '/admin/countries/9999', adminAccess, {})).statusCode).toBe(404);
        expect((await inject('PUT', '/admin/countries/4', adminAccess, { emoji: 'x'.repeat(11) })).statusCode).toBe(422);
        expect((await inject('PUT', '/admin/countries/4', adminAccess, { tagline: 'x'.repeat(151) })).statusCode).toBe(422);
    });
});

describe('ingredientes', () => {
    it('renombra, detecta duplicado/inexistente y valida nombre', async () => {
        const [created] = await pool.execute<RowDataPacket[]>("INSERT INTO ingredients (name) VALUES ('Fixture19 Ing Rename')");
        const id = Number((created as { insertId: number }).insertId);

        expect((await inject('PUT', `/admin/ingredients/${id}`, adminAccess, { name: 'Fixture19 Ing Renombrado' })).json()).toEqual({ ok: true });

        const [rows] = await pool.execute<RowDataPacket[]>('SELECT name FROM ingredients WHERE id = ?', [id]);

        expect(rows[0]?.['name']).toBe('Fixture19 Ing Renombrado');
        expect((await inject('PUT', '/admin/ingredients/99999', adminAccess, { name: 'Probe' })).statusCode).toBe(404);
        expect((await inject('PUT', '/admin/ingredients/0', adminAccess, { name: 'Probe' })).statusCode).toBe(400);
        expect((await inject('PUT', `/admin/ingredients/${id}`, adminAccess, { name: '  ' })).statusCode).toBe(422);
        expect((await inject('PUT', `/admin/ingredients/${id}`, adminAccess, { name: 'x'.repeat(201) })).statusCode).toBe(422);

        const duplicate = await inject('PUT', `/admin/ingredients/${id}`, adminAccess, { name: 'Sal' });

        expect(duplicate.statusCode).toBe(409);
        expect(duplicate.json()).toEqual({ ok: false, error: 'Ese nombre ya existe.' });
    });

    it('borra con cascada de vínculos y conserva la receta', async () => {
        const [ingredient] = await pool.execute<RowDataPacket[]>("INSERT INTO ingredients (name) VALUES ('Fixture19 Cascade')");
        const ingredientId = Number((ingredient as { insertId: number }).insertId);
        const created = await inject('POST', '/admin/recipes', adminAccess, { name: 'Fixture19 Cascade Recipe', country_id: 1, ingredients: ['Fixture19 Cascade'] });
        const recipeId = Number(created.json().id);

        const deleted = await inject('DELETE', `/admin/ingredients/${ingredientId}`);

        expect(deleted.statusCode).toBe(200);
        expect(deleted.json()).toEqual({ ok: true });

        const [links] = await pool.execute<RowDataPacket[]>('SELECT COUNT(*) AS total FROM recipe_ingredient WHERE ingredient_id = ?', [ingredientId]);
        const [recipes] = await pool.execute<RowDataPacket[]>('SELECT COUNT(*) AS total FROM recipes WHERE id = ?', [recipeId]);

        expect(Number(links[0]?.['total'])).toBe(0);
        expect(Number(recipes[0]?.['total'])).toBe(1);

        await pool.execute('DELETE FROM recipes WHERE id = ?', [recipeId]);
    });

    it('delete inválido/inexistente responde 400/404', async () => {
        expect((await inject('DELETE', '/admin/ingredients/0')).json()).toEqual({ ok: false, error: 'ID inválido.' });
        expect((await inject('DELETE', '/admin/ingredients/99999')).json()).toEqual({ ok: false, error: 'Ingrediente no encontrado.' });
    });
});

describe('sesiones', () => {
    it('lista joined rows y revoca soft con segundo intento 404', async () => {
        const list = await inject('GET', '/admin/sessions');
        const body = list.json();

        expect(list.statusCode).toBe(200);
        expect(body.ok).toBe(true);
        expect(body.sessions.length).toBeGreaterThanOrEqual(3);

        for (const session of body.sessions) {
            expect(Object.keys(session).sort()).toEqual(['created_at', 'expires_at', 'id', 'ip', 'revoked_at', 'user_agent', 'username']);
        }

        const active = body.sessions.find((session: { revoked_at: string | null }) => session.revoked_at === null);

        expect(active).toBeDefined();

        const revoked = await inject('DELETE', `/admin/sessions/${active.id}`);

        expect(revoked.statusCode).toBe(200);
        expect(revoked.json()).toEqual({ ok: true });

        const again = await inject('DELETE', `/admin/sessions/${active.id}`);

        expect(again.statusCode).toBe(404);
        expect(again.json()).toEqual({ ok: false, error: 'Sesión no encontrada.' });

        expect((await inject('DELETE', '/admin/sessions/99999')).statusCode).toBe(404);
        expect((await inject('DELETE', '/admin/sessions/0')).statusCode).toBe(400);
    });
});
