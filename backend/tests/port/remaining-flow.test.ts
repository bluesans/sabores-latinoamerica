/**
 * Port 1:1 de `api/tests/Integration/RemainingFlowTest.php`.
 *
 * Portados ahora: los 3 casos de /health (capa HTTP del todo 8, con DB
 * scratch o stub). Favoritos/recursos públicos quedan para 17/18 y el CLI
 * create-admin para 20.
 */
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'mysql2/promise';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { createTestPool, reloadTestSchema } from '../support/test-db.js';

const API = '/sabores-latinoamerica/api';

let pool: Pool;

beforeAll(async () => {
    const config = loadConfig();

    await reloadTestSchema(config);
    pool = createTestPool(config);
}, 60000);

afterAll(async () => {
    await pool.end();
});

const apps: FastifyInstance[] = [];

afterEach(async () => {
    await Promise.all(apps.splice(0).map(async app => app.close()));
});

const PENDING: ReadonlyArray<readonly [string, string]> = [
    ['testFavoriteToggleAddThenIndexShowsJoinedRow', 'todo 18'],
    ['testFavoriteToggleOffRemovesRowAndIndexEmpties', 'todo 18'],
    ['testFavoriteToggleUnknownRecipeReturns404', 'todo 18'],
    ['testByCountryReturnsCountryBlockAndRecipesWithIngredients', 'todo 17'],
    ['testByCountryUnknownCountryReturns404', 'todo 17'],
    ['testIngredientShowReturnsIngredientAndJoinedRecipes', 'todo 17'],
    ['testIngredientShowUnknownIngredientReturns404', 'todo 17'],
    ['testCliCreatesAdminOnFreshSchema', 'todo 20'],
    ['testCliSecondRunWithoutForceKeepsHashUntouched', 'todo 20'],
    ['testCliForceRotatesPasswordHash', 'todo 20'],
    ['testCliRefusesToPromoteExistingUserRoleAccount', 'todo 20']
];

function healthApp(db: { query(sql: string): Promise<unknown> }): FastifyInstance {
    const app = createApp({ config: loadConfig(), db });
    apps.push(app);

    return app;
}

describe('RemainingFlowTest (PHP)', () => {
    it('testHealthControllerAcceptsOptionalPdoInjection', async () => {
        const response = await healthApp({ query: async () => [[{ '1': 1 }], []] }).inject({ method: 'GET', url: `${API}/health` });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({ ok: true, api: true, db: true });
    });

    it('testHealthOkWithInjectedTestDbPdo', async () => {
        const response = await healthApp(pool).inject({ method: 'GET', url: `${API}/health` });
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
        const response = await healthApp(dead).inject({ method: 'GET', url: `${API}/health` });
        const body = response.json();

        expect(response.statusCode).toBe(503);
        expect(body).toMatchObject({ ok: false, api: true, db: false });
    });

    for (const [name, closing] of PENDING) {
        it.todo(`${name} — lo cierra el ${closing}`);
    }
});
