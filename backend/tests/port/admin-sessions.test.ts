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

const PENDING: ReadonlyArray<readonly [string, string]> = [
    ['testSaveRecipeUnknownIdReturns404WithoutOrphans', 'todo 19'],
    ['testSaveRecipeIngredientNameOver200IsRejectedWith422', 'todo 19'],
    ['testSaveCountryInvalidIdReturns400', 'todo 19'],
    ['testRenameIngredientInvalidIdReturns400', 'todo 19'],
    ['testDeleteIngredientInvalidIdReturns400', 'todo 19'],
    ['testListKeepsResponseShape', 'todo 19'],
    ['testSessionsListReturnsJoinedRows', 'todo 19'],
    ['testRevokeSessionSoftRevokesAndSecondRevokeIs404', 'todo 19'],
    ['testRevokeSessionUnknownIdReturns404AndBadIdReturns400', 'todo 19']
];

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
        it.todo(`${name} — lo cierra el ${closing}`);
    }
});
