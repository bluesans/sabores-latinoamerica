/**
 * Port 1:1 de `api/tests/Integration/HardeningTest.php` (todo 17).
 *
 * Waiver documentado: los casos de id no numérico son white-box en el PHP
 * (llaman al controller con `args`); a nivel HTTP el regex de la ruta no
 * matchea y Slim/Fastify responden 405 (fixture
 * `country_recipes_id_alfanumerico_405`). Se verifica el 405 real.
 */
import type { FastifyInstance } from 'fastify';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { type AppConfig, loadConfig, parseConfig } from '../../src/config.js';
import { createTestPool, reloadTestSchema } from '../support/test-db.js';

const API = '/sabores-latinoamerica/api';
const BASE_ENV: Record<string, string> = {
    DB_HOST: '127.0.0.1',
    DB_NAME: 'sabores_test',
    DB_USER: 'root',
    JWT_SECRET: 's'.repeat(64),
    BASE_PATH: API
};

let pool: Pool;
let app: FastifyInstance;
let access = '';

beforeAll(async () => {
    const config = loadConfig();

    await reloadTestSchema(config);
    pool = createTestPool(config);
    app = createApp({ config, db: pool });
    await app.ready();

    const registered = await app.inject({ method: 'POST', url: `${API}/auth/register`, payload: { username: 'hardening_user', password: 'Temporal123' } });

    access = String(registered.json().access);
}, 60000);

afterAll(async () => {
    await app.close();
    await pool.end();
});

function auth(): { authorization: string } {
    return { authorization: `Bearer ${access}` };
}

function stubApp(overrides: Record<string, string> = {}): FastifyInstance {
    const config: AppConfig = parseConfig({ ...BASE_ENV, ...overrides });

    return createApp({ config, db: { execute: async () => [[], []], query: async () => [[{ '1': 1 }], []] } as unknown as Pool });
}

const PENDING: ReadonlyArray<readonly [string, string]> = [
    ['testFavoriteToggleBadRecipeIdReturns400', 'todo 18'],
    ['testFavoriteToggleWellFormedMissingStill404', 'todo 18'],
    ['testRoutesConstrainPublicIdsButNotAdminGroup', 'todo 19 (parte admin)']
];

