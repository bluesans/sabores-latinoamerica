/**
 * Gate del todo 9: núcleo de auth en paridad con el v1 PHP.
 *
 * Cubre JWT (claims, exp/iat y leeway, token_type, alg y firma), cookies de
 * refresh (atributos por escenario http/https), hashing bcrypt y el
 * cross-check BIDIRECCIONAL real contra `legacy/php-api/` (PHP CLI):
 * - token PHP -> valida en Node; token Node -> valida en PHP;
 * - hash `$2y$` de PHP -> verifica en Node; hash `$2b$` de Node -> verifica en PHP;
 * - passwords multibyte en ambos sentidos.
 *
 * El cross-check se saltea solo si no hay `php`, `legacy/php-api/vendor` o `legacy/php-api/.env`
 * (p. ej. CI del backend antes del todo 25); localmente es un gate bloqueante.
 */
import { spawnSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse as parseDotenv } from 'dotenv';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { COOKIE_CLEAR_EXPIRES, clearedRefreshCookie, cookieSecureForRequest, REFRESH_COOKIE_NAME, refreshCookie, requestIsHttps } from '../src/auth/cookies.js';
import { ACCESS_TOKEN_TYPE, decodeAccessToken, issueAccessToken, JWT_LEEWAY_SECONDS } from '../src/auth/jwt.js';
import { hashPassword, PHP_BCRYPT_COST, passwordNeedsRehash, verifyPassword } from '../src/auth/password.js';
import { createRefreshToken, hashRefreshToken } from '../src/auth/refresh-token.js';
import { type AppConfig, loadConfig, parseConfig } from '../src/config.js';

const SECRET = 's'.repeat(64);
const MULTIBYTE_PASSWORD = 'contraseña-ñandú-日本語-🔐';

const BASE_ENV: Record<string, string> = {
    DB_HOST: '127.0.0.1',
    DB_NAME: 'sabores_test',
    DB_USER: 'root',
    JWT_SECRET: SECRET,
    BASE_PATH: '/sabores-latinoamerica/api',
    APP_DEBUG: '0',
    CORS_ORIGIN: ''
};

const apps: FastifyInstance[] = [];

function configWith(overrides: Record<string, string> = {}): AppConfig {
    return parseConfig({ ...BASE_ENV, ...overrides });
}

async function makeApp(config: AppConfig = configWith()): Promise<FastifyInstance> {
    const app = createApp({ config, db: { query: async () => [[{ '1': 1 }], []] } });
    apps.push(app);
    await app.ready();

    return app;
}

afterEach(async () => {
    await Promise.all(apps.splice(0).map(async app => app.close()));
});

const b64u = (value: string): string => Buffer.from(value).toString('base64url');

