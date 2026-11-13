/**
 * Port 1:1 de `api/tests/Integration/TransactionSweepTest.php`.
 *
 * El primer caso se porta a nivel DB (el contrato real es el ON DELETE
 * CASCADE del esquema; la ruta admin llega en el todo 19). El segundo
 * (404 de ingrediente inexistente) depende del controller admin -> todo 19.
 */
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { createTestPool, reloadTestSchema } from '../support/test-db.js';

const SEED_CEBOLLA_ID = 6;
const SEED_RECIPE_COUNT = 57;

let pool: Pool;

beforeAll(async () => {
    const config = loadConfig();

    await reloadTestSchema(config);
    pool = createTestPool(config);
}, 60000);

afterAll(async () => {
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

    it.todo('testDeleteUnknownIngredientStillReturns404WithoutSideEffects — lo cierra el todo 19');
});
