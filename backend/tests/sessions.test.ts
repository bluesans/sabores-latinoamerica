/**
 * Tests de integración del repositorio de sesiones (todo 10) sobre la DB
 * scratch `sabores_node_test` (nunca la viva).
 *
 * Cubre: creación (hash, TTL, ip, user_agent), rotación con tombstone,
 * reuse detection (borra TODAS las sesiones del usuario), expiradas con
 * purga, logout idempotente, purga global en refresh y la carrera de doble
 * refresh (exactamente uno gana; el perdedor borra todo).
 */
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashRefreshToken } from '../src/auth/refresh-token.js';
import { loadConfig } from '../src/config.js';
import { createSession, isExpiredSession, logoutSession, rotateRefreshToken } from '../src/sessions/repository.js';
import { createTestPool, reloadTestSchema } from './support/test-db.js';

const config = loadConfig();
const SESSION_DAYS = 7;
const USERNAME = 'sess10_user';

let pool: Pool;

beforeAll(async () => {
    await reloadTestSchema(config);
    pool = createTestPool(config);
}, 60000);

afterAll(async () => {
    await pool.end();
});

beforeEach(async () => {
    await pool.query('DELETE FROM sessions');
    await pool.query('DELETE FROM users');
});

async function insertUser(username: string = USERNAME): Promise<number> {
    const [result] = await pool.execute<ResultSetHeader>('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username, 'x', 'user']);

    return result.insertId;
}

async function sessionCount(userId: number): Promise<number> {
    const [rows] = await pool.execute<RowDataPacket[]>('SELECT COUNT(*) AS total FROM sessions WHERE user_id = ?', [userId]);

    return Number(rows[0]?.total ?? 0);
}

type StoredSession = RowDataPacket & {
    token: string;
    revoked_at: string | null;
    expires_at: string;
    ip: string | null;
    user_agent: string | null;
};

async function storedSessions(userId: number): Promise<StoredSession[]> {
    const [rows] = await pool.execute<StoredSession[]>('SELECT token, revoked_at, expires_at, ip, user_agent FROM sessions WHERE user_id = ? ORDER BY id', [userId]);

    return rows;
}

describe('isExpiredSession', () => {
    it('replica strtotime(...) <= time() con el clock de la app, no el de la DB', () => {
        const now = Date.parse('2026-11-13T12:00:00');

        expect(isExpiredSession('2026-11-13 12:00:00', now)).toBe(true);
        expect(isExpiredSession('2026-11-13 12:00:00', now - 1)).toBe(false);
        expect(isExpiredSession('2026-11-13 12:00:01', now)).toBe(false);
        expect(isExpiredSession('no-es-una-fecha', now)).toBe(true);
    });
});

describe('createSession', () => {
    it('guarda el hash sha256 (no el token crudo), el TTL y los metadatos', async () => {
        const userId = await insertUser();
        const rawToken = await createSession(pool, { userId, sessionDays: SESSION_DAYS, ip: '127.0.0.1', userAgent: 'vitest-agent' });

        expect(rawToken).toMatch(/^[0-9a-f]{64}$/);

        const rows = await storedSessions(userId);

        expect(rows).toHaveLength(1);
        expect(rows[0]?.token).toBe(hashRefreshToken(rawToken));
        expect(rows[0]?.token).not.toBe(rawToken);
        expect(rows[0]?.revoked_at).toBeNull();
        expect(rows[0]?.ip).toBe('127.0.0.1');
        expect(rows[0]?.user_agent).toBe('vitest-agent');

        const [ttlRows] = await pool.execute<RowDataPacket[]>('SELECT TIMESTAMPDIFF(SECOND, NOW(), expires_at) AS ttl FROM sessions WHERE user_id = ?', [userId]);
        const ttl = Number(ttlRows[0]?.ttl ?? 0);

        expect(ttl).toBeGreaterThan(SESSION_DAYS * 86400 - 10);
        expect(ttl).toBeLessThanOrEqual(SESSION_DAYS * 86400);
    });

    it('trunca user_agent a 255 CARACTERES (mb_substr), no a 255 bytes', async () => {
        const userId = await insertUser();
        await createSession(pool, { userId, sessionDays: SESSION_DAYS, userAgent: 'á'.repeat(300) });

        const [rows] = await pool.execute<RowDataPacket[]>('SELECT CHAR_LENGTH(user_agent) AS chars, LENGTH(user_agent) AS bytes FROM sessions WHERE user_id = ?', [userId]);

        expect(Number(rows[0]?.chars)).toBe(255);
        expect(Number(rows[0]?.bytes)).toBe(510);
    });

    it('rechaza SESSION_DAYS no positivo antes de tocar la DB', async () => {
        const userId = await insertUser();

        await expect(createSession(pool, { userId, sessionDays: 0 })).rejects.toThrow('SESSION_DAYS');
        await expect(createSession(pool, { userId, sessionDays: 1.5 })).rejects.toThrow('SESSION_DAYS');
        await expect(createSession(pool, { userId, sessionDays: 1e21 })).rejects.toThrow('SESSION_DAYS');
        expect(await sessionCount(userId)).toBe(0);
    });
});

describe('rotateRefreshToken', () => {
    it('rota el token: tombstone de la vieja sesión + sesión nueva viva', async () => {
        const userId = await insertUser();
        const oldToken = await createSession(pool, { userId, sessionDays: SESSION_DAYS, ip: '127.0.0.1' });

        const result = await rotateRefreshToken(pool, oldToken, { sessionDays: SESSION_DAYS, ip: '10.0.0.1', userAgent: 'rotated' });

        expect(result.ok).toBe(true);

        if (!result.ok) {
            return;
        }

        expect(result.refreshToken).toMatch(/^[0-9a-f]{64}$/);
        expect(result.refreshToken).not.toBe(oldToken);
        expect(result.user).toEqual({ id: userId, username: USERNAME, role: 'user' });

        const rows = await storedSessions(userId);

        expect(rows).toHaveLength(2);
        expect(rows[0]?.token).toBe(hashRefreshToken(oldToken));
        expect(rows[0]?.revoked_at).not.toBeNull();
        expect(rows[1]?.token).toBe(hashRefreshToken(result.refreshToken));
        expect(rows[1]?.revoked_at).toBeNull();
        expect(rows[1]?.ip).toBe('10.0.0.1');
        expect(rows[1]?.user_agent).toBe('rotated');
    });

    it('reuse detection: replay del token rotado borra TODAS las sesiones del usuario', async () => {
        const userId = await insertUser();
        const oldToken = await createSession(pool, { userId, sessionDays: SESSION_DAYS });

        const first = await rotateRefreshToken(pool, oldToken, { sessionDays: SESSION_DAYS });
        expect(first.ok).toBe(true);

        const replay = await rotateRefreshToken(pool, oldToken, { sessionDays: SESSION_DAYS });

        expect(replay.ok).toBe(false);
        expect(await sessionCount(userId)).toBe(0);
    });

    it('token desconocido: rechaza sin efectos colaterales', async () => {
        const userId = await insertUser();
        await createSession(pool, { userId, sessionDays: SESSION_DAYS });

        const result = await rotateRefreshToken(pool, 'de'.repeat(32), { sessionDays: SESSION_DAYS });

        expect(result.ok).toBe(false);
        expect(await sessionCount(userId)).toBe(1);
    });

    it('token vacío: rechaza sin abrir transacción ni tocar filas', async () => {
        const userId = await insertUser();
        await createSession(pool, { userId, sessionDays: SESSION_DAYS });

        expect((await rotateRefreshToken(pool, '', { sessionDays: SESSION_DAYS })).ok).toBe(false);
        expect(await sessionCount(userId)).toBe(1);
    });

    it('sesión expirada: rechaza y el rollback revierte la purga, como el PHP', async () => {
        const userId = await insertUser();
        const token = await createSession(pool, { userId, sessionDays: SESSION_DAYS });

        await pool.execute('UPDATE sessions SET expires_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE user_id = ?', [userId]);

        const result = await rotateRefreshToken(pool, token, { sessionDays: SESSION_DAYS });

        expect(result.ok).toBe(false);
        // Quirk REAL del v1: purge + SELECT + rollback deshace el DELETE de la
        // fila expirada. La purga efectiva se commitea en un refresh exitoso
        // (ver el test de "OTROS usuarios").
        expect(await sessionCount(userId)).toBe(1);
    });

    it('purga expiradas de OTROS usuarios en cada refresh, como el PHP', async () => {
        const expiredUser = await insertUser('sess10_expired');
        const activeUser = await insertUser('sess10_active');
        await createSession(pool, { userId: expiredUser, sessionDays: SESSION_DAYS });
        await pool.execute('UPDATE sessions SET expires_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE user_id = ?', [expiredUser]);

        const activeToken = await createSession(pool, { userId: activeUser, sessionDays: SESSION_DAYS });
        const result = await rotateRefreshToken(pool, activeToken, { sessionDays: SESSION_DAYS });

        expect(result.ok).toBe(true);
        expect(await sessionCount(expiredUser)).toBe(0);
        expect(await sessionCount(activeUser)).toBe(2);
    });

    it('carrera de doble refresh: exactamente uno gana y el perdedor borra todo', async () => {
        const userId = await insertUser();
        const token = await createSession(pool, { userId, sessionDays: SESSION_DAYS });

        const [first, second] = await Promise.all([rotateRefreshToken(pool, token, { sessionDays: SESSION_DAYS }), rotateRefreshToken(pool, token, { sessionDays: SESSION_DAYS })]);

        expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
        expect([first.ok, second.ok].filter(value => !value)).toHaveLength(1);
        // El perdedor ve el tombstone y borra la sesión nueva del ganador.
        expect(await sessionCount(userId)).toBe(0);
    }, 30000);
});

describe('logoutSession', () => {
    it('revoca la sesión actual y deja el tombstone', async () => {
        const userId = await insertUser();
        const token = await createSession(pool, { userId, sessionDays: SESSION_DAYS });

        await logoutSession(pool, token);

        const rows = await storedSessions(userId);

        expect(rows).toHaveLength(1);
        expect(rows[0]?.revoked_at).not.toBeNull();
    });

    it('es idempotente y no falla con token vacío o desconocido', async () => {
        const userId = await insertUser();
        const token = await createSession(pool, { userId, sessionDays: SESSION_DAYS });

        await logoutSession(pool, token);
        await expect(logoutSession(pool, token)).resolves.toBeUndefined();
        await expect(logoutSession(pool, '')).resolves.toBeUndefined();
        await expect(logoutSession(pool, 'de'.repeat(32))).resolves.toBeUndefined();
        expect(await sessionCount(userId)).toBe(1);
    });

    it('un refresh posterior a logout dispara reuse detection (borra todo)', async () => {
        const userId = await insertUser();
        const token = await createSession(pool, { userId, sessionDays: SESSION_DAYS });

        await logoutSession(pool, token);

        expect((await rotateRefreshToken(pool, token, { sessionDays: SESSION_DAYS })).ok).toBe(false);
        expect(await sessionCount(userId)).toBe(0);
    });
});