describe('HardeningTest (PHP)', () => {
    it('testByCountryNonNumericIdReturns400 -> 405 HTTP (waiver de routing)', async () => {
        for (const id of ['abc', '12abc', '-3', '1.5']) {
            const response = await app.inject({ method: 'GET', url: `${API}/countries/${id}/recipes`, headers: auth() });

            expect({ id, status: response.statusCode }).toEqual({ id, status: 405 });
        }
    });

    it('testIngredientNonNumericIdReturns400 -> 405 HTTP (waiver de routing)', async () => {
        for (const id of ['abc', '12abc', '-3', '1.5']) {
            const response = await app.inject({ method: 'GET', url: `${API}/ingredients/${id}`, headers: auth() });

            expect({ id, status: response.statusCode }).toEqual({ id, status: 405 });
        }
    });

    it('testByCountryWellFormedMissingIdStill404', async () => {
        const response = await app.inject({ method: 'GET', url: `${API}/countries/9999/recipes`, headers: auth() });

        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({ ok: false, error: 'País no encontrado.' });
    });

    it('testByCountryBadPaginationParamsReturn400', async () => {
        const cases = [{ page: 'abc' }, { page: '0' }, { page: '-1' }, { page: '2.5' }, { per_page: 'abc' }, { per_page: '0' }, { per_page: '-2' }, { per_page: '101' }, { per_page: '1.5' }, { page: '1', per_page: '1000' }];

        for (const query of cases) {
            const search = new URLSearchParams(query).toString();
            const response = await app.inject({ method: 'GET', url: `${API}/countries/4/recipes?${search}`, headers: auth() });

            expect({ query, status: response.statusCode }).toEqual({ query, status: 400 });
        }
    });

    it('testByCountryWithoutParamsReturnsAllWithPaginationMeta', async () => {
        const body = (await app.inject({ method: 'GET', url: `${API}/countries/4/recipes`, headers: auth() })).json();

        expect(body.ok).toBe(true);
        expect(body.recipes.map((recipe: { id: number }) => recipe.id)).toEqual([10, 11, 12]);
        expect(body.pagination).toEqual({ page: 1, per_page: 3, total: 3, total_pages: 1 });
    });

    it('testByCountryPageTwoDiffersFromPageOne', async () => {
        const page1 = (await app.inject({ method: 'GET', url: `${API}/countries/4/recipes?page=1&per_page=2`, headers: auth() })).json();
        const page2 = (await app.inject({ method: 'GET', url: `${API}/countries/4/recipes?page=2&per_page=2`, headers: auth() })).json();

        expect(page1.recipes.map((recipe: { id: number }) => recipe.id)).toEqual([10, 11]);
        expect(page2.recipes.map((recipe: { id: number }) => recipe.id)).toEqual([12]);
        expect(page2.pagination).toMatchObject({ page: 2, per_page: 2, total: 3, total_pages: 2 });

        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT i.id FROM recipe_ingredient ri JOIN ingredients i ON i.id = ri.ingredient_id
             WHERE ri.recipe_id = ? ORDER BY i.name`,
            [12]
        );
        const expectedIds = rows.map(row => Number(row['id']));
        const actualIds = page2.recipes[0].ingredients.map((ingredient: { id: number }) => ingredient.id);

        expect(actualIds).toEqual(expectedIds);
    });

    it('testCorsEmitsVaryAndMaxAgeWhenOriginConfigured', async () => {
        const corsApp = stubApp({ CORS_ORIGIN: 'https://example.com' });

        try {
            const response = await corsApp.inject({ method: 'GET', url: `${API}/health` });

            expect(response.headers['access-control-allow-origin']).toBe('https://example.com');
            expect(response.headers.vary).toBe('Origin');
            expect(response.headers['access-control-max-age']).toBe('600');
        } finally {
            await corsApp.close();
        }
    });

    it('testCorsStaysSilentWhenOriginEmpty', async () => {
        const corsApp = stubApp({ CORS_ORIGIN: '' });

        try {
            const response = await corsApp.inject({ method: 'GET', url: `${API}/health` });

            expect(response.headers['access-control-allow-origin']).toBeUndefined();
            expect(response.headers.vary).toBeUndefined();
        } finally {
            await corsApp.close();
        }
    });

    it('testAuthMiddleware401CarriesWwwAuthenticate', async () => {
        const response = await app.inject({ method: 'GET', url: `${API}/countries` });

        expect(response.statusCode).toBe(401);
        expect(response.headers['www-authenticate']).toBe('Bearer');
        expect(response.json()).toEqual({ ok: false, error: 'Necesitás iniciar sesión.' });
    });

    it('testHealthTimeIsExplicitUtc', async () => {
        const response = await app.inject({ method: 'GET', url: `${API}/health` });
        const body = response.json();

        expect(body.time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(String(body.time).endsWith('+00:00')).toBe(true);
    });

    it('testSearchLimitedResultsAreDeterministicallyOrdered', async () => {
        const body = (await app.inject({ method: 'GET', url: `${API}/search?q=a`, headers: auth() })).json();

        // q de 1 char devuelve vacío; usamos una query de 2+ que sí matchea.
        const withData = (await app.inject({ method: 'GET', url: `${API}/search?q=ta`, headers: auth() })).json();

        expect(body).toEqual({ ok: true, countries: [], recipes: [], ingredients: [] });
        expect(withData.recipes).toHaveLength(6);
        expect(withData.countries.length).toBeLessThanOrEqual(4);
        expect(withData.ingredients.length).toBeLessThanOrEqual(4);

        const ids = withData.recipes.map((recipe: { id: number }) => recipe.id);

        expect(ids).toEqual([...ids].sort((a, b) => a - b));
    });

    for (const [name, closing] of PENDING) {
        it.todo(`${name} — lo cierra el ${closing}`);
    }
});
