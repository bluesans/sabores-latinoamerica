/**
 * Port 1:1 de `api/tests/Integration/RemainingFlowTest.php` (todo 17).
 *
 * Portados: health (3), byCountry (2) e ingredient (2). Favoritos queda para
 * el todo 18 y create-admin para el 20.
 */
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { createTestPool, reloadTestSchema } from '../support/test-db.js';

const API = '/sabores-latinoamerica/api';

let pool: Pool;
let app: FastifyInstance;
let access = '';

beforeAll(async () => {
    const config = loadConfig();

    await reloadTestSchema(config);
    pool = createTestPool(config);
    app = createApp({ config, db: pool });
    await app.ready();

    const registered = await app.inject({ method: 'POST', url: `${API}/auth/register`, payload: { username: 'remaining_user', password: 'Temporal123' } });

    access = String(registered.json().access);
}, 60000);

afterAll(async () => {
    await app.close();
    await pool.end();
});

function auth(): { authorization: string } {
    return { authorization: `Bearer ${access}` };
}

function healthApp(db: { query(sql: string): Promise<unknown> }): FastifyInstance {
    return createApp({ config: loadConfig(), db: db as unknown as Pool });
}

const PENDING: ReadonlyArray<readonly [string, string]> = [
    ['testFavoriteToggleAddThenIndexShowsJoinedRow', 'todo 18'],
    ['testFavoriteToggleOffRemovesRowAndIndexEmpties', 'todo 18'],
    ['testFavoriteToggleUnknownRecipeReturns404', 'todo 18'],
    ['testCliCreatesAdminOnFreshSchema', 'todo 20'],
    ['testCliSecondRunWithoutForceKeepsHashUntouched', 'todo 20'],
    ['testCliForceRotatesPasswordHash', 'todo 20'],
    ['testCliRefusesToPromoteExistingUserRoleAccount', 'todo 20']
];

describe('RemainingFlowTest (PHP)', () => {
    it('testByCountryReturnsCountryBlockAndRecipesWithIngredients', async () => {
        const response = await app.inject({ method: 'GET', url: `${API}/countries/4/recipes`, headers: auth() });
        const body = response.json();

        expect(response.statusCode).toBe(200);
        expect(body.country).toMatchObject({ id: 4, name: 'Perú' });
        expect(body.country.emoji).not.toBe('');
        expect(body.recipes.map((recipe: { id: number }) => recipe.id)).toEqual([10, 11, 12]);

        const ceviche = body.recipes.find((recipe: { id: number }) => recipe.id === 10);

        expect(ceviche).toBeDefined();
        expect(ceviche.ingredients.map((ingredient: { id: number }) => ingredient.id)).toContain(56);

        for (const recipe of body.recipes) {
            expect(recipe.ingredients.length).toBeGreaterThan(0);
        }
    });

    it('testByCountryUnknownCountryReturns404', async () => {
        const response = await app.inject({ method: 'GET', url: `${API}/countries/9999/recipes`, headers: auth() });

        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({ ok: false, error: 'País no encontrado.' });
    });

    it('testIngredientShowReturnsIngredientAndJoinedRecipes', async () => {
        const response = await app.inject({ method: 'GET', url: `${API}/ingredients/1`, headers: auth() });
        const body = response.json();

        expect(response.statusCode).toBe(200);
        expect(body.ingredient).toEqual({ id: 1, name: 'Cerdo' });
        expect(body.recipes).toHaveLength(4);
        expect(body.recipes.map((recipe: { recipe_id: number }) => recipe.recipe_id).sort((a: number, b: number) => a - b)).toEqual([1, 26, 44, 51]);

        for (const recipe of body.recipes) {
            expect(Object.keys(recipe).sort()).toEqual(['country_id', 'country_name', 'difficulty', 'emoji', 'recipe_id', 'recipe_name']);
        }
    });

    it('testIngredientShowUnknownIngredientReturns404', async () => {
        const response = await app.inject({ method: 'GET', url: `${API}/ingredients/99999`, headers: auth() });

        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({ ok: false, error: 'Ingrediente no encontrado.' });
    });

    it('testHealthControllerAcceptsOptionalPdoInjection', async () => {
        const injected = healthApp({ query: async () => [[{ '1': 1 }], []] });

        try {
            const response = await injected.inject({ method: 'GET', url: `${API}/health` });

            expect(response.statusCode).toBe(200);
            expect(response.json()).toMatchObject({ ok: true, api: true, db: true });
        } finally {
            await injected.close();
        }
    });

    it('testHealthOkWithInjectedTestDbPdo', async () => {
        const response = await app.inject({ method: 'GET', url: `${API}/health` });
        const body = response.json();

        expect(response.statusCode).toBe(200);
        expect(body.ok).toBe(true);
        expect(body.api).toBe(true);
        expect(body.db).toBe(true);
        expect(body.time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('testHealthDbDownViaInjectedDeadPdoReturns503Shape', async () => {
        const dead = {
            query: async () => {
                throw new Error('simulated db outage');
            }
        };
        const deadApp = healthApp(dead);

        try {
            const response = await deadApp.inject({ method: 'GET', url: `${API}/health` });

            expect(response.statusCode).toBe(503);
            expect(response.json()).toMatchObject({ ok: false, api: true, db: false });
        } finally {
            await deadApp.close();
        }
    });

    for (const [name, closing] of PENDING) {
        it.todo(`${name} — lo cierra el ${closing}`);
    }
});
