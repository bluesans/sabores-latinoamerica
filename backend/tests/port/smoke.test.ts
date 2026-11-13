/**
 * Port 1:1 de `api/tests/Integration/SmokeTest.php` contra la DB scratch.
 */
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { createTestPool, reloadTestSchema, TEST_DB_NAME } from '../support/test-db.js';

const EXPECTED_TABLES = ['countries', 'favorites', 'ingredients', 'login_attempts', 'recipe_ingredient', 'recipes', 'sessions', 'users'];

let pool: Pool;

beforeAll(async () => {
    const config = loadConfig();

    await reloadTestSchema(config);
    pool = createTestPool(config);
}, 60000);

afterAll(async () => {
    await pool.end();
});

describe('SmokeTest (PHP)', () => {
    it('testSchemaBoots', async () => {
        const [tables] = await pool.query<RowDataPacket[]>('SELECT table_name FROM information_schema.tables WHERE table_schema = ? AND table_type = ?', [TEST_DB_NAME, 'BASE TABLE']);
        const names = tables.map(row => String(row['table_name'])).sort();

        expect(names).toEqual([...EXPECTED_TABLES].sort());

        const [views] = await pool.query<RowDataPacket[]>('SELECT table_name FROM information_schema.tables WHERE table_schema = ? AND table_type = ?', [TEST_DB_NAME, 'VIEW']);

        expect(views.map(row => String(row['table_name']))).toContain('v_estadisticas');

        const [userColumns] = await pool.query<RowDataPacket[]>('SELECT column_name FROM information_schema.columns WHERE table_schema = ? AND table_name = ?', [TEST_DB_NAME, 'users']);
        const [sessionColumns] = await pool.query<RowDataPacket[]>('SELECT column_name FROM information_schema.columns WHERE table_schema = ? AND table_name = ?', [TEST_DB_NAME, 'sessions']);

        expect(userColumns.map(row => String(row['column_name']))).toContain('role');
        expect(sessionColumns.map(row => String(row['column_name']))).toContain('revoked_at');
    });
});
