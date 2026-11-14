/**
 * CLI create-admin en paridad (todo 20). Corre el binario real con tsx
 * contra la DB scratch y verifica hash/rol/mensajes.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/auth/password.js';
import { loadConfig } from '../src/config.js';
import { createTestPool, reloadTestSchema, TEST_DB_NAME } from './support/test-db.js';

const BACKEND_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PASS_A = 'CliPass!2026A';
const PASS_B = 'CliPass!2026B';

let pool: Pool;
let config: ReturnType<typeof loadConfig>;

function newUsername(): string {
    return `qa_cli_${randomBytes(4).toString('hex')}`;
}

function runCli(username: string, password: string, force = false) {
    return spawnSync(process.execPath, ['--import', 'tsx', 'bin/create-admin.ts', ...(force ? ['--force'] : [])], {
        cwd: BACKEND_DIR,
        encoding: 'utf8',
        env: {
            ...process.env,
            DB_HOST: config.dbHost,
            DB_NAME: TEST_DB_NAME,
            DB_USER: config.dbUser,
            DB_PASS: config.dbPass,
            ADMIN_USER: username,
            ADMIN_PASS: password
        }
    });
}

async function userRow(username: string): Promise<RowDataPacket | undefined> {
    const [rows] = await pool.execute<RowDataPacket[]>('SELECT username, password, role FROM users WHERE username = ?', [username]);

    return rows[0];
}

beforeAll(async () => {
    config = loadConfig();

    await reloadTestSchema(config);
    pool = createTestPool(config);
}, 60000);

afterAll(async () => {
    await pool.end();
});

describe('create-admin CLI', () => {
    it('testCliCreatesAdminOnFreshSchema', async () => {
        const username = newUsername();
        const run = runCli(username, PASS_A);

        expect(run.status, `stderr: ${run.stderr}`).toBe(0);
        expect(run.stdout).toContain('Admin creado.');
        expect(`${run.stdout}${run.stderr}`).not.toContain(PASS_A);

        const row = await userRow(username);

        expect(row).toBeDefined();
        expect(row?.role).toBe('admin');
        expect(String(row?.password).length).toBeGreaterThanOrEqual(60);
        expect(await verifyPassword(PASS_A, String(row?.password))).toBe(true);
    });

    it('testCliSecondRunWithoutForceKeepsHashUntouched', async () => {
        const username = newUsername();
        const first = runCli(username, PASS_A);
        const before = await userRow(username);

        expect(first.status).toBe(0);
        expect(before).toBeDefined();

        const second = runCli(username, PASS_A);
        const after = await userRow(username);

        expect(second.status).toBe(0);
        expect(second.stdout).toContain('El admin ya existe.');
        expect(after?.password).toBe(before?.password);
        expect(after?.role).toBe('admin');
    });

    it('testCliForceRotatesPasswordHash', async () => {
        const username = newUsername();
        const first = runCli(username, PASS_A);
        const before = await userRow(username);

        expect(first.status).toBe(0);
        expect(before).toBeDefined();

        const rotated = runCli(username, PASS_B, true);
        const after = await userRow(username);

        expect(rotated.status, `stderr: ${rotated.stderr}`).toBe(0);
        expect(rotated.stdout).toContain('actualizada');
        expect(after?.password).not.toBe(before?.password);
        expect(await verifyPassword(PASS_B, String(after?.password))).toBe(true);
        expect(await verifyPassword(PASS_A, String(after?.password))).toBe(false);
    });

    it('testCliRefusesToPromoteExistingUserRoleAccount', async () => {
        const username = newUsername();
        const hash = await hashPassword(PASS_A);

        await pool.execute("INSERT INTO users (username, password, role) VALUES (?, ?, 'user')", [username, hash]);

        const before = await userRow(username);
        const run = runCli(username, PASS_A);
        const after = await userRow(username);

        expect(before).toBeDefined();
        expect(run.status).toBe(1);
        expect(run.stderr).toContain("rol 'user'");
        expect(after?.role).toBe('user');
        expect(after?.password).toBe(before?.password);
    });
});
