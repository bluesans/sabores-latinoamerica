/**
 * Port 1:1 de `api/tests/Integration/AdminSessionsTest.php`.
 *
 * Portados ahora (todo 10 + todo 11):
 * - testCreateRefreshTokenTruncatesLongUserAgent -> tests/sessions.test.ts
 * - testRefreshPersistsIpAndUserAgentOnRotation -> tests/sessions.test.ts
 * - testUnknownTokenRefreshThrottleReturns429WithRetryAfter (service-level)
 * - testLogoutAlwaysSucceedsEvenUnderRefreshThrottle (service-level)
 *
 * El resto depende de las rutas admin (todo 19).
 */
import type { FastifyInstance } from 'fastify';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { hashRefreshToken } from '../../src/auth/refresh-token.js';
import { loadConfig } from '../../src/config.js';
import { checkRefreshRateDetails, rateLimitMessage, recordFailedRefresh } from '../../src/rate-limit/attempts.js';
import { createSession, logoutSession, rotateRefreshToken } from '../../src/sessions/repository.js';
import { createTestPool, reloadTestSchema } from '../support/test-db.js';

const API = '/sabores-latinoamerica/api';
const IP = '203.0.113.123';
const UNKNOWN_TOKEN = 'de'.repeat(32);

let pool: Pool;
let app: FastifyInstance;
let adminAccess = '';

