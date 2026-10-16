/**
 * Capa de configuración del backend Node (Fase 1).
 *
 * - `parseConfig` es pura: recibe un mapa de variables de entorno y devuelve
 *   la config validada o lanza `ConfigError`; no toca `process.env` ni dotenv.
 * - `loadConfig` carga `backend/.env` con dotenv (path explícito, independiente
 *   del cwd) y delega en `parseConfig(process.env)`.
 *
 * Alineación con el v1 PHP (`api/src/Support/Jwt.php:131-142`): `JWT_SECRET`
 * vacío o con el placeholder del example es un error que nombra la key.
 * Durante la transición, `backend/.env` REUSA el MISMO JWT_SECRET que
 * `api/.env` (los access tokens cruzan PHP↔Node en cutover y rollback).
 *
 * Los VALORES de `JWT_SECRET` y `DB_PASS` nunca se incluyen en los mensajes
 * de error: cada problema se reporta solo con el nombre de la key y la causa.
 */
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

/** Longitud mínima de `JWT_SECRET` (32 bytes aleatorios = 64 hex, como generan los examples). */
export const JWT_SECRET_MIN_LENGTH = 32;

/** Placeholder del `.env.example`; nunca es una clave válida (el v1 también lo rechaza). */
const JWT_SECRET_PLACEHOLDER = 'cambiame_por_una_clave_larga_y_aleatoria';

/** Problema de configuración detectado, formateado como `KEY: causa` (nunca incluye el valor). */
export class ConfigError extends Error {
    /** Una entrada por problema, p. ej. `JWT_SECRET: no puede estar vacía`. */
    readonly issues: readonly string[];

    constructor(issues: readonly string[]) {
        super(`Configuración inválida:\n${issues.map(issue => `  - ${issue}`).join('\n')}`);
        this.name = 'ConfigError';
        this.issues = issues;
    }
}

/** Modo de la cookie de refresh: `auto` la marca Secure solo por HTTPS; `1`/`0` fuerzan. */
export type CookieSecureMode = 'auto' | '1' | '0';

/** Flag `APP_DEBUG` (`1` = errores detallados en desarrollo). */
export type AppDebugFlag = '0' | '1';

/**
 * Config validada y congelada. Campos en camelCase; el mapeo con cada key de
 * entorno es directo (`dbHost` ↔ `DB_HOST`, `jwtTtl` ↔ `JWT_TTL`, ...).
 */
export type AppConfig = Readonly<{
    dbHost: string;
    dbName: string;
    dbUser: string;
    /** Puede quedar vacío (XAMPP local sin password). */
    dbPass: string;
    /** Mismo valor que `api/.env` durante la transición (tokens cruzados PHP↔Node). */
    jwtSecret: string;
    /** Duración del access token en segundos. */
    jwtTtl: number;
    /** Duración del refresh token en días. */
    sessionDays: number;
    /** `''` = sin CORS; `'*'` = abierto sin credenciales; otro = origen exacto con credenciales. */
    corsOrigin: string;
    cookieSecure: CookieSecureMode;
    appDebug: AppDebugFlag;
    /** Puerto interno de Node (Apache proxya hacia acá en el cutover). */
    port: number;
    /** Prefijo público bajo el que Node sirve la API (mismo que el PHP v1). */
    basePath: string;
    /** Path de la cookie de refresh; hereda `basePath` si la key no viene. */
    cookiePath: string;
    /** `false` cuando `TRUST_PROXY='0'`; cualquier otro valor se pasa tal cual (p. ej. `'127.0.0.1'`). */
    trustProxy: boolean | string;
}>;

/** `true` en modo debug (`APP_DEBUG=1`): el envelope de error global agrega `details`. */
export function isDebug(config: AppConfig): boolean {
    return config.appDebug === '1';
}

/** `${key}: falta definirla en backend/.env` para strings requeridos. */
const requiredString = (): z.ZodString => z.string({ error: 'falta definirla en backend/.env' }).min(1, { error: 'no puede estar vacía' });

/** Coerción de env (string) a número entero; el mensaje de error nombra la unidad esperada. */
const envInt = (unit?: string) => {
    const message = unit === undefined ? 'se esperaba un entero' : `se esperaba un entero (${unit})`;

    return z.coerce.number({ error: message }).int({ error: message });
};

/** Origen exacto tipo `https://tudominio.com` (sin path ni slash final, igual que compara el v1). */
const isExactOrigin = (value: string): boolean => {
    try {
        return new URL(value).origin === value;
    } catch {
        return false;
    }
};

