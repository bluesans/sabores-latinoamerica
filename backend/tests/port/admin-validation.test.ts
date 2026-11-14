/**
 * Port 1:1 de `api/tests/Integration/AdminValidationTest.php` (todo 19).
 */
import type { FastifyInstance } from 'fastify';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { createTestPool, reloadTestSchema } from '../support/test-db.js';

const API = '/sabores-latinoamerica/api';

let pool: Pool;
let app: FastifyInstance;
let admin = '';

function auth(): { authorization: string } {
    return { authorization: `Bearer ${admin}` };
}

async function call(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown): Promise<Awaited<ReturnType<FastifyInstance['inject']>>> {
    return app.inject({ method, url: `${API}${url}`, headers: auth(), ...(payload === undefined ? {} : { payload: payload as object }) });
}

async function recipeCount(name: string): Promise<number> {
    const [rows] = await pool.execute<RowDataPacket[]>('SELECT COUNT(*) AS total FROM recipes WHERE name = ?', [name]);

    return Number(rows[0]?.total ?? 0);
}

beforeAll(async () => {
    const config = loadConfig();

    await reloadTestSchema(config);
    pool = createTestPool(config);
    app = createApp({ config, db: pool });
    await app.ready();

    await app.inject({ method: 'POST', url: `${API}/auth/register`, payload: { username: 'admin_validation', password: 'Temporal123' } });
    await pool.execute("UPDATE users SET role = 'admin' WHERE username = 'admin_validation'");

    const login = await app.inject({ method: 'POST', url: `${API}/auth/login`, payload: { username: 'admin_validation', password: 'Temporal123' } });

    admin = String(login.json().access);
}, 60000);

afterAll(async () => {
    await app.close();
    await pool.end();
});

