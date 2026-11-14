/**
 * Port 1:1 de `api/tests/Integration/SearchEscapeTest.php` (todo 17).
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

    const registered = await app.inject({ method: 'POST', url: `${API}/auth/register`, payload: { username: 'search_user', password: 'Temporal123' } });

    access = String(registered.json().access);

    for (const name of ['Aji 100%', 'Ajo_', 'Sal 100 gramos', 'AjoLomo', `${'a'.repeat(100)}z`]) {
        await pool.execute('INSERT INTO ingredients (name) VALUES (?)', [name]);
    }
}, 60000);

afterAll(async () => {
    await app.close();
    await pool.end();
});

async function search(q: string): Promise<Awaited<ReturnType<FastifyInstance['inject']>>> {
    return app.inject({ method: 'GET', url: `${API}/search?q=${encodeURIComponent(q)}`, headers: { authorization: `Bearer ${access}` } });
}

async function ingredientNames(q: string): Promise<string[]> {
    const body = (await search(q)).json();

    expect(body.ok).toBe(true);

    return body.ingredients.map((row: { name: string }) => row.name);
}

describe('SearchEscapeTest (PHP)', () => {
    it('testPercentWildcardIsLiteral', async () => {
        const names = await ingredientNames('100%');

        expect(names).toContain('Aji 100%');
        expect(names).toEqual(['Aji 100%']);
    });

    it('testUnderscoreWildcardIsLiteral', async () => {
        expect(await ingredientNames('Ajo_')).toEqual(['Ajo_']);
    });

    it('testNoMatchYieldsEmptyResultSets', async () => {
        const body = (await search('zzz')).json();

        expect(body).toEqual({ ok: true, countries: [], recipes: [], ingredients: [] });
    });

    it('testOversizedQueryIsCappedSilently', async () => {
        const response = await search('a'.repeat(150));
        const body = response.json();

        expect(response.statusCode).toBe(200);
        expect(body.ok).toBe(true);
        expect(body).toHaveProperty('countries');
        expect(body).toHaveProperty('recipes');
        expect(body).toHaveProperty('ingredients');
        // El decoy de 100 'a' + 'z' solo matchea si la query se truncó a 100.
        expect(body.ingredients.map((row: { name: string }) => row.name)).toContain(`${'a'.repeat(100)}z`);
    });
});
