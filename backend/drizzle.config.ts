/**
 * Config de drizzle-kit: introspección de la base viva (`npx drizzle-kit pull`)
 * y generación de migraciones futuras (`npm run db:generate`).
 *
 * - `schema` apunta al esquema versionado que produce/consume el pull.
 * - `out` conserva la foto (snapshot) del pull; es la base de futuros `generate`.
 * - Las credenciales salen de `backend/.env` (DB_*); nunca van hardcodeadas.
 */
import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

loadDotenv();

const dbPassword = process.env['DB_PASS'];

export default defineConfig({
    dialect: 'mysql',
    schema: './src/db/schema.ts',
    out: './drizzle',
    dbCredentials: {
        host: process.env['DB_HOST'] ?? '127.0.0.1',
        user: process.env['DB_USER'] ?? 'root',
        database: process.env['DB_NAME'] ?? 'sabores_latinoamerica',
        // XAMPP local es root SIN password y drizzle-kit rechaza '' (min 1):
        // se omite la key cuando está vacía.
        ...(dbPassword ? { password: dbPassword } : {})
    }
});
