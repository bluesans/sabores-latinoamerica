/**
 * Port 1:1 de `api/tests/Integration/TransactionSweepTest.php`.
 *
 * El primer caso se porta a nivel DB (el contrato real es el ON DELETE
 * CASCADE del esquema; la ruta admin llega en el todo 19). El segundo
 * (404 de ingrediente inexistente) depende del controller admin -> todo 19.
 */
import type { FastifyInstance } from 'fastify';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { createTestPool, reloadTestSchema } from '../support/test-db.js';

const API = '/sabores-latinoamerica/api';
const SEED_CEBOLLA_ID = 6;
const SEED_RECIPE_COUNT = 57;

let pool: Pool;
let app: FastifyInstance;
let admin = '';

beforeAll(async () => {
    const config = loadConfig();

    await reloadTestSchema(config);
    pool = createTestPool(config);
    app = createApp({ config, db: pool });
    await app.ready();

    await app.inject({ method: 'POST', url: `${API}/auth/register`, payload: { username: 'tx_sweep_admin', password: 'Temporal123' } });
    await pool.execute("UPDATE users SET role = 'admin' WHERE username = 'tx_sweep_admin'");

    const login = await app.inject({ method: 'POST', url: `${API}/auth/login`, payload: { username: 'tx_sweep_admin', password: 'Temporal123' } });

    admin = String(login.json().access);
}, 60000);

afterAll(async () => {
    await app.close();
    await pool.end();
});

async function scalar(sql: string, values: unknown[] = []): Promise<number> {
    const [rows] = await pool.execute<RowDataPacket[]>(sql, values);

    return Number(rows[0]?.total ?? 0);
}

describe('TransactionSweepTest (PHP)', () => {
    it('testDeleteSeededIngredientCascadesLinksAndKeepsRecipes', async () => {
        const usesBefore = await scalar('SELECT COUNT(*) AS total FROM recipe_ingredient WHERE ingredient_id = ?', [SEED_CEBOLLA_ID]);

        expect(usesBefore).toBeGreaterThan(1);
        expect(await scalar('SELECT COUNT(*) AS total FROM recipes')).toBe(SEED_RECIPE_COUNT);

        await pool.execute('DELETE FROM ingredients WHERE id = ?', [SEED_CEBOLLA_ID]);

        expect(await scalar('SELECT COUNT(*) AS total FROM ingredients WHERE id = ?', [SEED_CEBOLLA_ID])).toBe(0);
        expect(await scalar('SELECT COUNT(*) AS total FROM recipe_ingredient WHERE ingredient_id = ?', [SEED_CEBOLLA_ID])).toBe(0);
        expect(await scalar('SELECT COUNT(*) AS total FROM recipes')).toBe(SEED_RECIPE_COUNT);
        // Ingrediente hermano (Limón, id 8) conserva sus links.
        expect(await scalar('SELECT COUNT(*) AS total FROM recipe_ingredient WHERE ingredient_id = ?', [8])).toBeGreaterThan(0);
    });

    it('testDeleteUnknownIngredientStillReturns404WithoutSideEffects', async () => {
        const ingredientsBefore = await scalar('SELECT COUNT(*) AS total FROM ingredients');
        const recipesBefore = await scalar('SELECT COUNT(*) AS total FROM recipes');
        const response = await app.inject({ method: 'DELETE', url: `${API}/admin/ingredients/99999`, headers: { authorization: `Bearer ${admin}` } });

        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({ ok: false, error: 'Ingrediente no encontrado.' });
        expect(await scalar('SELECT COUNT(*) AS total FROM ingredients')).toBe(ingredientsBefore);
        expect(await scalar('SELECT COUNT(*) AS total FROM recipes')).toBe(recipesBefore);
    });
});
