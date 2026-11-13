/**
 * Migración 003 + consentimiento de registro (todo 15).
 *
 * Verifica columnas nuevas, enum 'delete', comportamiento legacy (NULL) y
 * CONSENT_STRICT=1 (400 sin los tres booleanos; persistencia con ellos).
 */
import type { FastifyInstance } from 'fastify';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { CONSENT_REQUIRED_MESSAGE, CONSENT_VERSION } from '../src/auth/consent.js';
import { type AppConfig, loadConfig } from '../src/config.js';
import { createTestPool, reloadTestSchema, TEST_DB_NAME } from './support/test-db.js';

const API = '/sabores-latinoamerica/api';
const PASSWORD = 'S3gura!Pass2026';

let pool: Pool;
let legacyApp: FastifyInstance;
let strictApp: FastifyInstance;

function withConsentStrict(base: AppConfig, strict: boolean): AppConfig {
    // Clon completo: no perder TRUST_PROXY/COOKIE_*/SESSION_DAYS del .env.
    return { ...base, consentStrict: strict };
}

beforeAll(async () => {
    const base = loadConfig();

    await reloadTestSchema(base);
    pool = createTestPool(base);
    legacyApp = createApp({ config: base, db: pool });
    strictApp = createApp({ config: withConsentStrict(base, true), db: pool });
    await legacyApp.ready();
    await strictApp.ready();
}, 60000);

afterAll(async () => {
    await legacyApp.close();
    await strictApp.close();
    await pool.end();
});

beforeEach(async () => {
    await pool.query('DELETE FROM login_attempts');
    await pool.query('DELETE FROM sessions');
    await pool.query('DELETE FROM users');
});

function post(app: FastifyInstance, body: Record<string, unknown>): ReturnType<FastifyInstance['inject']> {
    return app.inject({ method: 'POST', url: `${API}/auth/register`, payload: body });
}

async function userRow(): Promise<RowDataPacket | undefined> {
    const [rows] = await pool.execute<RowDataPacket[]>('SELECT username, role, consent_version, consented_at, age_confirmed FROM users');

    return rows[0];
}

async function scalar(sql: string): Promise<number> {
    const [rows] = await pool.execute<RowDataPacket[]>(sql);

    return Number(rows[0]?.total ?? 0);
}

const FULL_CONSENT = { accept_terms: true, accept_privacy: true, age_confirmed: true };

describe('migración 003', () => {
    it('users tiene las 3 columnas nuevas y login_attempts acepta delete', async () => {
        const [columns] = await pool.execute<RowDataPacket[]>('SELECT column_name FROM information_schema.columns WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position', [TEST_DB_NAME, 'users']);
        const names = columns.map(row => String(row['column_name']));

        expect(names).toEqual(expect.arrayContaining(['consent_version', 'consented_at', 'age_confirmed']));

        const [actions] = await pool.execute<RowDataPacket[]>('SELECT column_type FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ?', [TEST_DB_NAME, 'login_attempts', 'action']);

        expect(String(actions[0]?.['column_type'] ?? '')).toContain("'delete'");
    });

    it('las columnas nuevas aceptan NULL por default', async () => {
        await pool.execute("INSERT INTO users (username, password, role) VALUES ('legacy_row', 'x', 'user')");

        const row = await userRow();

        expect(row?.consent_version).toBeNull();
        expect(row?.consented_at).toBeNull();
        expect(row?.age_confirmed).toBeNull();
    });
});

describe('register legacy (CONSENT_STRICT=0)', () => {
    it('sin consentimientos: 200 y columnas NULL', async () => {
        const response = await post(legacyApp, { username: 'legacy_user', password: PASSWORD });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({ ok: true, username: 'legacy_user', role: 'user' });

        const row = await userRow();

        expect(row?.consent_version).toBeNull();
        expect(row?.consented_at).toBeNull();
        expect(row?.age_confirmed).toBeNull();
    });

    it('con los tres en true: los persiste aunque strict esté apagado', async () => {
        const response = await post(legacyApp, { username: 'consent_user', password: PASSWORD, ...FULL_CONSENT });

        expect(response.statusCode).toBe(200);

        const row = await userRow();

        expect(row?.consent_version).toBe(CONSENT_VERSION);
        expect(row?.consented_at).not.toBeNull();
        expect(Number(row?.age_confirmed)).toBe(1);
    });
});

describe('register strict (CONSENT_STRICT=1)', () => {
    it('sin consentimientos: 400, cero users y cero attempts', async () => {
        const response = await post(strictApp, { username: 'strict_user', password: PASSWORD });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({ ok: false, error: CONSENT_REQUIRED_MESSAGE });
        expect(await scalar('SELECT COUNT(*) AS total FROM users')).toBe(0);
        expect(await scalar('SELECT COUNT(*) AS total FROM login_attempts')).toBe(0);
    });

    it('consentimiento parcial o no booleano: 400', async () => {
        const partial = await post(strictApp, { username: 'strict_user', password: PASSWORD, accept_terms: true });
        const numeric = await post(strictApp, { username: 'strict_user', password: PASSWORD, accept_terms: 1, accept_privacy: true, age_confirmed: true });

        expect(partial.statusCode).toBe(400);
        expect(numeric.statusCode).toBe(400);
        expect(await scalar('SELECT COUNT(*) AS total FROM users')).toBe(0);
    });

    it('con los tres en true: 200 y columnas pobladas', async () => {
        const response = await post(strictApp, { username: 'strict_user', password: PASSWORD, ...FULL_CONSENT });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({ ok: true, username: 'strict_user', role: 'user' });

        const row = await userRow();

        expect(row?.consent_version).toBe(CONSENT_VERSION);
        expect(row?.consented_at).not.toBeNull();
        expect(Number(row?.age_confirmed)).toBe(1);
        expect(await scalar('SELECT COUNT(*) AS total FROM sessions')).toBe(1);
    });
});
