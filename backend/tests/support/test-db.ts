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
const MIGRATION_FILES = ['000_install.sql', '001_sessions_ip_ua.sql', '002_attempt_refresh_action.sql', '003_consents.sql'];
const MIGRATIONS_DIR = fileURLToPath(new URL('../../../db/migrations/', import.meta.url));

export function assertTestDatabaseName(dbName: string): void {
    if (!SAFE_DB_NAME.test(dbName)) {
        throw new Error(`ABORTADO: "${dbName}" no termina en "_test".`);
    }
}

/** Pool contra una base scratch (host/user/pass salen de backend/.env). */
export function createTestPoolFor(config: AppConfig, dbName: string, connectionLimit = 10): Pool {
    assertTestDatabaseName(dbName);

    return mysql.createPool({
        host: config.dbHost,
        user: config.dbUser,
        password: config.dbPass,
        database: dbName,
        charset: 'utf8mb4_general_ci',
        dateStrings: true,
        connectionLimit
    });
}

/** Pool contra la base scratch canónica. */
export function createTestPool(config: AppConfig): Pool {
    return createTestPoolFor(config, TEST_DB_NAME);
}

/** Crea una base scratch desde cero aplicando los archivos indicados, en orden. */
export async function recreateTestDatabase(config: AppConfig, dbName: string, files: readonly string[]): Promise<void> {
    assertTestDatabaseName(dbName);

    const connection = await mysql.createConnection({
        host: config.dbHost,
        user: config.dbUser,
        password: config.dbPass,
        charset: 'utf8mb4_general_ci',
        multipleStatements: true
    });

    try {
        await connection.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
        await connection.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        await connection.query(`USE \`${dbName}\``);

        for (const file of files) {
            const migration = await readFile(`${MIGRATIONS_DIR}${file}`, 'utf8');
            await connection.query(migration);
        }
    } finally {
        await connection.end();
    }
}

/** Aplica un archivo de migración a una base scratch existente. */
export async function applyMigrationFile(config: AppConfig, dbName: string, file: string): Promise<void> {
    assertTestDatabaseName(dbName);

    const connection = await mysql.createConnection({
        host: config.dbHost,
        user: config.dbUser,
        password: config.dbPass,
        database: dbName,
        charset: 'utf8mb4_general_ci',
        multipleStatements: true
    });

    try {
        const migration = await readFile(`${MIGRATIONS_DIR}${file}`, 'utf8');
        await connection.query(migration);
    } finally {
        await connection.end();
    }
}

/** Borra una base scratch (solo nombres *_test). */
export async function dropTestDatabase(config: AppConfig, dbName: string): Promise<void> {
    assertTestDatabaseName(dbName);

    const connection = await mysql.createConnection({
        host: config.dbHost,
        user: config.dbUser,
        password: config.dbPass,
        charset: 'utf8mb4_general_ci'
    });

    try {
        await connection.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    } finally {
        await connection.end();
    }
}

/** DROP/CREATE + migraciones 000-003, en orden (equivalente a scratch-db.mjs). */
export async function reloadTestSchema(config: AppConfig): Promise<void> {
    await recreateTestDatabase(config, TEST_DB_NAME, MIGRATION_FILES);
}