/** Arma un JWT HS256 a mano (para casos que el signer válido no permite). */
function craftToken(payload: Record<string, unknown>, secret: string = SECRET, header: Record<string, unknown> = { alg: 'HS256', typ: 'JWT' }): string {
    const encodedHeader = b64u(JSON.stringify(header));
    const encodedPayload = b64u(JSON.stringify(payload));
    const signature = createHmac('sha256', secret).update(`${encodedHeader}.${encodedPayload}`).digest('base64url');

    return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function nowSeconds(): number {
    return Math.floor(Date.now() / 1000);
}

describe('JWT (paridad Jwt.php)', () => {
    it('emite los claims exactos y el TTL de JWT_TTL', async () => {
        const app = await makeApp();

        const token = issueAccessToken(app, { id: 7, username: 'tester', role: 'admin' }, 900);
        const claims = decodeAccessToken(app, token);

        expect(claims).not.toBeNull();
        expect(claims).toMatchObject({ sub: 7, name: 'tester', role: 'admin', token_type: ACCESS_TOKEN_TYPE });
        expect(claims?.exp).toBe((claims?.iat ?? 0) + 900);
        expect(Math.abs((claims?.iat ?? 0) - nowSeconds())).toBeLessThanOrEqual(1);
    });

    it('rechaza una firma alterada', async () => {
        const app = await makeApp();
        const token = issueAccessToken(app, { id: 7, username: 'tester', role: 'user' }, 900);
        const [header, payload, signature] = token.split('.');
        // Cambiar el PRIMER char (no el último): el último puede diferir solo en
        // bits de padding base64url y decodificar a los mismos bytes de firma.
        const flipped = `${signature?.[0] === 'A' ? 'B' : 'A'}${signature?.slice(1)}`;
        const tampered = `${header}.${payload}.${flipped}`;

        expect(decodeAccessToken(app, tampered)).toBeNull();
    });

    it('rechaza un payload alterado', async () => {
        const app = await makeApp();
        const token = issueAccessToken(app, { id: 7, username: 'tester', role: 'user' }, 900);
        const [header, payload, signature] = token.split('.');
        const flipped = `${payload?.[0] === 'A' ? 'B' : 'A'}${payload?.slice(1)}`;

        expect(decodeAccessToken(app, `${header}.${flipped}.${signature}`)).toBeNull();
    });

    it('rechaza expirado fuera del leeway (100s)', async () => {
        const app = await makeApp();
        const now = nowSeconds();
        const token = craftToken({ sub: 1, name: 'tester', role: 'user', token_type: 'access', iat: now - 1000, exp: now - 100 });

        expect(decodeAccessToken(app, token)).toBeNull();
    });

    it('acepta expirado dentro del leeway (5s), como el PHP', async () => {
        const app = await makeApp();
        const now = nowSeconds();
        const token = craftToken({ sub: 1, name: 'tester', role: 'user', token_type: 'access', iat: now - 900, exp: now - 5 });

        expect(decodeAccessToken(app, token)).not.toBeNull();
    });

    it('rechaza iat futuro más allá del leeway (60s)', async () => {
        const app = await makeApp();
        const now = nowSeconds();
        const token = craftToken({ sub: 1, name: 'tester', role: 'user', token_type: 'access', iat: now + 60, exp: now + 900 });

        expect(decodeAccessToken(app, token)).toBeNull();
    });

    it('acepta iat futuro dentro del leeway (5s), como el PHP', async () => {
        const app = await makeApp();
        const now = nowSeconds();
        const token = craftToken({ sub: 1, name: 'tester', role: 'user', token_type: 'access', iat: now + 5, exp: now + 900 });

        expect(decodeAccessToken(app, token)).not.toBeNull();
    });

    it('ignora nbf, como Jwt::decode', async () => {
        const app = await makeApp();
        const now = nowSeconds();
        // El issuer no emite nbf, pero el PHP tampoco lo valida: paridad.
        const token = craftToken({ sub: 1, name: 'tester', role: 'user', token_type: 'access', iat: now, exp: now + 900, nbf: now + 600 });

        expect(decodeAccessToken(app, token)).not.toBeNull();
    });

    it('bordes exactos del leeway: ±10s acepta y ±11s rechaza', async () => {
        const app = await makeApp();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-11-13T12:00:00.000Z'));

        try {
            const now = Math.floor(Date.now() / 1000);
            const base = { sub: 1, name: 'tester', role: 'user', token_type: 'access' };

            expect(decodeAccessToken(app, craftToken({ ...base, iat: now - 900, exp: now - 10 }))).not.toBeNull();
            expect(decodeAccessToken(app, craftToken({ ...base, iat: now - 900, exp: now - 11 }))).toBeNull();
            expect(decodeAccessToken(app, craftToken({ ...base, iat: now + 10, exp: now + 900 }))).not.toBeNull();
            expect(decodeAccessToken(app, craftToken({ ...base, iat: now + 11, exp: now + 900 }))).toBeNull();
        } finally {
            vi.useRealTimers();
        }
    });

    it('acepta iat/exp/sub numéricos como strings (is_numeric + (int) del PHP)', async () => {
        const app = await makeApp();
        const now = nowSeconds();
        const token = craftToken({ sub: '7', name: 'tester', role: 'user', token_type: 'access', iat: String(now), exp: String(now + 900) });
        const claims = decodeAccessToken(app, token);

        expect(claims).toMatchObject({ sub: 7, iat: now, exp: now + 900 });
    });

    it('rechaza iat no numérico', async () => {
        const app = await makeApp();
        const now = nowSeconds();
        const token = craftToken({ sub: 1, name: 'tester', role: 'user', token_type: 'access', iat: 'abc', exp: now + 900 });

        expect(decodeAccessToken(app, token)).toBeNull();
    });

    it('issueAccessToken rechaza TTL no positivo, como el PHP', async () => {
        const app = await makeApp();

        expect(() => issueAccessToken(app, { id: 1, username: 'tester', role: 'user' }, 0)).toThrow('JWT_TTL');
        expect(() => issueAccessToken(app, { id: 1, username: 'tester', role: 'user' }, -5)).toThrow('JWT_TTL');
    });

    it('rechaza token_type distinto de access', async () => {
        const app = await makeApp();
        const now = nowSeconds();
        const token = craftToken({ sub: 1, name: 'tester', role: 'user', token_type: 'refresh', iat: now, exp: now + 900 });

        expect(decodeAccessToken(app, token)).toBeNull();
    });

    it('token_type ausente equivale a access', async () => {
        const app = await makeApp();
        const now = nowSeconds();
        const token = craftToken({ sub: 1, name: 'tester', role: 'user', iat: now, exp: now + 900 });
        const claims = decodeAccessToken(app, token);

        expect(claims).toMatchObject({ sub: 1, name: 'tester', role: 'user', token_type: ACCESS_TOKEN_TYPE });
    });

    it('rechaza alg=none aunque la firma parezca válida', async () => {
        const app = await makeApp();
        const now = nowSeconds();
        const token = craftToken({ sub: 1, name: 'tester', role: 'user', token_type: 'access', iat: now, exp: now + 900 }, SECRET, { alg: 'none', typ: 'JWT' });

        expect(decodeAccessToken(app, token)).toBeNull();
    });

    it('rechaza un token sin iat', async () => {
        const app = await makeApp();
        const now = nowSeconds();
        const token = craftToken({ sub: 1, name: 'tester', role: 'user', token_type: 'access', exp: now + 900 });

        expect(decodeAccessToken(app, token)).toBeNull();
    });

    it('rechaza un token firmado con otro secreto', async () => {
        const app = await makeApp();
        const now = nowSeconds();
        const token = craftToken({ sub: 1, name: 'tester', role: 'user', token_type: 'access', iat: now, exp: now + 900 }, 'x'.repeat(64));

        expect(decodeAccessToken(app, token)).toBeNull();
    });

    it('rechaza un token malformado', async () => {
        const app = await makeApp();

        expect(decodeAccessToken(app, 'no-es-un-jwt')).toBeNull();
        expect(decodeAccessToken(app, '')).toBeNull();
    });

    it('expone el leeway de 10s del v1', () => {
        expect(JWT_LEEWAY_SECONDS).toBe(10);
    });
});

describe('hashing bcrypt (paridad password_hash)', () => {
    it('genera $2b$12$ y verifica su propio hash', async () => {
        const hash = await hashPassword('S3gura!Pass2026');

        expect(hash).toMatch(/^\$2b\$12\$/);
        await expect(verifyPassword('S3gura!Pass2026', hash)).resolves.toBe(true);
        await expect(verifyPassword('S3gura!Pass2026x', hash)).resolves.toBe(false);
    });

    it('verifica un hash $2y$12$ generado por PHP', async () => {
        // password_hash('prueba', PASSWORD_DEFAULT) en el PHP 8.4 de XAMPP.
        const phpHash = '$2y$12$w8FEZ20D/tUFPd/m93t4fOHK7Efkg3h7WU03Dr/d5ywPDbEFJY7BK';

        await expect(verifyPassword('prueba', phpHash)).resolves.toBe(true);
        await expect(verifyPassword('otra', phpHash)).resolves.toBe(false);
    });

    it('no verifica contra un hash inválido en vez de lanzar', async () => {
        await expect(verifyPassword('x', 'no-es-bcrypt')).resolves.toBe(false);
    });

    it('passwordNeedsRehash replica el default PHP (costo 12)', () => {
        const validHash = (cost: number, prefix = '$2y$'): string => `${prefix}${cost}$` + 'a'.repeat(53);

        expect(PHP_BCRYPT_COST).toBe(12);
        expect(passwordNeedsRehash(validHash(12))).toBe(false);
        expect(passwordNeedsRehash(validHash(12, '$2b$'))).toBe(false);
        expect(passwordNeedsRehash(validHash(12, '$2a$'))).toBe(false);
        expect(passwordNeedsRehash(validHash(10))).toBe(true);
        expect(passwordNeedsRehash('$argon2id$v=19$m=65536,t=4,p=1$abc')).toBe(true);
        expect(passwordNeedsRehash('basura')).toBe(true);
        // Truncado: PHP password_needs_rehash() devuelve true.
        expect(passwordNeedsRehash('$2y$12$abc')).toBe(true);
    });
});

describe('refresh token (paridad Auth.php)', () => {
    it('genera 64 hex y cada token es distinto', () => {
        const first = createRefreshToken();
        const second = createRefreshToken();

        expect(first).toMatch(/^[0-9a-f]{64}$/);
        expect(second).toMatch(/^[0-9a-f]{64}$/);
        expect(first).not.toBe(second);
    });

    it('hashea con sha256 hex, igual que hash("sha256", $token)', () => {
        expect(hashRefreshToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
        expect(hashRefreshToken('abc')).toMatch(/^[0-9a-f]{64}$/);
    });
});

describe('cookie de refresh (paridad Cookies.php)', () => {
    const token = 'a'.repeat(64);
    const httpRequest: Pick<FastifyRequest, 'protocol' | 'headers'> = { protocol: 'http', headers: {} };
    const httpsRequest: Pick<FastifyRequest, 'protocol' | 'headers'> = { protocol: 'https', headers: {} };

    it('emite el Set-Cookie exacto en HTTP', () => {
        expect(refreshCookie(configWith(), token, false)).toBe(`${REFRESH_COOKIE_NAME}=${token}; Path=/sabores-latinoamerica/api; Max-Age=604800; HttpOnly; SameSite=Strict`);
    });

    it('agrega Secure en HTTPS', () => {
        expect(refreshCookie(configWith(), token, true)).toBe(`${REFRESH_COOKIE_NAME}=${token}; Path=/sabores-latinoamerica/api; Max-Age=604800; HttpOnly; SameSite=Strict; Secure`);
    });

    it('el borrado usa Max-Age=0, Expires epoch y respeta Secure', () => {
        expect(clearedRefreshCookie(configWith(), false)).toBe(`${REFRESH_COOKIE_NAME}=; Path=/sabores-latinoamerica/api; Max-Age=0; HttpOnly; SameSite=Strict; Expires=${COOKIE_CLEAR_EXPIRES}`);
        expect(clearedRefreshCookie(configWith(), true)).toBe(`${REFRESH_COOKIE_NAME}=; Path=/sabores-latinoamerica/api; Max-Age=0; HttpOnly; SameSite=Strict; Expires=${COOKIE_CLEAR_EXPIRES}; Secure`);
    });

    it('respeta COOKIE_PATH y SESSION_DAYS custom', () => {
        const cookie = refreshCookie(configWith({ COOKIE_PATH: '/otro-path', SESSION_DAYS: '14' }), token, false);

        expect(cookie).toContain('Path=/otro-path');
        expect(cookie).toContain('Max-Age=1209600');
    });

    it('COOKIE_SECURE=auto decide por HTTPS directo o X-Forwarded-Proto', () => {
        const config = configWith({ COOKIE_SECURE: 'auto' });

        expect(cookieSecureForRequest(config, httpRequest)).toBe(false);
        expect(cookieSecureForRequest(config, httpsRequest)).toBe(true);
        expect(requestIsHttps({ protocol: 'http', headers: { 'x-forwarded-proto': 'https' } })).toBe(true);
        expect(requestIsHttps({ protocol: 'http', headers: { 'x-forwarded-proto': 'HTTPS' } })).toBe(true);
        expect(requestIsHttps({ protocol: 'http', headers: { 'x-forwarded-proto': 'http' } })).toBe(false);
    });

    it("COOKIE_SECURE '1'/'0' fuerzan el flag", () => {
        expect(cookieSecureForRequest(configWith({ COOKIE_SECURE: '1' }), httpRequest)).toBe(true);
        expect(cookieSecureForRequest(configWith({ COOKIE_SECURE: '0' }), httpsRequest)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Cross-check real PHP<->Node
// ---------------------------------------------------------------------------

const PHP_BIN = process.env.PHP_BIN ?? 'php';
const BRIDGE_PATH = fileURLToPath(new URL('./fixtures/php-verify-token.php', import.meta.url));
const API_ENV_PATH = fileURLToPath(new URL('../../legacy/php-api/.env', import.meta.url));
const BACKEND_ENV_PATH = fileURLToPath(new URL('../.env', import.meta.url));

const phpProbe = spawnSync(PHP_BIN, ['-v'], { encoding: 'utf8', windowsHide: true });
const bridgeAvailable = phpProbe.error === undefined && phpProbe.status === 0 && existsSync(BRIDGE_PATH) && existsSync(API_ENV_PATH) && existsSync(BACKEND_ENV_PATH);

type PhpBridgeResponse = { ok: boolean; result?: unknown; error?: string };

function callPhp(payload: Record<string, unknown>): PhpBridgeResponse {
    const result = spawnSync(PHP_BIN, [BRIDGE_PATH], {
        input: JSON.stringify(payload),
        encoding: 'utf8',
        windowsHide: true
    });

    if (result.error !== undefined) {
        throw result.error;
    }

    if (result.status !== 0) {
        throw new Error(`php exit ${result.status}: ${result.stderr}`);
    }

    return JSON.parse(result.stdout) as PhpBridgeResponse;
}

describe.skipIf(!bridgeAvailable)('cross-check PHP<->Node', () => {
    it('backend/.env reusa el JWT_SECRET de legacy/php-api/.env', () => {
        const config = loadConfig();
        const apiEnv = parseDotenv(readFileSync(API_ENV_PATH));

        expect(config.jwtSecret).toBe(apiEnv['JWT_SECRET']);
    });

    it('token emitido por PHP valida en Node con los claims exactos', async () => {
        const app = await makeApp(loadConfig());
        const issued = callPhp({ action: 'issue-token', user: { id: 7, username: 'tester', role: 'admin' } });

        expect(issued.ok).toBe(true);

        const claims = decodeAccessToken(app, String(issued.result));
        const ttl = loadConfig().jwtTtl;

        expect(claims).toMatchObject({ sub: 7, name: 'tester', role: 'admin', token_type: ACCESS_TOKEN_TYPE });
        // Jwt::issueAccess llama time() dos veces: el TTL puede cruzar 1 segundo.
        expect((claims?.exp ?? 0) - (claims?.iat ?? 0)).toBeGreaterThanOrEqual(ttl);
        expect((claims?.exp ?? 0) - (claims?.iat ?? 0)).toBeLessThanOrEqual(ttl + 1);
    }, 30000);

    it('token emitido por Node valida en PHP', async () => {
        const config = loadConfig();
        const app = await makeApp(config);
        const token = issueAccessToken(app, { id: 7, username: 'tester', role: 'admin' }, config.jwtTtl);
        const verified = callPhp({ action: 'verify-token', token });

        expect(verified.ok).toBe(true);
        expect(verified.result).toMatchObject({ sub: 7, name: 'tester', role: 'admin', token_type: 'access' });
    }, 30000);

    it('bcrypt bidireccional con password multibyte', async () => {
        const phpHash = callPhp({ action: 'hash', password: MULTIBYTE_PASSWORD });

        expect(phpHash.ok).toBe(true);
        expect(String(phpHash.result)).toMatch(/^\$2y\$12\$/);
        await expect(verifyPassword(MULTIBYTE_PASSWORD, String(phpHash.result))).resolves.toBe(true);
        await expect(verifyPassword(`${MULTIBYTE_PASSWORD}x`, String(phpHash.result))).resolves.toBe(false);

        const nodeHash = await hashPassword(MULTIBYTE_PASSWORD);

        expect(nodeHash).toMatch(/^\$2b\$12\$/);
        expect(callPhp({ action: 'verify-hash', password: MULTIBYTE_PASSWORD, hash: nodeHash }).result).toBe(true);
        expect(callPhp({ action: 'verify-hash', password: `${MULTIBYTE_PASSWORD}x`, hash: nodeHash }).result).toBe(false);
    }, 30000);
});
