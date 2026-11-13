/**
 * Port 1:1 de `api/tests/Integration/AuthServiceTest.php`.
 *
 * Portados (todo 13): register en tabla vacía y duplicado 409.
 * `testSixthRapidRegisterFromSameIpHitsRateLimit` -> tests/rate-limit.test.ts.
 * Login roundtrip queda para el todo 14.
 */
import type { FastifyInstance } from 'fastify';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { verifyPassword } from '../../src/auth/password.js';
import { loginUser, registerUser } from '../../src/auth/service.js';
import { loadConfig } from '../../src/config.js';
import { createTestPool, reloadTestSchema } from '../support/test-db.js';

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

describe('AuthServiceTest (PHP)', () => {
    it('testRegisterOnEmptyUsersTableCreatesPlainUser', async () => {
        const result = await registerUser(app, pool, loadConfig(), { username: 'qa_login_user', password: PASSWORD, ip: '203.0.113.10' });

        expect(result.ok).toBe(true);

        if (!result.ok) {
            return;
        }

        expect(result.status).toBe(200);
        expect(result.body).toMatchObject({ ok: true, username: 'qa_login_user', role: 'user' });
        expect(result.body.access).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);

        const [rows] = await pool.execute<RowDataPacket[]>('SELECT username, password, role FROM users WHERE username = ?', ['qa_login_user']);
        const row = rows[0];

        expect(row?.role).toBe('user');
        await expect(verifyPassword(PASSWORD, String(row?.password))).resolves.toBe(true);
    });

    it('testDuplicateUsernameReturns409WithSpanishMessage', async () => {
        const config = loadConfig();

        await registerUser(app, pool, config, { username: 'qa_login_user', password: PASSWORD, ip: '203.0.113.10' });
        const duplicate = await registerUser(app, pool, config, { username: 'qa_login_user', password: PASSWORD, ip: '203.0.113.10' });

        expect(duplicate.ok).toBe(false);
        expect(duplicate.status).toBe(409);

        if (!duplicate.ok) {
            expect(duplicate.body).toEqual({ ok: false, error: 'Ese usuario ya existe. Probá con otro.' });
        }
    });

    it('testLoginAfterRegistrationVerifiesPasswordRoundtrip', async () => {
        const config = loadConfig();

        await registerUser(app, pool, config, { username: 'qa_login_user', password: PASSWORD, ip: '203.0.113.10' });

        const login = await loginUser(app, pool, config, { username: 'qa_login_user', password: PASSWORD, ip: '203.0.113.10' });

        expect(login.ok).toBe(true);

        if (!login.ok) {
            return;
        }

        expect(login.status).toBe(200);
        expect(login.body).toMatchObject({ ok: true, username: 'qa_login_user', role: 'user' });
        expect(login.body.access).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);

        const bad = await loginUser(app, pool, config, { username: 'qa_login_user', password: 'Incorrecta1', ip: '203.0.113.10' });

        expect(bad.ok).toBe(false);

        if (!bad.ok) {
            expect(bad.status).toBe(401);
            expect(bad.body).toEqual({ ok: false, error: 'Usuario o contraseña incorrectos.' });
        }
    });
});
