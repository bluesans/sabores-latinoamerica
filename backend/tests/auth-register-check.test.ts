/**
 * Contrato HTTP de register + check contra las fixtures doradas del todo 7,
 * con la DB scratch. Cierra la acceptance del todo 13.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { decodeAccessToken } from '../src/auth/jwt.js';
import { verifyPassword } from '../src/auth/password.js';
import { hashRefreshToken } from '../src/auth/refresh-token.js';
import { loadConfig } from '../src/config.js';
import { createTestPool, reloadTestSchema } from './support/test-db.js';

const API = '/sabores-latinoamerica/api';
const PASSWORD = 'Fixture7!Pass2026';
const FIXTURES_DIR = fileURLToPath(new URL('./fixtures/php/', import.meta.url));

type Fixture = {
    case: string;
    request: { method: string; path: string; headers: Record<string, string>; body: Record<string, unknown> | null };
    response: { status: number; headers: Record<string, string>; body: Record<string, unknown> | null };
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

async function postRegister(body: Record<string, unknown>): Promise<Awaited<ReturnType<FastifyInstance['inject']>>> {
    return app.inject({ method: 'POST', url: `${API}/auth/register`, payload: body, headers: { 'content-type': 'application/json' } });
}

async function scalar(sql: string): Promise<number> {
    const [rows] = await pool.execute<RowDataPacket[]>(sql);

    return Number(rows[0]?.total ?? 0);
}

describe('POST /auth/register', () => {
    it('register_ok: body, cookie, access y filas en DB', async () => {
        const expected = fixture('register_ok');
        const response = await postRegister(expected.request.body ?? {});

        expect(response.statusCode).toBe(expected.response.status);
        expect(response.headers['content-type']).toBe(expected.response.headers['content-type']);

        const body = response.json();

        expect(Object.keys(body).sort()).toEqual(['access', 'ok', 'role', 'username']);
        expect(body).toMatchObject({ ok: true, username: 'fixture7_user', role: 'user' });

        const claims = decodeAccessToken(app, String(body.access));
        expect(claims).toMatchObject({ name: 'fixture7_user', role: 'user', token_type: 'access' });
        expect(claims?.sub).toBeGreaterThan(0);

        const rawCookie = response.headers['set-cookie'];
        const cookie = Array.isArray(rawCookie) ? String(rawCookie[0]) : String(rawCookie ?? '');
        const tokenMatch = /^sdl_refresh=([0-9a-f]{64}); Path=\/sabores-latinoamerica\/api; Max-Age=604800; HttpOnly; SameSite=Strict$/.exec(cookie);

        expect(tokenMatch).not.toBeNull();

        const [users] = await pool.execute<RowDataPacket[]>('SELECT id, username, password, role FROM users WHERE username = ?', ['fixture7_user']);
        const user = users[0];

        expect(user?.role).toBe('user');
        await expect(verifyPassword(PASSWORD, String(user?.password))).resolves.toBe(true);

        const [sessions] = await pool.execute<RowDataPacket[]>('SELECT token, user_agent, TIMESTAMPDIFF(SECOND, NOW(), expires_at) AS ttl FROM sessions');
        expect(sessions).toHaveLength(1);
        expect(sessions[0]?.token).toBe(hashRefreshToken(String(tokenMatch?.[1])));
        expect(sessions[0]?.user_agent).toBeNull();
        expect(Number(sessions[0]?.ttl)).toBeGreaterThan(604790);
    });

    it('register_duplicado_409: body exacto y sin cookie', async () => {
        await postRegister({ username: 'fixture7_user', password: PASSWORD });

        const expected = fixture('register_duplicado_409');
        const response = await postRegister(expected.request.body ?? {});

        expect(response.statusCode).toBe(409);
        expect(response.json()).toEqual(expected.response.body);
        expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('register_password_corta_422: body exacto', async () => {
        const expected = fixture('register_password_corta_422');
        const response = await postRegister(expected.request.body ?? {});

        expect(response.statusCode).toBe(422);
        expect(response.json()).toEqual(expected.response.body);
    });

    it('register_username_invalido_422: body exacto', async () => {
        const expected = fixture('register_username_invalido_422');
        const response = await postRegister(expected.request.body ?? {});

        expect(response.statusCode).toBe(422);
        expect(response.json()).toEqual(expected.response.body);
    });

    it('trimea el username y acepta Unicode como el PHP', async () => {
        const response = await postRegister({ username: '  Tomás_1  ', password: PASSWORD });

        expect(response.statusCode).toBe(200);
        expect(response.json().username).toBe('Tomás_1');

        const [rows] = await pool.execute<RowDataPacket[]>('SELECT username FROM users');
        expect(rows[0]?.username).toBe('Tomás_1');
    });

    it('booleans se castean como PHP: true -> "1", false -> ""', async () => {
        const trueCase = await postRegister({ username: true, password: PASSWORD });
        const falseCase = await postRegister({ username: false, password: PASSWORD });

        expect(trueCase.statusCode).toBe(422);
        expect(falseCase.statusCode).toBe(422);
        expect(falseCase.json()).toEqual({ ok: false, error: 'El usuario debe tener entre 3 y 30 caracteres: letras, números o guión bajo.' });
    });

    it('6º register desde la misma IP: 429 + Retry-After sin usuario huérfano', async () => {
        for (let i = 1; i <= 5; i += 1) {
            const response = await postRegister({ username: `rl_${i}`, password: PASSWORD });

            expect(response.statusCode).toBe(200);
        }

        const blocked = await postRegister({ username: 'rl_6', password: PASSWORD });

        expect(blocked.statusCode).toBe(429);
        expect(blocked.json()).toEqual({ ok: false, error: 'Demasiados registros desde esta conexión. Esperá unos minutos.' });
        expect(blocked.headers['retry-after']).toMatch(/^\d+$/);
        expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
        expect(Number(blocked.headers['retry-after'])).toBeLessThanOrEqual(900);
        expect(await scalar('SELECT COUNT(*) AS total FROM users')).toBe(5);
        expect(await scalar("SELECT COUNT(*) AS total FROM login_attempts WHERE action = 'register'")).toBe(5);
    }, 30000);
});

describe('GET /auth/check', () => {
    it('auth_check_ok: body exacto con bearer válido', async () => {
        const registered = await postRegister({ username: 'fixture7_user', password: PASSWORD });
        const access = String(registered.json().access);

        const expected = fixture('auth_check_ok');
        const response = await app.inject({
            method: 'GET',
            url: `${API}/auth/check`,
            headers: { authorization: `Bearer ${access}` }
        });

        expect(response.statusCode).toBe(200);
        expect(response.headers['content-type']).toBe(expected.response.headers['content-type']);
        expect(response.json()).toEqual(expected.response.body);
    });

    it('sin token: 401 del middleware con WWW-Authenticate y body exacto', async () => {
        const expected = fixture('countries_sin_token_401');
        const response = await app.inject({ method: 'GET', url: `${API}/auth/check` });

        expect(response.statusCode).toBe(401);
        expect(response.headers['www-authenticate']).toBe('Bearer');
        expect(response.json()).toEqual(expected.response.body);
    });

    it('usuario borrado: 401 "Usuario no encontrado." sin WWW-Authenticate', async () => {
        const registered = await postRegister({ username: 'fixture7_user', password: PASSWORD });
        const access = String(registered.json().access);

        await pool.query('DELETE FROM users');

        const response = await app.inject({ method: 'GET', url: `${API}/auth/check`, headers: { authorization: `Bearer ${access}` } });

        expect(response.statusCode).toBe(401);
        expect(response.headers['www-authenticate']).toBeUndefined();
        expect(response.json()).toEqual({ ok: false, error: 'Usuario no encontrado.' });
    });

    it('token inválido: 401 del middleware', async () => {
        const response = await app.inject({ method: 'GET', url: `${API}/auth/check`, headers: { authorization: 'Bearer no-es-un-jwt' } });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({ ok: false, error: 'Necesitás iniciar sesión.' });
    });
});
