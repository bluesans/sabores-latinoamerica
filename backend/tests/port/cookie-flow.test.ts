/**
 * Port 1:1 de `api/tests/Integration/CookieFlowTest.php`.
 *
 * Portado ahora (todo 13): register setea la cookie y saca el refresh del body.
 * Ya cubiertos: rotation/reuse (tests/sessions.test.ts) y 11º login fallido
 * (tests/rate-limit.test.ts). Login/logout/tampered quedan para el todo 14.
 */
import type { FastifyInstance } from 'fastify';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { decodeAccessToken } from '../../src/auth/jwt.js';
import { loadConfig } from '../../src/config.js';
import { createTestPool, reloadTestSchema } from '../support/test-db.js';

const API = '/sabores-latinoamerica/api';
const PASSWORD = 'S3gura!Pass2026';

let pool: Pool;
let app: FastifyInstance;

beforeAll(async () => {
    const config = loadConfig();

    await reloadTestSchema(config);
    pool = createTestPool(config);
    app = createApp({ config, db: pool });
    await app.ready();
}, 60000);

afterAll(async () => {
    await app.close();
    await pool.end();
});

beforeEach(async () => {
    await pool.query('DELETE FROM login_attempts');
    await pool.query('DELETE FROM sessions');
    await pool.query('DELETE FROM users');
});

const PENDING: ReadonlyArray<readonly [string, string]> = [
    ['testLoginSetsCookieAndStripsBodyAndAccessWorks', 'todo 14'],
    ['testLogoutExpiresCookieAndRevokesSession', 'todo 14'],
    ['testTamperedCookieValueGets401AndClearCookie', 'todo 14']
];

describe('CookieFlowTest (PHP)', () => {
    it('testRegisterSetsCookieAndStripsBody', async () => {
        const response = await app.inject({
            method: 'POST',
            url: `${API}/auth/register`,
            payload: { username: 'qa_cookie_user', password: PASSWORD }
        });

        expect(response.statusCode).toBe(200);
        expect(response.headers['content-type']).toBe('application/json; charset=utf-8');

        const rawCookie = response.headers['set-cookie'];
        const cookie = Array.isArray(rawCookie) ? String(rawCookie[0]) : String(rawCookie ?? '');

        expect(cookie).toMatch(/^sdl_refresh=[0-9a-f]{64}; Path=\/sabores-latinoamerica\/api; Max-Age=604800; HttpOnly; SameSite=Strict$/);
        expect(cookie).not.toContain('Secure');

        const body = response.json();

        expect(body.username).toBe('qa_cookie_user');
        expect(body).not.toHaveProperty('refresh');
        expect(decodeAccessToken(app, String(body.access))).not.toBeNull();

        const [rows] = await pool.execute<RowDataPacket[]>('SELECT COUNT(*) AS total FROM sessions');
        expect(Number(rows[0]?.total)).toBe(1);
    });

    for (const [name, closing] of PENDING) {
        it.todo(`${name} — lo cierra el ${closing}`);
    }
});
