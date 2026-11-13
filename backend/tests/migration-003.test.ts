/**
 * Migración 003 sobre un esquema 000-002 CON DATOS (todo 15, acceptance:
 * "desde cero + incremental"). Usa una base scratch propia y la borra al final.
 */
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { applyMigrationFile, createTestPoolFor, dropTestDatabase, recreateTestDatabase } from './support/test-db.js';

const INCREMENTAL_DB = 'sabores_incremental_test';
const BASE_MIGRATIONS = ['000_install.sql', '001_sessions_ip_ua.sql', '002_attempt_refresh_action.sql'];

const config = loadConfig();

let pool: Pool;

beforeAll(async () => {
    await recreateTestDatabase(config, INCREMENTAL_DB, BASE_MIGRATIONS);
    pool = createTestPoolFor(config, INCREMENTAL_DB);

    const [user] = await pool.execute<RowDataPacket[]>('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', ['pre_003_user', 'hash', 'user']);
    const userId = Number(user.insertId);

    await pool.execute('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))', [userId, 'a'.repeat(64)]);
    await pool.execute("INSERT INTO login_attempts (ip, username, action) VALUES ('127.0.0.1', 'pre_003_user', 'login')");
}, 60000);

afterAll(async () => {
    await pool.end();
    await dropTestDatabase(config, INCREMENTAL_DB);
});

async function scalar(sql: string): Promise<number> {
    const [rows] = await pool.execute<RowDataPacket[]>(sql);

    return Number(rows[0]?.total ?? 0);
}

describe('003 incremental sobre 000-002 con datos', () => {
    it('preserva filas y relaciones, deja NULLs y habilita action=delete', async () => {
        await applyMigrationFile(config, INCREMENTAL_DB, '003_consents.sql');

        const [users] = await pool.execute<RowDataPacket[]>('SELECT consent_version, consented_at, age_confirmed FROM users WHERE username = ?', ['pre_003_user']);

        expect(users[0]?.consent_version).toBeNull();
        expect(users[0]?.consented_at).toBeNull();
        expect(users[0]?.age_confirmed).toBeNull();
        expect(await scalar('SELECT COUNT(*) AS total FROM sessions')).toBe(1);
        expect(await scalar('SELECT COUNT(*) AS total FROM login_attempts')).toBe(1);

        await pool.execute("INSERT INTO login_attempts (ip, username, action) VALUES ('127.0.0.1', '', 'delete')");
        expect(await scalar("SELECT COUNT(*) AS total FROM login_attempts WHERE action = 'delete'")).toBe(1);
    });

    it('re-aplicar 003 falla con columna duplicada (forward-only)', async () => {
        await expect(applyMigrationFile(config, INCREMENTAL_DB, '003_consents.sql')).rejects.toThrow(/Duplicate column/i);
    });
});
