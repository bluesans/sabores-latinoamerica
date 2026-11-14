/**
 * Bootstrap de administrador inicial (solo CLI), espejo de
 * `api/bin/create-admin.php` (todo 20).
 *
 * Uso: npm run create-admin [-- --force]
 * Requiere ADMIN_USER/ADMIN_PASS en el entorno o en backend/.env.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import { hashPassword } from '../src/auth/password.js';
import { passwordError, username as validUsername } from '../src/auth/validation.js';

const backendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

loadDotenv({ path: resolve(backendDir, '.env') });

const adminUser = process.env.ADMIN_USER ?? null;
const adminPass = process.env.ADMIN_PASS ?? null;
const errors: string[] = [];

if (adminUser === null) {
    errors.push('ADMIN_USER no esta definido en el entorno.');
} else if (!validUsername(adminUser)) {
    errors.push('ADMIN_USER invalido: debe tener entre 3 y 30 caracteres (letras, numeros o guion bajo).');
}

if (adminPass === null) {
    errors.push('ADMIN_PASS no esta definido en el entorno.');
} else {
    const error = passwordError(adminPass);

    if (error !== null) {
        errors.push(`ADMIN_PASS invalido: ${error}`);
    }
}

if (errors.length > 0 || adminUser === null || adminPass === null) {
    for (const error of errors) {
        process.stderr.write(`${error}\n`);
    }

    process.exit(1);
}

const host = process.env.DB_HOST ?? '127.0.0.1';
const database = process.env.DB_NAME ?? 'sabores_latinoamerica';
const user = process.env.DB_USER ?? 'root';
const password = process.env.DB_PASS ?? '';

let connection: Awaited<ReturnType<typeof mysql.createConnection>>;

try {
    connection = await mysql.createConnection({ host, user, password, database, charset: 'utf8mb4' });
} catch {
    process.stderr.write('No se pudo conectar a la base de datos.\n');
    process.exit(1);
}

try {
    const [existingRows] = await connection.execute<RowDataPacket[]>('SELECT role FROM users WHERE username = ?', [adminUser]);
    const existing = existingRows[0];
    const force = process.argv.includes('--force');

    if (existing === undefined) {
        const hash = await hashPassword(adminPass);

        await connection.execute("INSERT INTO users (username, password, role) VALUES (?, ?, 'admin')", [adminUser, hash]);
        process.stdout.write('Admin creado.\n');
        process.exitCode = 0;
    } else if (String(existing['role']) === 'user') {
        process.stderr.write(`El usuario '${adminUser}' ya existe con rol 'user'; este script no promueve cuentas existentes.` + ` Promuevelo manualmente con SQL: UPDATE users SET role = 'admin' WHERE username = '${adminUser}';` + ' y luego reejecuta este script para fijar su contrasena.\n');
        process.exitCode = 1;
    } else if (!force) {
        process.stdout.write('El admin ya existe.\n');
        process.exitCode = 0;
    } else {
        const hash = await hashPassword(adminPass);

        await connection.execute('UPDATE users SET password = ? WHERE username = ?', [hash, adminUser]);
        process.stdout.write('Contraseña del admin actualizada.\n');
        process.exitCode = 0;
    }
} finally {
    await connection.end();
}
