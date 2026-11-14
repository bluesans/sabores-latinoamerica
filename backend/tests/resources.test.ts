/**
 * Recursos públicos en paridad (todo 17), contra las fixtures doradas y la
 * DB scratch. Todas las rutas exigen Bearer.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createTestPool, reloadTestSchema } from './support/test-db.js';

const API = '/sabores-latinoamerica/api';
const FIXTURES_DIR = fileURLToPath(new URL('./fixtures/php/', import.meta.url));

type Fixture = {
    request: { query: Record<string, string> };
    response: { status: number; headers: Record<string, string>; body: Record<string, unknown> | null };
};

function fixture(name: string): Fixture {
    return JSON.parse(readFileSync(`${FIXTURES_DIR}${name}.json`, 'utf8')) as Fixture;
}

let pool: Pool;
let app: FastifyInstance;
let access = '';

beforeAll(async () => {
    const config = loadConfig();

    await reloadTestSchema(config);
    pool = createTestPool(config);
    app = createApp({ config, db: pool });
    await app.ready();

    // Drift conocido live vs seed 000: país 19 se llama "República Dominicana"
    // en la viva y "Rep. Dominicana" en el baseline. Las fixtures son la viva.
    await pool.execute("UPDATE countries SET name = 'República Dominicana' WHERE id = 19");

    const registered = await app.inject({ method: 'POST', url: `${API}/auth/register`, payload: { username: 'resources_user', password: 'Temporal123' } });

    expect(registered.statusCode).toBe(200);
    access = String(registered.json().access);
}, 60000);

afterAll(async () => {
    await app.close();
    await pool.end();
});

function auth(): { authorization: string } {
    return { authorization: `Bearer ${access}` };
}

async function get(path: string, query: Record<string, string> = {}): Promise<Awaited<ReturnType<FastifyInstance['inject']>>> {
    const search = new URLSearchParams(query).toString();

    return app.inject({ method: 'GET', url: `${API}${path}${search === '' ? '' : `?${search}`}`, headers: auth() });
}

function expectBody(response: Awaited<ReturnType<FastifyInstance['inject']>>, name: string): void {
    const expected = fixture(name);

    expect(response.statusCode).toBe(expected.response.status);
    expect(response.headers['content-type']).toBe(expected.response.headers['content-type']);
    expect(response.json()).toEqual(expected.response.body);
}

describe('GET /countries', () => {
    it('countries_ok: 22 países con recipe_count y tipos exactos', async () => {
        expectBody(await get('/countries'), 'countries_ok');
    });

    it('sin token: 401 del middleware (fixture)', async () => {
        const response = await app.inject({ method: 'GET', url: `${API}/countries` });
        const expected = fixture('countries_sin_token_401');

        expect(response.statusCode).toBe(401);
        expect(response.headers['www-authenticate']).toBe('Bearer');
        expect(response.json()).toEqual(expected.response.body);
    });
});

describe('GET /stats', () => {
    it('stats_ok: totales y top de ingredientes exactos', async () => {
        expectBody(await get('/stats'), 'stats_ok');
    });
});

describe('GET /countries/:id/recipes', () => {
    it('country_recipes_ok: país + recetas + ingredientes ordenados', async () => {
        expectBody(await get('/countries/4/recipes'), 'country_recipes_ok');
    });

    it('country_recipes_paginado: page/per_page', async () => {
        expectBody(await get('/countries/4/recipes', { per_page: '2', page: '1' }), 'country_recipes_paginado');
    });

    it('country_recipes_pagina_fuera_de_rango: recetas vacías y metadata', async () => {
        expectBody(await get('/countries/4/recipes', { per_page: '2', page: '99' }), 'country_recipes_pagina_fuera_de_rango');
    });

    it('id 0 -> 400 e id inexistente -> 404 con bodies exactos', async () => {
        expectBody(await get('/countries/0/recipes'), 'country_recipes_id_cero_400');
        expectBody(await get('/countries/9999/recipes'), 'country_recipes_id_inexistente_404');
    });

    it('id alfanumérico -> 405 (el regex de la ruta no matchea)', async () => {
        const response = await get('/countries/12abc/recipes');
        const expected = fixture('country_recipes_id_alfanumerico_405');

        expect(response.statusCode).toBe(405);
        expect(response.headers.allow).toBeUndefined();
        expect(response.json().ok).toBe(false);
        expect(response.json().error).toBe(expected.response.body?.['error']);
    });

    it('page/per_page inválidos -> 400', async () => {
        const cases = [{ page: 'abc' }, { page: '0' }, { page: '-1' }, { page: '2.5' }, { per_page: 'abc' }, { per_page: '0' }, { per_page: '-2' }, { per_page: '101' }, { per_page: '1.5' }, { page: '1', per_page: '1000' }];

        for (const query of cases) {
            const response = await get('/countries/4/recipes', query);

            expect(response.statusCode, JSON.stringify(query)).toBe(400);
            expect(response.json().ok).toBe(false);
        }
    });

    it('página 2 no se solapa con la 1', async () => {
        const page1 = (await get('/countries/4/recipes', { page: '1', per_page: '2' })).json();
        const page2 = (await get('/countries/4/recipes', { page: '2', per_page: '2' })).json();

        expect(page1.recipes.map((recipe: { id: number }) => recipe.id)).toEqual([10, 11]);
        expect(page2.recipes.map((recipe: { id: number }) => recipe.id)).toEqual([12]);
        expect(page2.pagination).toMatchObject({ page: 2, per_page: 2, total: 3, total_pages: 2 });
    });
});

describe('GET /ingredients/:id', () => {
    it('ingredient_ok: ingrediente + recetas ordenadas', async () => {
        expectBody(await get('/ingredients/1'), 'ingredient_ok');
    });

    it('id 0 -> 400, inexistente -> 404 y alfanumérico -> 405', async () => {
        expectBody(await get('/ingredients/0'), 'country_recipes_id_cero_400');
        expectBody(await get('/ingredients/99999'), 'ingredient_inexistente_404');

        const bad = await get('/ingredients/12abc');

        expect(bad.statusCode).toBe(405);
    });
});

describe('GET /search', () => {
    it('search_con_datos: recetas por nombre/descripcion en orden', async () => {
        expectBody(await get('/search', { q: 'taco' }), 'search_con_datos');
    });

    it('search_vacia, un carácter y consulta larga responden vacío', async () => {
        expectBody(await get('/search', { q: '' }), 'search_vacia');
        expectBody(await get('/search', { q: 'a' }), 'search_un_caracter');

        const long = await get('/search', { q: 'a'.repeat(150) });

        expect(long.statusCode).toBe(200);
        expect(long.json()).toEqual({ ok: true, countries: [], recipes: [], ingredients: [] });
    });

    it("'100%' es literal: no matchea 'Sal 100 gramos'", async () => {
        try {
            await pool.execute("INSERT INTO ingredients (name) VALUES ('Aji 100%'), ('Sal 100 gramos')");

            const names = (await get('/search', { q: '100%' })).json().ingredients.map((row: { name: string }) => row.name);

            expect(names).toEqual(['Aji 100%']);
        } finally {
            await pool.execute("DELETE FROM ingredients WHERE name IN ('Aji 100%', 'Sal 100 gramos')");
        }
    });

    it("'Ajo_' es literal: no matchea 'Ajonjolí' ni 'AjoLomo'", async () => {
        try {
            await pool.execute("INSERT INTO ingredients (name) VALUES ('Ajo_'), ('AjoLomo')");

            const names = (await get('/search', { q: 'Ajo_' })).json().ingredients.map((row: { name: string }) => row.name);

            expect(names).toEqual(['Ajo_']);
        } finally {
            await pool.execute("DELETE FROM ingredients WHERE name IN ('Ajo_', 'AjoLomo')");
        }
    });

    it('sin match devuelve los tres arrays vacíos', async () => {
        const body = (await get('/search', { q: 'zzz' })).json();

        expect(body).toEqual({ ok: true, countries: [], recipes: [], ingredients: [] });
    });
});
