/**
 * Pool MySQL (mysql2/promise) del backend Node.
 *
 * Paridad con PDO (`api/src/Support/Database.php`):
 * - conexión con collation `utf8mb4_general_ci` (el v1 abre `charset=utf8mb4`;
 *   PDO/MariaDB resuelve a `utf8mb4_general_ci`);
 * - `dateStrings: true`: los DATETIME viajan como `'YYYY-MM-DD HH:MM:SS'`
 *   (string), no como objetos `Date` — igual que PDO con fetch asociativo.
 *
 * `createPool` es una factory pura (testeable); `getPool` es el singleton
 * perezoso del runtime sobre la config validada de `backend/.env`.
 */
import { createPool as createMysqlPool, type Pool } from 'mysql2/promise';
import { type AppConfig, loadConfig } from '../config.js';

export function createPool(config: AppConfig = loadConfig()): Pool {
    return createMysqlPool({
        host: config.dbHost,
        user: config.dbUser,
        password: config.dbPass,
        database: config.dbName,
        charset: 'utf8mb4_general_ci',
        dateStrings: true
    });
}

let sharedPool: Pool | undefined;

/** Pool singleton perezoso: se crea en el primer uso y se reutiliza. */
export function getPool(): Pool {
    sharedPool ??= createPool();

    return sharedPool;
}

/** Cierra el singleton si está abierto (shutdown limpio y tests). */
export async function closePool(): Promise<void> {
    if (sharedPool === undefined) {
        return;
    }

    const closing = sharedPool;
    sharedPool = undefined;
    await closing.end();
}