beforeAll(async () => {
    const config = loadConfig();

    await reloadTestSchema(config);
    pool = createTestPool(config);
    app = createApp({ config, db: pool });
    await app.ready();

    await app.inject({ method: 'POST', url: `${API}/auth/register`, payload: { username: 'admin_port', password: 'Temporal123' } });

    await pool.execute("UPDATE users SET role = 'admin' WHERE username = 'admin_port'");

    const login = await app.inject({ method: 'POST', url: `${API}/auth/login`, payload: { username: 'admin_port', password: 'Temporal123' } });

    adminAccess = String(login.json().access);
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

async function countAttempts(action: string): Promise<number> {
    const [rows] = await pool.execute<RowDataPacket[]>('SELECT COUNT(*) AS total FROM login_attempts WHERE action = ?', [action]);

    return Number(rows[0]?.total ?? 0);
}

/**
 * Simula AuthService::refresh en el orden real:
 * check de cuota -> rotate -> record del fallo.
 */
async function refreshLikeService(token: string): Promise<{ status: number; retryAfter?: number }> {
    const rate = await checkRefreshRateDetails(pool, IP);

    if (!rate.allowed) {
        return { status: 429, retryAfter: rate.retryAfter };
    }

    const rotation = await rotateRefreshToken(pool, token, { sessionDays: 7 });

    if (!rotation.ok) {
        await recordFailedRefresh(pool, IP);

        return { status: 401 };
    }

    return { status: 200 };
}

const PENDING: ReadonlyArray<readonly [string, string]> = [];

function adminAuth(): { authorization: string } {
    return { authorization: `Bearer ${adminAccess}` };
}

async function adminInject(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown): Promise<Awaited<ReturnType<FastifyInstance['inject']>>> {
    return app.inject({ method, url: `${API}${url}`, headers: adminAuth(), ...(payload === undefined ? {} : { payload: payload as object }) });
}

describe('AdminSessionsTest (PHP)', () => {
    it('testUnknownTokenRefreshThrottleReturns429WithRetryAfter', async () => {
        const statuses: number[] = [];
        let last: { status: number; retryAfter?: number } = { status: 0 };

        for (let i = 1; i <= 11; i += 1) {
            last = await refreshLikeService(UNKNOWN_TOKEN);
            statuses.push(last.status);
        }

        expect(statuses).toEqual([401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 429]);
        expect(last.retryAfter).toBeGreaterThan(0);
        expect(last.retryAfter).toBeLessThanOrEqual(300);
        expect(rateLimitMessage('refresh')).toBe('Demasiados intentos. Esperá unos minutos.');
        expect(await countAttempts('refresh')).toBe(10);
    });

    it('testLogoutAlwaysSucceedsEvenUnderRefreshThrottle', async () => {
        for (let i = 1; i <= 11; i += 1) {
            await refreshLikeService('ab'.repeat(32));
        }

        await expect(logoutSession(pool, 'ab'.repeat(32))).resolves.toBeUndefined();
        // El throttle sigue activo, pero logout no lo consulta.
        expect((await checkRefreshRateDetails(pool, IP)).allowed).toBe(false);
    });

    it('testRefreshViaControllerStoresRequestMetadata', async () => {
        const [result] = await pool.execute<ResultSetHeader>('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', ['meta_user', 'x', 'user']);
        const token = await createSession(pool, { userId: result.insertId, sessionDays: 7, ip: '10.0.0.1', userAgent: 'old-agent' });

        const response = await app.inject({
            method: 'POST',
            url: `${API}/auth/refresh`,
            headers: { cookie: `sdl_refresh=${token}`, 'user-agent': 'meta-agent/1.0' }
        });

        expect(response.statusCode).toBe(200);

        const rawCookie = response.headers['set-cookie'];
        const cookie = Array.isArray(rawCookie) ? String(rawCookie[0]) : String(rawCookie ?? '');
        const newToken = /sdl_refresh=([0-9a-f]{64})/.exec(cookie)?.[1] ?? '';
        const [rows] = await pool.execute<RowDataPacket[]>('SELECT ip, user_agent FROM sessions WHERE token = ?', [hashRefreshToken(newToken)]);

        expect(rows[0]?.ip).toBe('127.0.0.1');
        expect(rows[0]?.user_agent).toBe('meta-agent/1.0');
    });

    it('refresh sin user-agent persiste "" como el PHP', async () => {
        const [result] = await pool.execute<ResultSetHeader>('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', ['meta_user', 'x', 'user']);
        const token = await createSession(pool, { userId: result.insertId, sessionDays: 7, ip: '10.0.0.1', userAgent: 'old-agent' });

        const response = await app.inject({ method: 'POST', url: `${API}/auth/refresh`, headers: { cookie: `sdl_refresh=${token}`, 'user-agent': '' } });

        expect(response.statusCode).toBe(200);

        const rawCookie = response.headers['set-cookie'];
        const cookie = Array.isArray(rawCookie) ? String(rawCookie[0]) : String(rawCookie ?? '');
        const newToken = /sdl_refresh=([0-9a-f]{64})/.exec(cookie)?.[1] ?? '';
        const [rows] = await pool.execute<RowDataPacket[]>('SELECT user_agent FROM sessions WHERE token = ?', [hashRefreshToken(newToken)]);

        expect(rows[0]?.user_agent).toBe('');
    });

    for (const [name, closing] of PENDING) {
        it.todo(`${name} - lo cierra el ${closing}`);
    }

    it('testSaveRecipeUnknownIdReturns404WithoutOrphans', async () => {
        const response = await adminInject('POST', '/admin/recipes', { id: 99999, name: 'Port Probe', country_id: 1, ingredients: ['Port Orphan'] });

        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({ ok: false, error: 'Receta no encontrada.' });

        const [orphans] = await pool.execute<RowDataPacket[]>("SELECT COUNT(*) AS total FROM ingredients WHERE name = 'Port Orphan'");

        expect(Number(orphans[0]?.total)).toBe(0);
    });

    it('testSaveRecipeIngredientNameOver200IsRejectedWith422', async () => {
        const response = await adminInject('POST', '/admin/recipes', { name: 'Port Probe', country_id: 1, ingredients: ['x'.repeat(201)] });

        expect(response.statusCode).toBe(422);
        expect(response.json().errors).toEqual({ ingredients: 'El nombre del ingrediente no puede superar los 200 caracteres.' });
    });

    it('testSaveCountryInvalidIdReturns400', async () => {
        const response = await adminInject('PUT', '/admin/countries/0', {});

        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({ ok: false, error: 'ID inválido.' });
    });

    it('testRenameIngredientInvalidIdReturns400', async () => {
        expect((await adminInject('PUT', '/admin/ingredients/0', { name: 'Probe' })).json()).toEqual({ ok: false, error: 'ID inválido.' });
    });

    it('testDeleteIngredientInvalidIdReturns400', async () => {
        expect((await adminInject('DELETE', '/admin/ingredients/0')).json()).toEqual({ ok: false, error: 'ID inválido.' });
    });

    it('testListKeepsResponseShape', async () => {
        const response = await adminInject('GET', '/admin/data');
        const body = response.json();

        expect(response.statusCode).toBe(200);
        expect(Object.keys(body).sort()).toEqual(['countries', 'ingredients', 'ok', 'recipes']);
        expect(body.recipes).toHaveLength(57);
        expect(body.countries).toHaveLength(22);
        expect(body.ingredients).toHaveLength(185);
        expect(Object.keys(body.recipes[0]).sort()).toEqual(['country_id', 'country_name', 'description', 'difficulty', 'id', 'ingredients', 'name', 'time_minutes', 'youtube_id']);
    });

    it('testSessionsListReturnsJoinedRows', async () => {
        const [user] = await pool.execute<ResultSetHeader>('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', ['port_session_user', 'x', 'user']);
        const first = await createSession(pool, { userId: user.insertId, sessionDays: 7, ip: '10.0.0.1', userAgent: 'ua-1' });
        const second = await createSession(pool, { userId: user.insertId, sessionDays: 7, ip: '10.0.0.2', userAgent: null });

        const response = await adminInject('GET', '/admin/sessions');
        const rows = response.json().sessions;
        const tokens = new Set([hashRefreshToken(first), hashRefreshToken(second)]);

        expect(response.statusCode).toBe(200);
        expect(rows.length).toBe(2);

        for (const row of rows) {
            expect(Object.keys(row).sort()).toEqual(['created_at', 'expires_at', 'id', 'ip', 'revoked_at', 'user_agent', 'username']);
            expect(row.username).toBe('port_session_user');
            expect(row.revoked_at).toBeNull();
        }

        expect(tokens.size).toBe(2);
    });

    it('testRevokeSessionSoftRevokesAndSecondRevokeIs404', async () => {
        const [user] = await pool.execute<ResultSetHeader>('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', ['port_revoke_user', 'x', 'user']);
        await createSession(pool, { userId: user.insertId, sessionDays: 7, ip: '10.0.0.1', userAgent: null });

        const list = await adminInject('GET', '/admin/sessions');
        const id = list.json().sessions[0].id;

        expect((await adminInject('DELETE', `/admin/sessions/${id}`)).json()).toEqual({ ok: true });

        const [rows] = await pool.execute<RowDataPacket[]>('SELECT revoked_at FROM sessions WHERE id = ?', [id]);

        expect(rows[0]?.revoked_at).not.toBeNull();

        const again = await adminInject('DELETE', `/admin/sessions/${id}`);

        expect(again.statusCode).toBe(404);
        expect(again.json()).toEqual({ ok: false, error: 'Sesión no encontrada.' });
    });

    it('testRevokeSessionUnknownIdReturns404AndBadIdReturns400', async () => {
        expect((await adminInject('DELETE', '/admin/sessions/99999')).json()).toEqual({ ok: false, error: 'Sesión no encontrada.' });
        expect((await adminInject('DELETE', '/admin/sessions/0')).json()).toEqual({ ok: false, error: 'ID inválido.' });
    });
});
