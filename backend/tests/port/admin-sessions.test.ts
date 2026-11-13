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
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { checkRefreshRateDetails, rateLimitMessage, recordFailedRefresh } from '../../src/rate-limit/attempts.js';
import { logoutSession, rotateRefreshToken } from '../../src/sessions/repository.js';
import { createTestPool, reloadTestSchema } from '../support/test-db.js';

const IP = '203.0.113.123';
const UNKNOWN_TOKEN = 'de'.repeat(32);

let pool: Pool;

beforeAll(async () => {
    const config = loadConfig();

    await reloadTestSchema(config);
    pool = createTestPool(config);
}, 60000);

afterAll(async () => {
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
    ['testRevokeSessionUnknownIdReturns404AndBadIdReturns400', 'todo 19'],
    ['testRefreshViaControllerStoresRequestMetadata', 'todo 14']
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

    for (const [name, closing] of PENDING) {
        it.todo(`${name} — lo cierra el ${closing}`);
    }
});
