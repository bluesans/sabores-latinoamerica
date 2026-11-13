/**
 * DELETE /auth/account (todo 16, compliance #20): re-ingreso de password,
 * guard del último admin, borrado transaccional con cascadas y throttle.
 */
import type { FastifyInstance } from 'fastify';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/auth/password.js';
import { loadConfig } from '../src/config.js';
import { createTestPool, reloadTestSchema } from './support/test-db.js';

const API = '/sabores-latinoamerica/api';
const PASSWORD = 'S3gura!Pass2026';
const CLEAR_COOKIE = 'sdl_refresh=; Path=/sabores-latinoamerica/api; Max-Age=0; HttpOnly; SameSite=Strict; Expires=Thu, 01 Jan 1970 00:00:00 GMT';

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
    await pool.query('DELETE FROM favorites');
    await pool.query('DELETE FROM sessions');
    await pool.query('DELETE FROM users');
});

async function scalar(sql: string): Promise<number> {
    const [rows] = await pool.execute<RowDataPacket[]>(sql);

    return Number(rows[0]?.total ?? 0);
}

async function userId(username: string): Promise<number> {
    const [rows] = await pool.execute<RowDataPacket[]>('SELECT id FROM users WHERE username = ?', [username]);

    return Number(rows[0]?.id ?? 0);
}

function cookieFrom(response: Awaited<ReturnType<FastifyInstance['inject']>>): string {
    const raw = response.headers['set-cookie'];

    return Array.isArray(raw) ? String(raw[0]) : String(raw ?? '');
}

async function register(username: string): Promise<{ access: string; cookieToken: string; userId: number }> {
    const response = await app.inject({ method: 'POST', url: `${API}/auth/register`, payload: { username, password: PASSWORD } });

    expect(response.statusCode).toBe(200);

    return {
        access: String(response.json().access),
        cookieToken: /sdl_refresh=([0-9a-f]{64})/.exec(cookieFrom(response))?.[1] ?? '',
        userId: await userId(username)
    };
}

async function login(username: string): Promise<string> {
    const response = await app.inject({ method: 'POST', url: `${API}/auth/login`, payload: { username, password: PASSWORD } });

    expect(response.statusCode).toBe(200);

    return String(response.json().access);
}

function deleteAccount(access: string, password: string): ReturnType<FastifyInstance['inject']> {
    return app.inject({
        method: 'DELETE',
        url: `${API}/auth/account`,
        headers: { authorization: `Bearer ${access}` },
        payload: { password }
    });
}

