/**
 * Helper de DB scratch para tests de integración (todo 10+).
 *
 * Guard DURO: solo opera sobre bases cuyo nombre termina en `_test`. Nunca
 * puede tocar `sabores_latinoamerica` ni ninguna base real.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import mysql, { type Pool } from 'mysql2/promise';
import type { AppConfig } from '../../src/config.js';

export const TEST_DB_NAME = 'sabores_node_test';

const SAFE_DB_NAME = /^[A-Za-z0-9_]+_test$/;
const MIGRATION_FILES = ['000_install.sql', '001_sessions_ip_ua.sql', '002_attempt_refresh_action.sql'];
const MIGRATIONS_DIR = fileURLToPath(new URL('../../../db/migrations/', import.meta.url));

function assertScratchName(): void {
    if (!SAFE_DB_NAME.test(TEST_DB_NAME)) {
        throw new Error(`ABORTADO: "${TEST_DB_NAME}" no termina en "_test".`);
    }
}

/** Pool contra la base scratch (host/user/pass salen de backend/.env). */
export function createTestPool(config: AppConfig): Pool {
    assertScratchName();

    return mysql.createPool({
        host: config.dbHost,
        user: config.dbUser,
        password: config.dbPass,
        database: TEST_DB_NAME,
        charset: 'utf8mb4_general_ci',
        dateStrings: true,
        connectionLimit: 10
    });
}

/** DROP/CREATE + migraciones 000, 001 y 002, en orden (equivalente a scratch-db.mjs). */
export async function reloadTestSchema(config: AppConfig): Promise<void> {
    assertScratchName();

    const connection = await mysql.createConnection({
        host: config.dbHost,
        user: config.dbUser,
        password: config.dbPass,
        charset: 'utf8mb4_general_ci',
        multipleStatements: true
    });

    try {
        await connection.query(`DROP DATABASE IF EXISTS \`${TEST_DB_NAME}\``);
        await connection.query(`CREATE DATABASE \`${TEST_DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        await connection.query(`USE \`${TEST_DB_NAME}\``);

        for (const file of MIGRATION_FILES) {
            const migration = await readFile(`${MIGRATIONS_DIR}${file}`, 'utf8');
            await connection.query(migration);
        }
    } finally {
        await connection.end();
    }
}
