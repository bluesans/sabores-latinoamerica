/**
 * Favoritos en paridad (todo 18): fixtures, doble toggle, aislamiento por
 * usuario, truthiness de `add` y errores exactos.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createTestPool, reloadTestSchema } from './support/test-db.js';

const API = '/sabores-latinoamerica/api';
const FIXTURES_DIR = fileURLToPath(new URL('./fixtures/php/', import.meta.url));

type Fixture = {
    response: { status: number; headers: Record<string, string>; body: Record<string, unknown> | null };
};

function fixture(name: string): Fixture {
    return JSON.parse(readFileSync(`${FIXTURES_DIR}${name}.json`, 'utf8')) as Fixture;
}

let pool: Pool;
let app: FastifyInstance;
let accessA = '';
let accessB = '';
let idA = 0;
let idB = 0;

function auth(access: string): { authorization: string } {
    return { authorization: `Bearer ${access}` };
}

async function get(access: string): Promise<Awaited<ReturnType<FastifyInstance['inject']>>> {
    return app.inject({ method: 'GET', url: `${API}/favorites`, headers: auth(access) });
}

async function post(access: string, payload: unknown): Promise<Awaited<ReturnType<FastifyInstance['inject']>>> {
    return app.inject({ method: 'POST', url: `${API}/favorites`, headers: auth(access), payload: payload as object });
}

beforeAll(async () => {
    const config = loadConfig();

    await reloadTestSchema(config);
    pool = createTestPool(config);
    app = createApp({ config, db: pool });
    await app.ready();

    // Dos usuarios alcanzan: el rate limit de register es 5/15min por IP.
    for (const [username, target] of [
        ['fav_user_a', 'a'],
        ['fav_user_b', 'b']
    ] as const) {
        const response = await app.inject({ method: 'POST', url: `${API}/auth/register`, payload: { username, password: 'Temporal123' } });

        expect(response.statusCode).toBe(200);

        if (target === 'a') {
            accessA = String(response.json().access);
        } else {
            accessB = String(response.json().access);
        }
    }

    const [ids] = await pool.execute<RowDataPacket[]>("SELECT id, username FROM users WHERE username IN ('fav_user_a', 'fav_user_b') ORDER BY username");

    idA = Number(ids[0]?.['id']);
    idB = Number(ids[1]?.['id']);
}, 60000);

beforeEach(async () => {
    await pool.execute('DELETE FROM favorites WHERE user_id IN (?, ?)', [idA, idB]);
});

afterAll(async () => {
    await app.close();
    await pool.end();
});

describe('favoritos fixture sequence', () => {
    it('add -> list -> remove -> empty con diffs zero', async () => {
        const empty = await get(accessA);

        expect(empty.statusCode).toBe(200);
        expect(empty.json()).toEqual(fixture('favorites_vacio').response.body);

        const added = await post(accessA, { recipe_id: 1, add: 1 });

        expect(added.statusCode).toBe(200);
        expect(added.json()).toEqual(fixture('favorites_agregar').response.body);

        const list = await get(accessA);

        expect(list.statusCode).toBe(200);
        expect(list.json()).toEqual(fixture('favorites_lista').response.body);

        const removed = await post(accessA, { recipe_id: 1 });

        expect(removed.statusCode).toBe(200);
        expect(removed.json()).toEqual(fixture('favorites_quitar').response.body);
        expect((await get(accessA)).json()).toEqual(fixture('favorites_vacio_final').response.body);
    });
});

describe('semántica de toggle', () => {
    it('doble add = una fila; doble remove = vacío', async () => {
        await post(accessA, { recipe_id: 1, add: true });
        await post(accessA, { recipe_id: 1, add: 1 });

        const [counts] = await pool.execute<RowDataPacket[]>('SELECT COUNT(*) AS total FROM favorites WHERE user_id = ?', [idA]);

        expect(Number(counts[0]?.['total'])).toBe(1);

        await post(accessA, { recipe_id: 1 });
        await post(accessA, { recipe_id: 1, add: 0 });

        expect((await get(accessA)).json().favorites).toEqual([]);
    });

    it('cada usuario ve solo sus favoritos', async () => {
        await post(accessA, { recipe_id: 1, add: 1 });

        expect((await get(accessA)).json().favorites).toHaveLength(1);
        expect((await get(accessB)).json().favorites).toEqual([]);
    });

    it('`add` respeta empty() de PHP', async () => {
        const truthy: unknown[] = [1, '1', true, [1], { x: 1 }, 'yes', 0.5];
        const falsy: unknown[] = [0, '0', '', false, [], {}, null, undefined];

        for (const value of truthy) {
            await post(accessA, { recipe_id: 1, add: value });

            const [rows] = await pool.execute<RowDataPacket[]>('SELECT COUNT(*) AS total FROM favorites WHERE user_id = ?', [idA]);

            expect(Number(rows[0]?.['total']), JSON.stringify(value)).toBe(1);
        }

        for (const value of falsy) {
            await post(accessA, { recipe_id: 1, add: value });

            const [rows] = await pool.execute<RowDataPacket[]>('SELECT COUNT(*) AS total FROM favorites WHERE user_id = ?', [idA]);

            expect(Number(rows[0]?.['total']), JSON.stringify(value)).toBe(0);
            // Reponer para que el próximo valor falsy vuelva a borrar.
            await post(accessA, { recipe_id: 1, add: 1 });
        }

        await post(accessA, { recipe_id: 1 });
    });

    it('GET ordena por created_at DESC', async () => {
        await pool.execute('INSERT INTO favorites (user_id, recipe_id, created_at) VALUES (?, 1, ?), (?, 2, ?)', [idA, '2026-01-01 10:00:00', idA, '2026-01-02 10:00:00']);

        expect((await get(accessA)).json().favorites.map((row: { id: number }) => row.id)).toEqual([2, 1]);
    });
});

describe('errores y auth', () => {
    it('recipe_id inválido -> 400 exacto', async () => {
        const cases: unknown[] = [{}, { recipe_id: 0 }, { recipe_id: '0' }, { recipe_id: 'abc' }, { recipe_id: 1.5 }, { recipe_id: true }, { recipe_id: -1 }, { recipe_id: [] }, null];

        for (const payload of cases) {
            const response = await post(accessA, payload);

            expect({ payload, status: response.statusCode, body: response.json() }).toEqual({
                payload,
                status: 400,
                body: { ok: false, error: 'Identificador inválido.' }
            });
        }
    });

    it('receta inexistente -> 404 exacto', async () => {
        const response = await post(accessA, { recipe_id: 99999, add: 1 });

        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({ ok: false, error: 'Receta inexistente.' });
    });

    it('sin token -> 401 en GET y POST', async () => {
        for (const method of ['GET', 'POST'] as const) {
            const response = await app.inject({ method, url: `${API}/favorites`, ...(method === 'POST' ? { payload: { recipe_id: 1 } } : {}) });

            expect(response.statusCode).toBe(401);
            expect(response.headers['www-authenticate']).toBe('Bearer');
            expect(response.json()).toEqual({ ok: false, error: 'Necesitás iniciar sesión.' });
        }
    });
});