async function insertAdmin(username: string): Promise<void> {
    await pool.execute<ResultSetHeader>('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username, await hashPassword(PASSWORD), 'admin']);
}

describe('DELETE /auth/account', () => {
    it('borra user + sessions + favorites, limpia cookie e invalida check/refresh/login', async () => {
        const account = await register('delete_user');

        await pool.execute('INSERT INTO favorites (user_id, recipe_id) VALUES (?, (SELECT id FROM recipes LIMIT 1))', [account.userId]);

        const response = await deleteAccount(account.access, PASSWORD);

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ ok: true });
        expect(cookieFrom(response)).toBe(CLEAR_COOKIE);
        expect(await scalar('SELECT COUNT(*) AS total FROM users')).toBe(0);
        expect(await scalar('SELECT COUNT(*) AS total FROM sessions')).toBe(0);
        expect(await scalar('SELECT COUNT(*) AS total FROM favorites')).toBe(0);

        const check = await app.inject({ method: 'GET', url: `${API}/auth/check`, headers: { authorization: `Bearer ${account.access}` } });
        expect(check.statusCode).toBe(401);
        expect(check.json()).toEqual({ ok: false, error: 'Usuario no encontrado.' });

        const refresh = await app.inject({ method: 'POST', url: `${API}/auth/refresh`, headers: { cookie: `sdl_refresh=${account.cookieToken}` } });
        expect(refresh.statusCode).toBe(401);
        expect(refresh.json()).toEqual({ ok: false, error: 'Sesión expirada.' });

        const relogin = await app.inject({ method: 'POST', url: `${API}/auth/login`, payload: { username: 'delete_user', password: PASSWORD } });
        expect(relogin.statusCode).toBe(401);
        expect(relogin.json()).toEqual({ ok: false, error: 'Usuario o contraseña incorrectos.' });
    }, 30000);

    it('password incorrecta: 403 sin efectos sobre user/sessions', async () => {
        const account = await register('delete_user');

        const response = await deleteAccount(account.access, 'ClaveIncorrecta1');

        expect(response.statusCode).toBe(403);
        expect(response.json()).toEqual({ ok: false, error: 'Contraseña incorrecta.' });
        expect(await scalar('SELECT COUNT(*) AS total FROM users')).toBe(1);
        expect(await scalar('SELECT COUNT(*) AS total FROM sessions')).toBe(1);
        expect(await scalar("SELECT COUNT(*) AS total FROM login_attempts WHERE action = 'delete'")).toBe(1);
    });

    it('password vacía: 403 sin borrar', async () => {
        const account = await register('delete_user');
        const response = await deleteAccount(account.access, '');

        expect(response.statusCode).toBe(403);
        expect(await scalar('SELECT COUNT(*) AS total FROM users')).toBe(1);
    });

    it('guard del último admin: 409 y el admin sigue existiendo', async () => {
        await insertAdmin('only_admin');
        const access = await login('only_admin');

        const response = await deleteAccount(access, PASSWORD);

        expect(response.statusCode).toBe(409);
        expect(response.json()).toEqual({ ok: false, error: 'No podés eliminar la última cuenta de administrador.' });
        expect(await scalar("SELECT COUNT(*) AS total FROM users WHERE role = 'admin'")).toBe(1);
    });

    it('admin con otro admin: puede borrarse', async () => {
        await insertAdmin('admin_one');
        await insertAdmin('admin_two');
        const access = await login('admin_one');

        const response = await deleteAccount(access, PASSWORD);

        expect(response.statusCode).toBe(200);
        expect(await scalar("SELECT COUNT(*) AS total FROM users WHERE role = 'admin'")).toBe(1);
        expect(await scalar("SELECT COUNT(*) AS total FROM users WHERE username = 'admin_two'")).toBe(1);
    });

    it('throttle delete: 5 intentos / 15 min; el 6.º es 429 con Retry-After', async () => {
        const account = await register('delete_user');

        const statuses: number[] = [];
        let last: Awaited<ReturnType<FastifyInstance['inject']>> | null = null;

        for (let i = 0; i < 6; i += 1) {
            last = await deleteAccount(account.access, 'ClaveIncorrecta1');
            statuses.push(last.statusCode);
        }

        expect(statuses).toEqual([403, 403, 403, 403, 403, 429]);
        expect(last?.json()).toEqual({ ok: false, error: 'Demasiados intentos. Esperá unos minutos.' });
        expect(last?.headers['retry-after']).toMatch(/^\d+$/);
        expect(Number(last?.headers['retry-after'])).toBeGreaterThan(0);
        expect(Number(last?.headers['retry-after'])).toBeLessThanOrEqual(900);
        expect(await scalar("SELECT COUNT(*) AS total FROM login_attempts WHERE action = 'delete'")).toBe(5);
        expect(await scalar('SELECT COUNT(*) AS total FROM users')).toBe(1);
    }, 30000);

    it('sin token: 401 del middleware, sin tocar la DB', async () => {
        const response = await app.inject({ method: 'DELETE', url: `${API}/auth/account`, payload: { password: PASSWORD } });

        expect(response.statusCode).toBe(401);
        expect(response.headers['www-authenticate']).toBe('Bearer');
        expect(await scalar('SELECT COUNT(*) AS total FROM users')).toBe(0);
    });
});
