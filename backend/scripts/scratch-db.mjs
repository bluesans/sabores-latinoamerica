#!/usr/bin/env node
/**
 * Recrea la base scratch `sabores_node_test` desde cero aplicando, EN ORDEN,
 * las migraciones canónicas de `db/migrations/` (000, 001, 002 y 003).
 *
 * Uso: node scripts/scratch-db.mjs [--db=sabores_node_test]
 *
 * Guard duro: si el nombre no termina en `_test`, aborta SIN CONECTARSE
 * (nunca puede tocar `sabores_latinoamerica` ni ninguna base real).
 */
import { readFile } from 'node:fs/promises';
import { config as loadDotenv } from 'dotenv';
import mysql from 'mysql2/promise';

const DEFAULT_DB_NAME = 'sabores_node_test';
const SAFE_DB_NAME = /^[A-Za-z0-9_]+_test$/;
const MIGRATION_FILES = ['000_install.sql', '001_sessions_ip_ua.sql', '002_attempt_refresh_action.sql', '003_consents.sql'];

loadDotenv({ path: new URL('../.env', import.meta.url), quiet: true });

const dbArg = process.argv.find(argument => argument.startsWith('--db='));
const dbName = dbArg === undefined ? DEFAULT_DB_NAME : dbArg.slice('--db='.length);

if (!SAFE_DB_NAME.test(dbName)) {
    console.error(`ABORTADO: "${dbName}" no termina en "_test": este script solo puede DROP/CREATE bases *_test.`);
    process.exit(1);
}

const connection = await mysql.createConnection({
    host: process.env['DB_HOST'] ?? '127.0.0.1',
    user: process.env['DB_USER'] ?? 'root',
    password: process.env['DB_PASS'] ?? '',
    charset: 'utf8mb4_general_ci',
    multipleStatements: true
});

try {
    await connection.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    await connection.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await connection.query(`USE \`${dbName}\``);

    for (const file of MIGRATION_FILES) {
        const migration = await readFile(new URL(`../../db/migrations/${file}`, import.meta.url), 'utf8');
        await connection.query(migration);
        console.log(`aplicada ${file}`);
    }

    const [rows] = await connection.query('SELECT COUNT(*) AS objects FROM information_schema.tables WHERE table_schema = ?', [dbName]);
    console.log(`OK: ${dbName} recreada con ${rows[0].objects} objetos (8 tablas + 1 vista)`);
} catch (error) {
    console.error(`ERROR al recrear ${dbName}: ${error.message}`);
    process.exitCode = 1;
} finally {
    await connection.end();
}