describe('AdminValidationTest (PHP)', () => {
    it('testMissingNameIsRejectedWith422AndFieldError', async () => {
        const response = await call('POST', '/admin/recipes', { country_id: 1 });

        expect(response.statusCode).toBe(422);
        expect(response.json()).toEqual({ ok: false, error: 'El nombre es obligatorio.', errors: { name: 'El nombre es obligatorio.' } });
    });

    it('testNameLongerThan200IsRejectedWith422', async () => {
        expect((await call('POST', '/admin/recipes', { name: 'x'.repeat(201), country_id: 1 })).statusCode).toBe(422);
    });

    it('testNonNumericCountryIdIsRejectedWith422', async () => {
        const response = await call('POST', '/admin/recipes', { name: 'Port Probe', country_id: 'abc' });

        expect(response.statusCode).toBe(422);
        expect(response.json().errors).toEqual({ country_id: 'País inválido.' });
    });

    it('testUnknownCountryIdIsRejectedWith422', async () => {
        expect((await call('POST', '/admin/recipes', { name: 'Port Probe', country_id: 9999 })).json().errors).toEqual({ country_id: 'País inválido.' });
    });

    it('testInvalidDifficultyIsRejectedWith422', async () => {
        expect((await call('POST', '/admin/recipes', { name: 'Port Probe', country_id: 1, difficulty: 'extreme' })).json().errors).toEqual({ difficulty: 'Dificultad inválida.' });
    });

    it('testInvalidTimeMinutesValuesAreRejectedWith422', async () => {
        for (const value of [-1, 100001, '1.5', 1.5, 'abc']) {
            const response = await call('POST', '/admin/recipes', { name: 'Port Probe', country_id: 1, time_minutes: value });

            expect(response.statusCode, JSON.stringify(value)).toBe(422);
            expect(response.json().errors).toEqual({ time_minutes: 'Tiempo inválido.' });
        }
    });

    it('testInvalidYoutubeIdIsRejectedWith422', async () => {
        for (const value of ['short', 'abc defghijk']) {
            const response = await call('POST', '/admin/recipes', { name: 'Port Probe', country_id: 1, youtube_id: value });

            expect(response.statusCode, value).toBe(422);
            expect(response.json().errors).toEqual({ youtube_id: 'ID de YouTube inválido (11 caracteres).' });
        }
    });

    it('testDescriptionOver10000CharsIsRejectedNotTruncated', async () => {
        const response = await call('POST', '/admin/recipes', { name: 'Port Probe Description', country_id: 1, description: 'x'.repeat(10001) });

        expect(response.statusCode).toBe(422);
        expect(response.json().errors).toEqual({ description: 'La descripción no puede superar los 10000 caracteres.' });
        expect(await recipeCount('Port Probe Description')).toBe(0);
    });

    it('testTopLevelErrorCarriesFirstFieldMessage', async () => {
        const response = await call('POST', '/admin/recipes', { name: '', country_id: 'abc', difficulty: 'x' });
        const body = response.json();

        expect(body.error).toBe('El nombre es obligatorio.');
        expect(Object.keys(body.errors)).toEqual(['name', 'country_id', 'difficulty']);
    });

    it('testValidMinimalCreatePersistsRow', async () => {
        const response = await call('POST', '/admin/recipes', { name: 'Port Minimal', country_id: 1 });
        const id = Number(response.json().id);

        expect(response.statusCode).toBe(200);

        const [rows] = await pool.execute<RowDataPacket[]>('SELECT country_id, description, difficulty, time_minutes, youtube_id FROM recipes WHERE id = ?', [id]);

        expect(rows[0]).toMatchObject({ country_id: 1, description: '', difficulty: null, time_minutes: null, youtube_id: null });

        await pool.execute('DELETE FROM recipes WHERE id = ?', [id]);
    });

    it('testValidFullCreatePersistsNormalizedFieldsAndIngredients', async () => {
        const response = await call('POST', '/admin/recipes', {
            name: '  Port Full  ',
            country_id: '2',
            description: '  descripcion  ',
            difficulty: 'easy',
            time_minutes: ' 45 ',
            youtube_id: ' abcdefghijk ',
            ingredients: ['  Port Ing A  ', 'Port Ing B', 'Port Ing A', '   ']
        });
        const id = Number(response.json().id);

        expect(response.statusCode).toBe(200);

        const [rows] = await pool.execute<RowDataPacket[]>('SELECT name, country_id, description, difficulty, time_minutes, youtube_id FROM recipes WHERE id = ?', [id]);

        expect(rows[0]).toMatchObject({ name: 'Port Full', country_id: 2, description: '  descripcion  ', difficulty: 'easy', time_minutes: 45, youtube_id: 'abcdefghijk' });

        const [links] = await pool.execute<RowDataPacket[]>('SELECT i.name FROM recipe_ingredient ri JOIN ingredients i ON i.id = ri.ingredient_id WHERE ri.recipe_id = ? ORDER BY i.name', [id]);

        expect(links.map(row => row.name)).toEqual(['Port Ing A', 'Port Ing B']);

        await pool.execute('DELETE FROM recipes WHERE id = ?', [id]);
        await pool.execute("DELETE FROM ingredients WHERE name IN ('Port Ing A', 'Port Ing B')");
    });

    it('testValidUpdateChangesExistingRow', async () => {
        const created = await call('POST', '/admin/recipes', { name: 'Port Before', country_id: 1 });
        const id = Number(created.json().id);
        const updated = await call('POST', '/admin/recipes', { id, name: 'Port After', country_id: 3, difficulty: 'hard', time_minutes: 10, ingredients: ['Sal'] });

        expect(updated.statusCode).toBe(200);
        expect(updated.json()).toEqual({ ok: true, id });

        const [rows] = await pool.execute<RowDataPacket[]>('SELECT name, country_id, difficulty, time_minutes FROM recipes WHERE id = ?', [id]);

        expect(rows[0]).toMatchObject({ name: 'Port After', country_id: 3, difficulty: 'hard', time_minutes: 10 });

        await pool.execute('DELETE FROM recipes WHERE id = ?', [id]);
    });

    it('testSaveCountryEmojiOver10CharsIsRejectedWith422', async () => {
        expect((await call('PUT', '/admin/countries/1', { emoji: 'x'.repeat(11) })).statusCode).toBe(422);
    });

    it('testSaveCountryTaglineOver150CharsIsRejectedWith422', async () => {
        expect((await call('PUT', '/admin/countries/1', { tagline: 'x'.repeat(151) })).statusCode).toBe(422);
    });

    it('testSaveCountryUnknownIdReturns404', async () => {
        const response = await call('PUT', '/admin/countries/9999', {});

        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({ ok: false, error: 'País no encontrado.' });
    });

    it('testSaveCountryUpdatesRowOnSuccess', async () => {
        expect((await call('PUT', '/admin/countries/2', { emoji: '🇦🇷', tagline: 'Port tagline' })).json()).toEqual({ ok: true });

        const [rows] = await pool.execute<RowDataPacket[]>('SELECT emoji, tagline FROM countries WHERE id = 2');

        expect(rows[0]).toMatchObject({ emoji: '🇦🇷', tagline: 'Port tagline' });
    });

    it('testRenameIngredientEmptyNameIsRejectedWith422', async () => {
        const response = await call('PUT', '/admin/ingredients/1', { name: '   ' });

        expect(response.statusCode).toBe(422);
        expect(response.json()).toEqual({ ok: false, error: 'El nombre es obligatorio.', errors: { name: 'El nombre es obligatorio.' } });
    });

    it('testRenameIngredientTooLongNameIsRejectedWith422', async () => {
        expect((await call('PUT', '/admin/ingredients/1', { name: 'x'.repeat(201) })).statusCode).toBe(422);
    });

    it('testRenameIngredientDuplicateReturns409', async () => {
        const response = await call('PUT', '/admin/ingredients/1', { name: 'Sal' });

        expect(response.statusCode).toBe(409);
        expect(response.json()).toEqual({ ok: false, error: 'Ese nombre ya existe.' });
    });

    it('testRenameIngredientUnknownIdReturns404', async () => {
        const response = await call('PUT', '/admin/ingredients/99999', { name: 'Port Name' });

        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({ ok: false, error: 'Ingrediente no encontrado.' });
    });

    it('testRenameIngredientSuccessPersistsNewName', async () => {
        const [created] = await pool.execute<RowDataPacket[]>("INSERT INTO ingredients (name) VALUES ('Port Rename')");
        const id = Number((created as { insertId: number }).insertId);

        expect((await call('PUT', `/admin/ingredients/${id}`, { name: 'Port Renamed' })).json()).toEqual({ ok: true });

        const [rows] = await pool.execute<RowDataPacket[]>('SELECT name FROM ingredients WHERE id = ?', [id]);

        expect(rows[0]?.name).toBe('Port Renamed');
    });

    it('testDeleteIngredientMissingReturns404', async () => {
        const response = await call('DELETE', '/admin/ingredients/99999');

        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({ ok: false, error: 'Ingrediente no encontrado.' });
    });

    it('testDeleteIngredientRemovesRow', async () => {
        const [created] = await pool.execute<RowDataPacket[]>("INSERT INTO ingredients (name) VALUES ('Port Delete')");
        const id = Number((created as { insertId: number }).insertId);

        expect((await call('DELETE', `/admin/ingredients/${id}`)).json()).toEqual({ ok: true });

        const [rows] = await pool.execute<RowDataPacket[]>('SELECT COUNT(*) AS total FROM ingredients WHERE id = ?', [id]);

        expect(Number(rows[0]?.total)).toBe(0);
    });

    it('testDeleteRecipeMissingReturns404', async () => {
        const response = await call('DELETE', '/admin/recipes/99999');

        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({ ok: false, error: 'Receta no encontrada.' });
    });

    it('testDeleteRecipeRemovesRow', async () => {
        const created = await call('POST', '/admin/recipes', { name: 'Port Delete Recipe', country_id: 1 });
        const id = Number(created.json().id);

        expect((await call('DELETE', `/admin/recipes/${id}`)).json()).toEqual({ ok: true });
        expect(await recipeCount('Port Delete Recipe')).toBe(0);
    });
});
