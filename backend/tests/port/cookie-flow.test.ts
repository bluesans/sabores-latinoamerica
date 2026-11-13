/**
 * Port 1:1 de `api/tests/Integration/CookieFlowTest.php` (todo 14).
 *
 * Cubre las 7 casos a nivel HTTP: register/login setean cookie y sacan el
 * refresh del body, refresh rota + reuse detection, logout revoca y limpia,
 * cookie tampeada 401 + clear, y el 11.º login fallido con Retry-After.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { decodeAccessToken } from '../../src/auth/jwt.js';
import { hashRefreshToken } from '../../src/auth/refresh-token.js';
import { loadConfig } from '../../src/config.js';
import { createTestPool, reloadTestSchema } from '../support/test-db.js';

const API = '/sabores-latinoamerica/api';
const PASSWORD = 'S3gura!Pass2026';
const USERNAME = 'qa_cookie_user';
const FIXTURES_DIR = fileURLToPath(new URL('../fixtures/php/', import.meta.url));

type Fixture = {
    request: { body: Record<string, unknown> | null };
    response: { status: number; headers: Record<string, string | string[]>; body: Record<string, unknown> | null };
};

function fixture(name: string): Fixture {
    return JSON.parse(readFileSync(`${FIXTURES_DIR}${name}.json`, 'utf8')) as Fixture;
}

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

async function register(username: string = USERNAME): Promise<Awaited<ReturnType<FastifyInstance['inject']>>> {
    return app.inject({ method: 'POST', url: `${API}/auth/register`, payload: { username, password: PASSWORD } });
}

function setCookie(response: Awaited<ReturnType<FastifyInstance['inject']>>): string {
    const raw = response.headers['set-cookie'];

    return Array.isArray(raw) ? String(raw[0]) : String(raw ?? '');
}

function tokenFrom(response: Awaited<ReturnType<FastifyInstance['inject']>>): string {
    return /sdl_refresh=([0-9a-f]{64})/.exec(setCookie(response))?.[1] ?? '';
}

async function scalar(sql: string): Promise<number> {
    const [rows] = await pool.execute<RowDataPacket[]>(sql);

    return Number(rows[0]?.total ?? 0);
}

async function sessionRows(): Promise<Array<RowDataPacket & { token: string; revoked_at: string | null; ip: string | null; user_agent: string | null }>> {
    const [rows] = await pool.execute<Array<RowDataPacket & { token: string; revoked_at: string | null; ip: string | null; user_agent: string | null }>>('SELECT token, revoked_at, ip, user_agent FROM sessions ORDER BY id');

    return rows;
}

describe('CookieFlowTest (PHP)', () => {
    it('testRegisterSetsCookieAndStripsBody', async () => {
        const response = await register();

        expect(response.statusCode).toBe(200);
        expect(setCookie(response)).toMatch(/^sdl_refresh=[0-9a-f]{64}; Path=\/sabores-latinoamerica\/api; Max-Age=604800; HttpOnly; SameSite=Strict$/);
        expect(response.json()).not.toHaveProperty('refresh');
        expect(response.json().username).toBe(USERNAME);
    });

    it('testLoginSetsCookieAndStripsBodyAndAccessWorks', async () => {
        await register();

        const expected = fixture('login_ok');
        const response = await app.inject({ method: 'POST', url: `${API}/auth/login`, payload: { username: USERNAME, password: PASSWORD } });

        expect(response.statusCode).toBe(200);
        expect(response.json()).not.toHaveProperty('refresh');
        expect(response.json()).toMatchObject({ ok: true, username: USERNAME, role: 'user' });
        expect(decodeAccessToken(app, String(response.json().access))).not.toBeNull();
        expect(setCookie(response)).toContain('HttpOnly');
        expect(setCookie(response)).toContain('SameSite=Strict');
        expect(setCookie(response)).toContain('Path=/sabores-latinoamerica/api');
        expect(response.statusCode).toBe(expected.response.status);
        expect(response.headers['content-type']).toBe(expected.response.headers['content-type']);
        expect(Object.keys(response.json()).sort()).toEqual(Object.keys(expected.response.body ?? {}).sort());

        const check = await app.inject({ method: 'GET', url: `${API}/auth/check`, headers: { authorization: `Bearer ${String(response.json().access)}` } });

        expect(check.statusCode).toBe(200);
        expect(check.json()).toEqual({ ok: true, username: USERNAME, role: 'user' });
    });

    it('testRefreshViaCookieRotatesSessionAndStripsBody', async () => {
        const registered = await register();
        const oldToken = tokenFrom(registered);
        const expected = fixture('refresh_ok');

        expect(oldToken).not.toBe('');

        const response = await app.inject({ method: 'POST', url: `${API}/auth/refresh`, headers: { cookie: `sdl_refresh=${oldToken}`, 'user-agent': 'cookie-flow/1.0' } });

        expect(response.statusCode).toBe(expected.response.status);
        expect(response.headers['content-type']).toBe(expected.response.headers['content-type']);
        expect(Object.keys(response.json()).sort()).toEqual(Object.keys(expected.response.body ?? {}).sort());

        const newToken = tokenFrom(response);

        expect(newToken).not.toBe('');
        expect(newToken).not.toBe(oldToken);
        expect(response.json()).not.toHaveProperty('refresh');
        expect(decodeAccessToken(app, String(response.json().access))).not.toBeNull();

        const rows = await sessionRows();
        const newRow = rows.find(row => row.token === hashRefreshToken(newToken));
        const oldRow = rows.find(row => row.token === hashRefreshToken(oldToken));

        expect(oldRow?.revoked_at).not.toBeNull();
        expect(newRow?.revoked_at).toBeNull();
        expect(newRow?.ip).toBe('127.0.0.1');
        expect(newRow?.user_agent).toBe('cookie-flow/1.0');
        expect(await scalar('SELECT COUNT(*) AS total FROM sessions')).toBe(2);
    });

    it('testReusingRotatedAwayTokenTriggersReuseDetection', async () => {
        const registered = await register();
        const oldToken = tokenFrom(registered);

        const first = await app.inject({ method: 'POST', url: `${API}/auth/refresh`, headers: { cookie: `sdl_refresh=${oldToken}` } });
        expect(first.statusCode).toBe(200);

        const replay = await app.inject({ method: 'POST', url: `${API}/auth/refresh`, headers: { cookie: `sdl_refresh=${oldToken}` } });

        expect(replay.statusCode).toBe(401);
        expect(replay.json()).toEqual(fixture('refresh_reutilizacion_401').response.body);
        expect(setCookie(replay)).toBe('sdl_refresh=; Path=/sabores-latinoamerica/api; Max-Age=0; HttpOnly; SameSite=Strict; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
        expect(await scalar('SELECT COUNT(*) AS total FROM sessions')).toBe(0);
    });

    it('testLogoutExpiresCookieAndRevokesSession', async () => {
        const registered = await register();
        const token = tokenFrom(registered);

        const response = await app.inject({ method: 'POST', url: `${API}/auth/logout`, headers: { cookie: `sdl_refresh=${token}` } });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual(fixture('logout_ok').response.body);
        expect(setCookie(response)).toBe('sdl_refresh=; Path=/sabores-latinoamerica/api; Max-Age=0; HttpOnly; SameSite=Strict; Expires=Thu, 01 Jan 1970 00:00:00 GMT');

        const rows = await sessionRows();
        expect(rows).toHaveLength(1);
        expect(rows[0]?.revoked_at).not.toBeNull();
    });

    it('testTamperedCookieValueGets401AndClearCookie', async () => {
        await register();

        const response = await app.inject({ method: 'POST', url: `${API}/auth/refresh`, headers: { cookie: `sdl_refresh=${'de'.repeat(32)}` } });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual(fixture('refresh_cookie_invalida_401').response.body);
        expect(setCookie(response)).toContain('Max-Age=0');
    });

    it('refresh sin cookie: 401 "Sesión expirada." + clear cookie (fixture)', async () => {
        const expected = fixture('refresh_sin_cookie_401');
        const expectedCookie = expected.response.headers['set-cookie'];
        const expectedValue = Array.isArray(expectedCookie) ? String(expectedCookie[0]) : String(expectedCookie);
        const response = await app.inject({ method: 'POST', url: `${API}/auth/refresh` });

        expect(response.statusCode).toBe(expected.response.status);
        expect(response.json()).toEqual(expected.response.body);
        expect(setCookie(response)).toBe(expectedValue);
    });

    it('refresh acepta el bearer como fallback de transición', async () => {
        const registered = await register();
        const refreshToken = tokenFrom(registered);

        const response = await app.inject({ method: 'POST', url: `${API}/auth/refresh`, headers: { authorization: `Bearer ${refreshToken}` } });

        expect(response.statusCode).toBe(200);
        expect(tokenFrom(response)).not.toBe('');
        expect(tokenFrom(response)).not.toBe(refreshToken);
        expect(await scalar('SELECT COUNT(*) AS total FROM sessions')).toBe(2);
    });

    it('cookie-first: una cookie inválida gana sobre un bearer válido', async () => {
        const registered = await register();
        const validToken = tokenFrom(registered);

        const response = await app.inject({
            method: 'POST',
            url: `${API}/auth/refresh`,
            headers: { cookie: `sdl_refresh=${'de'.repeat(32)}`, authorization: `Bearer ${validToken}` }
        });

        expect(response.statusCode).toBe(401);
        expect(await scalar('SELECT COUNT(*) AS total FROM sessions')).toBe(1);
        expect(setCookie(response)).toContain('Max-Age=0');
    });

    it('body JSON vacío: logout 200 + clear y refresh 401 + clear (Slim laxo)', async () => {
        const logout = await app.inject({ method: 'POST', url: `${API}/auth/logout`, headers: { 'content-type': 'application/json' } });

        expect(logout.statusCode).toBe(200);
        expect(logout.json()).toEqual({ ok: true });
        expect(setCookie(logout)).toContain('Max-Age=0');

        const refresh = await app.inject({ method: 'POST', url: `${API}/auth/refresh`, headers: { 'content-type': 'application/json' } });

        expect(refresh.statusCode).toBe(401);
        expect(refresh.json()).toEqual({ ok: false, error: 'Sesión expirada.' });
        expect(setCookie(refresh)).toContain('Max-Age=0');

        const login = await app.inject({ method: 'POST', url: `${API}/auth/login`, headers: { 'content-type': 'application/json' } });

        expect(login.statusCode).toBe(401);
        expect(login.json()).toEqual({ ok: false, error: 'Usuario o contraseña incorrectos.' });
    });

    it('testEleventhRapidFailedLoginGets429WithRetryAfterHint', async () => {
        await register();

        const statuses: number[] = [];
        let last: Awaited<ReturnType<FastifyInstance['inject']>> | null = null;

        for (let i = 0; i < 11; i += 1) {
            last = await app.inject({ method: 'POST', url: `${API}/auth/login`, payload: { username: USERNAME, password: 'Incorrecta1' } });
            statuses.push(last.statusCode);
        }

        expect(statuses).toEqual([401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 429]);
        expect(last?.json()).toEqual(fixture('login_rate_limit_429').response.body);
        expect(last?.headers['retry-after']).toMatch(/^\d+$/);
        expect(Number(last?.headers['retry-after'])).toBeGreaterThan(0);
        expect(Number(last?.headers['retry-after'])).toBeLessThanOrEqual(300);
        expect(await scalar("SELECT COUNT(*) AS total FROM login_attempts WHERE action = 'login'")).toBe(10);
    }, 30000);
});
