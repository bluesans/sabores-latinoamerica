/**
 * Port 1:1 de `api/tests/Integration/StatsCountryTest.php` (todo 17).
 */
import type { FastifyInstance } from 'fastify';
import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { createTestPoolFor, reloadTestSchema, TEST_DB_NAME } from '../support/test-db.js';

const API = '/sabores-latinoamerica/api';

let pool: Pool;
let app: FastifyInstance;
let access = '';

beforeAll(async () => {
    const config = loadConfig();

    await reloadTestSchema(config);
    pool = createTestPoolFor(config, TEST_DB_NAME);
    app = createApp({ config, db: pool });
    await app.ready();

    const registered = await app.inject({ method: 'POST', url: `${API}/auth/register`, payload: { username: 'stats_user', password: 'Temporal123' } });

    access = String(registered.json().access);
}, 60000);

afterAll(async () => {
    await app.close();
    await pool.end();
});

function auth(): { authorization: string } {
    return { authorization: `Bearer ${access}` };
}

describe('StatsCountryTest (PHP)', () => {
    it('testStatsWithoutView', async () => {
        try {
            await pool.query('DROP VIEW IF EXISTS v_estadisticas');
            await pool.query("UPDATE recipes SET youtube_id = '' WHERE id = 57");
            await pool.query("INSERT INTO recipes (country_id, name, difficulty, time_minutes, youtube_id) VALUES (8, 'TEST stats probe', 'easy', 10, NULL)");

            const response = await app.inject({ method: 'GET', url: `${API}/stats`, headers: auth() });
            const body = response.json();

            expect(response.statusCode).toBe(200);
            expect(body.ok).toBe(true);
            expect(body.stats).toEqual({ paises_con_recetas: 19, total_recetas: 58, ingredientes_distintos: 185, recetas_con_video: 56 });
            expect(body.top_ingredients.length).toBeGreaterThan(0);
        } finally {
            // stale_state guard del PHP: restaurar el seed aunque el assert falle.
            await reloadTestSchema(loadConfig());
        }
    });

    it('testCountriesStrictMode', async () => {
        const config = loadConfig();
        const strictConnection = await mysql.createConnection({
            host: config.dbHost,
            user: config.dbUser,
            password: config.dbPass,
            database: TEST_DB_NAME,
            charset: 'utf8mb4_general_ci',
            dateStrings: true
        });
        const strictApp = createApp({ config, db: strictConnection as unknown as Pool });

        try {
            await strictConnection.query("SET SESSION sql_mode = 'ONLY_FULL_GROUP_BY'");

            const [modeRows] = await strictConnection.query<RowDataPacket[]>('SELECT @@SESSION.sql_mode AS mode');

            expect(String(modeRows[0]?.mode)).toContain('ONLY_FULL_GROUP_BY');

            await strictApp.ready();

            const response = await strictApp.inject({ method: 'GET', url: `${API}/countries`, headers: auth() });
            const body = response.json();

            expect(response.statusCode).toBe(200);
            expect(body.ok).toBe(true);
            expect(body.countries).toHaveLength(22);

            for (const country of body.countries) {
                expect(typeof country.recipe_count).toBe('number');
            }
        } finally {
            await strictApp.close();
            await strictConnection.end();
        }
    });
});