const envSchema = z.object({
    DB_HOST: requiredString(),
    DB_NAME: requiredString(),
    DB_USER: requiredString(),
    DB_PASS: z.string({ error: 'se esperaba un string' }).default(''),
    JWT_SECRET: z.string({ error: 'falta definirla en backend/.env' }).superRefine((value, ctx) => {
        if (value === '') {
            ctx.addIssue({ code: 'custom', message: 'no puede estar vacía: usá la MISMA clave que api/.env' });
            return;
        }

        if (value === JWT_SECRET_PLACEHOLDER) {
            ctx.addIssue({ code: 'custom', message: 'sigue siendo el placeholder de .env.example; generá una clave aleatoria de al menos 32 caracteres' });
            return;
        }

        if (value.length < JWT_SECRET_MIN_LENGTH) {
            ctx.addIssue({ code: 'custom', message: `debe tener al menos ${JWT_SECRET_MIN_LENGTH} caracteres` });
        }
    }),
    JWT_TTL: envInt('segundos').positive({ error: 'debe ser un entero positivo (segundos)' }).default(900),
    SESSION_DAYS: envInt('días').positive({ error: 'debe ser un entero positivo (días)' }).default(7),
    CORS_ORIGIN: z
        .string({ error: 'se esperaba un string' })
        .refine(value => value === '' || value === '*' || isExactOrigin(value), { error: "debe ser '', '*' o un origen exacto (p. ej. https://tudominio.com)" })
        .default(''),
    COOKIE_SECURE: z.enum(['auto', '1', '0'], { error: "debe ser 'auto', '1' o '0'" }).default('auto'),
    APP_DEBUG: z.enum(['0', '1'], { error: "debe ser '0' o '1'" }).default('0'),
    PORT: envInt().min(1, { error: 'fuera de rango (1-65535)' }).max(65535, { error: 'fuera de rango (1-65535)' }).default(3001),
    BASE_PATH: z
        .string({ error: 'se esperaba un string' })
        .refine(value => value.startsWith('/'), { error: "debe empezar con '/' (p. ej. /sabores-latinoamerica/api)" })
        .default('/sabores-latinoamerica/api'),
    COOKIE_PATH: z
        .string({ error: 'se esperaba un string' })
        .superRefine((value, ctx) => {
            if (value === '') {
                ctx.addIssue({ code: 'custom', message: 'no puede estar vacío (omitilo para heredar BASE_PATH)' });
                return;
            }

            if (!value.startsWith('/')) {
                ctx.addIssue({ code: 'custom', message: "debe empezar con '/' (omitilo para heredar BASE_PATH)" });
            }
        })
        .optional(),
    TRUST_PROXY: z
        .string({ error: 'se esperaba un string' })
        .min(1, { error: "no puede estar vacío; usá '0' para desactivarlo" })
        .default('0')
        .transform(value => (value === '0' ? false : value))
});

/** Formatea cada issue como `KEY: causa` (los paths del schema son keys de primer nivel). */
function formatIssues(error: z.ZodError): string[] {
    return error.issues.map(issue => {
        const key = issue.path.length > 0 ? String(issue.path[0]) : 'config';

        return `${key}: ${issue.message}`;
    });
}

/**
 * Valida un mapa de variables de entorno y devuelve la config congelada.
 *
 * Pura a propósito: los tests la invocan con entradas propias; el runtime la
 * alimenta con `process.env` desde `loadConfig()`.
 *
 * @throws {ConfigError} con la lista de `KEY: causa` (sin valores de secretos).
 */
export function parseConfig(env: Record<string, string | undefined>): AppConfig {
    const result = envSchema.safeParse(env);

    if (!result.success) {
        throw new ConfigError(formatIssues(result.error));
    }

    const values = result.data;

    return Object.freeze({
        dbHost: values.DB_HOST,
        dbName: values.DB_NAME,
        dbUser: values.DB_USER,
        dbPass: values.DB_PASS,
        jwtSecret: values.JWT_SECRET,
        jwtTtl: values.JWT_TTL,
        sessionDays: values.SESSION_DAYS,
        corsOrigin: values.CORS_ORIGIN,
        cookieSecure: values.COOKIE_SECURE,
        appDebug: values.APP_DEBUG,
        port: values.PORT,
        basePath: values.BASE_PATH,
        cookiePath: values.COOKIE_PATH ?? values.BASE_PATH,
        trustProxy: values.TRUST_PROXY
    });
}

/** Ruta de `backend/.env` derivada del módulo (no depende del cwd del proceso). */
const ENV_FILE_PATH = fileURLToPath(new URL('../.env', import.meta.url));

/**
 * Carga `backend/.env` (si existe; el entorno real tiene prioridad) y valida
 * `process.env`. Lanza `ConfigError` si falta o es inválida alguna key.
 */
export function loadConfig(): AppConfig {
    loadDotenv({ path: ENV_FILE_PATH, quiet: true });

    return parseConfig(process.env);
}
