/**
 * Tests del rate limiting portado (todo 11) contra `sabores_node_test`.
 *
 * Pinean los umbrales EXACTOS del PHP, el Retry-After, la purga de >1h,
 * el aislamiento por IP/acción, la normalización de username y que XFF se
 * ignore salvo TRUST_PROXY (default off).
 */
import type { FastifyInstance } from 'fastify';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { type AppConfig, loadConfig, parseConfig } from '../src/config.js';
import { checkLoginRateDetails, checkRefreshRateDetails, checkRegisterRateDetails, clientIp, RATE_LIMITS, rateLimitMessage, recordFailedLogin, recordFailedRefresh, recordRegisterAttempt } from '../src/rate-limit/attempts.js';
import { createTestPool, reloadTestSchema } from './support/test-db.js';

const config = loadConfig();

let pool: Pool;

beforeAll(async () => {
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

async function countAttempts(action?: string): Promise<number> {
    const [rows] = action === undefined ? await pool.execute<RowDataPacket[]>('SELECT COUNT(*) AS total FROM login_attempts') : await pool.execute<RowDataPacket[]>('SELECT COUNT(*) AS total FROM login_attempts WHERE action = ?', [action]);

    return Number(rows[0]?.total ?? 0);
}

async function countUsers(): Promise<number> {
    const [rows] = await pool.execute<RowDataPacket[]>('SELECT COUNT(*) AS total FROM users');

    return Number(rows[0]?.total ?? 0);
}

describe('umbrales exactos (Auth.php)', () => {
    it('login: 10 intentos / 5 min; el chequeo posterior al 10º bloquea con Retry-After', async () => {
        const ip = '203.0.113.10';

        for (let i = 0; i < 9; i += 1) {
            await recordFailedLogin(pool, ip, 'tester');
        }

        expect(await checkLoginRateDetails(pool, ip)).toEqual({ allowed: true, retryAfter: 0 });

        await recordFailedLogin(pool, ip, 'tester');

        const blocked = await checkLoginRateDetails(pool, ip);

        expect(blocked.allowed).toBe(false);
        expect(blocked.retryAfter).toBeGreaterThan(0);
        expect(blocked.retryAfter).toBeLessThanOrEqual(300);
        expect(RATE_LIMITS.login).toMatchObject({ maxAttempts: 10, windowMinutes: 5 });
        expect(rateLimitMessage('login')).toBe('Demasiados intentos. Esperá unos minutos.');
    });

    it('register: 5 intentos / 15 min; el chequeo posterior al 5º bloquea', async () => {
        const ip = '203.0.113.20';

        for (let i = 0; i < 4; i += 1) {
            await recordRegisterAttempt(pool, ip, `user_${i}`);
        }

        expect(await checkRegisterRateDetails(pool, ip)).toEqual({ allowed: true, retryAfter: 0 });

        await recordRegisterAttempt(pool, ip, 'user_4');

        const blocked = await checkRegisterRateDetails(pool, ip);

        expect(blocked.allowed).toBe(false);
        expect(blocked.retryAfter).toBeGreaterThan(0);
        expect(blocked.retryAfter).toBeLessThanOrEqual(900);
        expect(RATE_LIMITS.register).toMatchObject({ maxAttempts: 5, windowMinutes: 15 });
        expect(rateLimitMessage('register')).toBe('Demasiados registros desde esta conexión. Esperá unos minutos.');
    });

    it('refresh: 10 intentos / 5 min; el chequeo posterior al 10º bloquea', async () => {
        const ip = '203.0.113.30';

        for (let i = 0; i < 9; i += 1) {
            await recordFailedRefresh(pool, ip);
        }

        expect(await checkRefreshRateDetails(pool, ip)).toEqual({ allowed: true, retryAfter: 0 });

        await recordFailedRefresh(pool, ip);

        const blocked = await checkRefreshRateDetails(pool, ip);

        expect(blocked.allowed).toBe(false);
        expect(blocked.retryAfter).toBeGreaterThan(0);
        expect(blocked.retryAfter).toBeLessThanOrEqual(300);
        expect(RATE_LIMITS.refresh).toMatchObject({ maxAttempts: 10, windowMinutes: 5 });
    });

    it('Retry-After usa el intento MÁS VIEJO de la ventana', async () => {
        const ip = '203.0.113.40';

        for (let i = 0; i < 10; i += 1) {
            await recordFailedLogin(pool, ip, 'tester');
        }

        // Todos los intentos "envejecen" 290s: al más viejo le quedan ~10s.
        await pool.execute('UPDATE login_attempts SET attempted_at = DATE_SUB(NOW(), INTERVAL 290 SECOND) WHERE ip = ?', [ip]);

        const blocked = await checkLoginRateDetails(pool, ip);

        expect(blocked.allowed).toBe(false);
        expect(blocked.retryAfter).toBeGreaterThan(0);
        expect(blocked.retryAfter).toBeLessThanOrEqual(60);
    });
});

describe('aislamiento y purga', () => {
    it('las acciones no comparten cuota', async () => {
        const ip = '203.0.113.50';

        for (let i = 0; i < 10; i += 1) {
            await recordFailedLogin(pool, ip, 'tester');
        }

        expect((await checkLoginRateDetails(pool, ip)).allowed).toBe(false);
        expect((await checkRegisterRateDetails(pool, ip)).allowed).toBe(true);
        expect((await checkRefreshRateDetails(pool, ip)).allowed).toBe(true);
    });

    it('las IPs no comparten cuota', async () => {
        const blockedIp = '203.0.113.60';
        const otherIp = '203.0.113.61';

        for (let i = 0; i < 10; i += 1) {
            await recordFailedLogin(pool, blockedIp, 'tester');
        }

        expect((await checkLoginRateDetails(pool, blockedIp)).allowed).toBe(false);
        expect((await checkLoginRateDetails(pool, otherIp)).allowed).toBe(true);
    });

    it('purga los intentos de más de 1 hora en cada chequeo', async () => {
        const ip = '203.0.113.70';

        for (let i = 0; i < 10; i += 1) {
            await recordFailedLogin(pool, ip, 'tester');
        }

        await pool.execute('UPDATE login_attempts SET attempted_at = DATE_SUB(NOW(), INTERVAL 2 HOUR) WHERE ip = ?', [ip]);

        expect(await countAttempts('login')).toBe(10);
        expect((await checkLoginRateDetails(pool, ip)).allowed).toBe(true);
        expect(await countAttempts()).toBe(0);
    });

    it('normaliza username con trim + 30 caracteres (mb_substr)', async () => {
        await recordFailedLogin(pool, '203.0.113.80', `  ${'á'.repeat(40)}  `);

        const [rows] = await pool.execute<RowDataPacket[]>('SELECT username, CHAR_LENGTH(username) AS chars FROM login_attempts LIMIT 1');

        expect(rows[0]?.username).toBe('á'.repeat(30));
        expect(Number(rows[0]?.chars)).toBe(30);
    });
});

describe('IP del cliente y X-Forwarded-For', () => {
    it('sin TRUST_PROXY ignora XFF y usa socket.remoteAddress (::1 -> 127.0.0.1)', () => {
        expect(clientIp({ ip: '198.51.100.7', socket: { remoteAddress: '127.0.0.1' } }, false)).toBe('127.0.0.1');
        expect(clientIp({ ip: '198.51.100.7', socket: { remoteAddress: '::1' } }, false)).toBe('127.0.0.1');
        expect(clientIp({ ip: '198.51.100.7', socket: {} }, false)).toBe('cli');
    });

    it('con TRUST_PROXY usa request.ip (Fastify ya validó el proxy)', () => {
        expect(clientIp({ ip: '198.51.100.7', socket: { remoteAddress: '127.0.0.1' } }, '127.0.0.1')).toBe('198.51.100.7');
    });

    it('Fastify: XFF ignorado por default y honrado con TRUST_PROXY', async () => {
        const baseEnv: Record<string, string> = {
            DB_HOST: '127.0.0.1',
            DB_NAME: 'sabores_test',
            DB_USER: 'root',
            JWT_SECRET: 's'.repeat(64),
            BASE_PATH: '/sabores-latinoamerica/api'
        };
        const apps: FastifyInstance[] = [];

        const makeApp = (trustProxy: string): FastifyInstance => {
            const appConfig: AppConfig = parseConfig({ ...baseEnv, TRUST_PROXY: trustProxy });
            const app = createApp({ config: appConfig, db: { query: async () => 1 } });

            app.get('/__ip', async request => ({ ip: request.ip, client: clientIp(request, appConfig.trustProxy) }));
            apps.push(app);

            return app;
        };

        try {
            const untrusted = await makeApp('0').inject({ method: 'GET', url: '/__ip', headers: { 'x-forwarded-for': '198.51.100.9' } });
            expect(untrusted.json()).toEqual({ ip: '127.0.0.1', client: '127.0.0.1' });

            const trusted = await makeApp('127.0.0.1').inject({ method: 'GET', url: '/__ip', headers: { 'x-forwarded-for': '198.51.100.9' } });
            expect(trusted.json()).toEqual({ ip: '198.51.100.9', client: '198.51.100.9' });
        } finally {
            await Promise.all(apps.map(async app => app.close()));
        }
    });
});

describe('cuota de register ANTES del INSERT (orden del servicio)', () => {
    it('el 6º register simulado devuelve 429 y no deja usuarios huérfanos', async () => {
        const ip = '203.0.113.90';

        // Simula el orden de AuthService::register: check -> record -> INSERT.
        const registerLikeService = async (username: string): Promise<number> => {
            const rate = await checkRegisterRateDetails(pool, ip);

            if (!rate.allowed) {
                return 429;
            }

            await recordRegisterAttempt(pool, ip, username);
            await pool.execute('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username, 'x', 'user']);

            return 200;
        };

        const statuses: number[] = [];

        for (let i = 1; i <= 6; i += 1) {
            statuses.push(await registerLikeService(`rl_${i}`));
        }

        expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
        expect(await countUsers()).toBe(5);
        expect(await countAttempts('register')).toBe(5);
    });
});
