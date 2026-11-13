/**
 * Port 1:1 de `api/tests/Unit/JwtTest.php`.
 *
 * Casos cubiertos por el núcleo del todo 9. Se agregan los bordes de reloj
 * que exige el todo 12: ±5s válidos y ±15s inválidos.
 */
import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { decodeAccessToken, issueAccessToken } from '../../src/auth/jwt.js';
import { type AppConfig, parseConfig } from '../../src/config.js';

const SECRET = 's'.repeat(64);
const PLACEHOLDER = 'cambiame_por_una_clave_larga_y_aleatoria';
const BASE_ENV: Record<string, string> = {
    DB_HOST: '127.0.0.1',
    DB_NAME: 'sabores_test',
    DB_USER: 'root',
    JWT_SECRET: SECRET,
    BASE_PATH: '/sabores-latinoamerica/api'
};

const apps: FastifyInstance[] = [];

function configWith(overrides: Record<string, string> = {}): AppConfig {
    return parseConfig({ ...BASE_ENV, ...overrides });
}

async function makeApp(config: AppConfig = configWith()): Promise<FastifyInstance> {
    const app = createApp({ config, db: { query: async () => 1 } });
    apps.push(app);
    await app.ready();

    return app;
}

afterEach(async () => {
    await Promise.all(apps.splice(0).map(async app => app.close()));
});

const b64u = (value: string): string => Buffer.from(value).toString('base64url');

function craftToken(payload: Record<string, unknown>, header: Record<string, unknown> = { alg: 'HS256', typ: 'JWT' }, secret: string = SECRET): string {
    const encodedHeader = b64u(JSON.stringify(header));
    const encodedPayload = b64u(JSON.stringify(payload));
    const signature = createHmac('sha256', secret).update(`${encodedHeader}.${encodedPayload}`).digest('base64url');

    return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function nowSeconds(): number {
    return Math.floor(Date.now() / 1000);
}

describe('JwtTest (PHP)', () => {
    it('testIssueAccessAndDecode', async () => {
        const app = await makeApp();
        const token = issueAccessToken(app, { id: 7, username: 'tester', role: 'admin' }, 900);
        const claims = decodeAccessToken(app, token);

        expect(claims).toMatchObject({ sub: 7, name: 'tester', role: 'admin', token_type: 'access' });
    });

    it('testExpiredTokenIsRejected', async () => {
        const app = await makeApp();
        const now = nowSeconds();
        const token = craftToken({ sub: 1, name: 'tester', role: 'user', token_type: 'access', iat: now - 1000, exp: now - 100 });

        expect(decodeAccessToken(app, token)).toBeNull();
    });

    it('testInvalidSignatureIsRejected', async () => {
        const app = await makeApp();
        const token = issueAccessToken(app, { id: 7, username: 'tester', role: 'user' }, 900);
        const [header, payload, signature] = token.split('.');
        // El PRIMER char, no el último: el último puede diferir solo en padding.
        const flipped = `${signature?.[0] === 'A' ? 'B' : 'A'}${signature?.slice(1)}`;

        expect(decodeAccessToken(app, `${header}.${payload}.${flipped}`)).toBeNull();
    });

    it('testNonAccessTokenIsRejected', async () => {
        const app = await makeApp();
        const now = nowSeconds();
        const token = craftToken({ sub: 1, name: 'tester', role: 'user', token_type: 'refresh', iat: now, exp: now + 300 });

        expect(decodeAccessToken(app, token)).toBeNull();
    });

    it('testFutureIatBeyondLeewayIsRejected', async () => {
        const app = await makeApp();
        const now = nowSeconds();
        const token = craftToken({ sub: 1, name: 'tester', role: 'user', token_type: 'access', iat: now + 60, exp: now + 900 });

        expect(decodeAccessToken(app, token)).toBeNull();
    });

    it('testAlgNoneHeaderIsRejected', async () => {
        const app = await makeApp();
        const now = nowSeconds();
        const token = craftToken({ sub: 1, name: 'tester', role: 'user', token_type: 'access', iat: now, exp: now + 300 }, { alg: 'none', typ: 'JWT' });

        expect(decodeAccessToken(app, token)).toBeNull();
    });

    it('testTamperedPayloadIsRejected', async () => {
        const app = await makeApp();
        const token = issueAccessToken(app, { id: 7, username: 'tester', role: 'user' }, 900);
        const [header, payload, signature] = token.split('.');
        const flipped = `${payload?.[0] === 'A' ? 'B' : 'A'}${payload?.slice(1)}`;

        expect(decodeAccessToken(app, `${header}.${flipped}.${signature}`)).toBeNull();
    });

    it('testPlaceholderSecretIsRejected', () => {
        expect(() => configWith({ JWT_SECRET: PLACEHOLDER })).toThrow(/JWT_SECRET/);
    });

    it('bordes de reloj: ±5s válidos, ±15s inválidos', async () => {
        const app = await makeApp();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-11-13T12:00:00.000Z'));

        try {
            const now = Math.floor(Date.now() / 1000);
            const base = { sub: 1, name: 'tester', role: 'user', token_type: 'access' };

            expect(decodeAccessToken(app, craftToken({ ...base, iat: now - 900, exp: now - 5 }))).not.toBeNull();
            expect(decodeAccessToken(app, craftToken({ ...base, iat: now - 900, exp: now - 15 }))).toBeNull();
            expect(decodeAccessToken(app, craftToken({ ...base, iat: now + 5, exp: now + 900 }))).not.toBeNull();
            expect(decodeAccessToken(app, craftToken({ ...base, iat: now + 15, exp: now + 900 }))).toBeNull();
        } finally {
            vi.useRealTimers();
        }
    });
});
