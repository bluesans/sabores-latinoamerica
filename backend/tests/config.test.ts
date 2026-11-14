import { readFileSync } from 'node:fs';
import { parse as parseDotenv } from 'dotenv';
import { describe, expect, it } from 'vitest';
import { ConfigError, isDebug, JWT_SECRET_MIN_LENGTH, parseConfig } from '../src/config.js';

// 64 chars hex, como randomBytes(32).toString('hex') del example.
const VALID_SECRET = '0123456789abcdef'.repeat(4);

// Valores NO default a propósito: prueban que cada key se parsea y mapea.
const FULL_ENV: Record<string, string | undefined> = {
    DB_HOST: 'db.interno',
    DB_NAME: 'sabores_test',
    DB_USER: 'usuario',
    DB_PASS: 'clave-secreta-db',
    JWT_SECRET: VALID_SECRET,
    JWT_TTL: '1200',
    SESSION_DAYS: '14',
    CORS_ORIGIN: 'https://tudominio.com',
    COOKIE_SECURE: '1',
    APP_DEBUG: '1',
    CONSENT_STRICT: '1',
    PORT: '4100',
    BASE_PATH: '/mi-prefijo',
    COOKIE_PATH: '/mi-cookie-path',
    TRUST_PROXY: '127.0.0.1'
};

// Solo las keys sin default: el resto debe resolverse por schema.
const REQUIRED_ONLY: Record<string, string> = {
    DB_HOST: '127.0.0.1',
    DB_NAME: 'sabores_latinoamerica',
    DB_USER: 'root',
    JWT_SECRET: VALID_SECRET
};

const envWithout = (...keys: readonly string[]): Record<string, string | undefined> => Object.fromEntries(Object.entries(FULL_ENV).filter(([key]) => !keys.includes(key)));

function captureConfigError(run: () => unknown): ConfigError {
    try {
        run();
    } catch (error) {
        if (error instanceof ConfigError) {
            return error;
        }

        throw error;
    }

    throw new Error('se esperaba un ConfigError');
}

describe('parseConfig', () => {
    describe('parseo feliz', () => {
        it('mapea todas las keys con valores explícitos (sin apoyarse en defaults)', () => {
            expect(parseConfig(FULL_ENV)).toEqual({
                dbHost: 'db.interno',
                dbName: 'sabores_test',
                dbUser: 'usuario',
                dbPass: 'clave-secreta-db',
                jwtSecret: VALID_SECRET,
                jwtTtl: 1200,
                sessionDays: 14,
                corsOrigin: 'https://tudominio.com',
                cookieSecure: '1',
                appDebug: '1',
                consentStrict: true,
                port: 4100,
                basePath: '/mi-prefijo',
                cookiePath: '/mi-cookie-path',
                trustProxy: '127.0.0.1'
            });
        });

        it('aplica los defaults cuando las keys opcionales no vienen', () => {
            expect(parseConfig(REQUIRED_ONLY)).toEqual({
                dbHost: '127.0.0.1',
                dbName: 'sabores_latinoamerica',
                dbUser: 'root',
                dbPass: '',
                jwtSecret: VALID_SECRET,
                jwtTtl: 900,
                sessionDays: 7,
                corsOrigin: '',
                cookieSecure: 'auto',
                appDebug: '0',
                consentStrict: true,
                port: 3001,
                basePath: '/sabores-latinoamerica/api',
                cookiePath: '/sabores-latinoamerica/api',
                trustProxy: false
            });
        });

        it('COOKIE_PATH hereda BASE_PATH cuando no viene', () => {
            expect(parseConfig({ ...REQUIRED_ONLY, BASE_PATH: '/otro-prefijo' }).cookiePath).toBe('/otro-prefijo');
        });

        it("COOKIE_SECURE='true' se normaliza a '1' (paridad Cookies.php)", () => {
            expect(parseConfig({ ...REQUIRED_ONLY, COOKIE_SECURE: 'true' }).cookieSecure).toBe('1');
            expect(parseConfig({ ...REQUIRED_ONLY, COOKIE_SECURE: 'auto' }).cookieSecure).toBe('auto');
        });

        it('devuelve una config congelada', () => {
            expect(Object.isFrozen(parseConfig(FULL_ENV))).toBe(true);
        });
    });

    describe('isDebug', () => {
        it('es true con APP_DEBUG=1 y false por defecto', () => {
            expect(isDebug(parseConfig(FULL_ENV))).toBe(true);
            expect(isDebug(parseConfig(REQUIRED_ONLY))).toBe(false);
        });
    });

    describe('keys faltantes', () => {
        it.each(['DB_HOST', 'DB_NAME', 'DB_USER', 'JWT_SECRET'])('nombra %s cuando falta', key => {
            const error = captureConfigError(() => parseConfig(envWithout(key)));

            expect(error.message).toContain(key);
            expect(error.issues.some(issue => issue.startsWith(`${key}:`))).toBe(true);
        });
    });

    describe('JWT_SECRET', () => {
        it("falla si está vacío (''), nombrando la key", () => {
            const error = captureConfigError(() => parseConfig({ ...FULL_ENV, JWT_SECRET: '' }));

            expect(error.message).toContain('JWT_SECRET');
        });

        it('falla con el placeholder de .env.example', () => {
            const error = captureConfigError(() => parseConfig({ ...FULL_ENV, JWT_SECRET: 'cambiame_por_una_clave_larga_y_aleatoria' }));

            expect(error.message).toContain('JWT_SECRET');
        });

        it('falla si es más corta que el mínimo', () => {
            const error = captureConfigError(() => parseConfig({ ...FULL_ENV, JWT_SECRET: 'x'.repeat(JWT_SECRET_MIN_LENGTH - 1) }));

            expect(error.message).toContain('JWT_SECRET');
            expect(error.message).toContain(String(JWT_SECRET_MIN_LENGTH));
        });
    });

    describe('valores inválidos', () => {
        const casos: [key: string, value: string][] = [
            ['JWT_TTL', 'no-es-un-numero'],
            ['JWT_TTL', ''],
            ['JWT_TTL', '0'],
            ['JWT_TTL', '-5'],
            ['SESSION_DAYS', 'siete'],
            ['SESSION_DAYS', '0'],
            ['PORT', '99999'],
            ['PORT', '0'],
            ['COOKIE_SECURE', 'yes'],
            ['APP_DEBUG', 'true'],
            ['CONSENT_STRICT', 'true'],
            ['CORS_ORIGIN', 'no-es-un-origen'],
            ['BASE_PATH', 'sin-slash-inicial'],
            ['COOKIE_PATH', ''],
            ['TRUST_PROXY', '']
        ];

        it.each(casos)('%s=%j → ConfigError nombrando la key', (key, value) => {
            const error = captureConfigError(() => parseConfig({ ...FULL_ENV, [key]: value }));

            expect(error.message).toContain(`${key}:`);
        });
    });

    describe('secretos', () => {
        it('no filtra JWT_SECRET ni DB_PASS en el mensaje de error', () => {
            const error = captureConfigError(() => parseConfig({ ...FULL_ENV, JWT_TTL: 'invalido' }));

            expect(error.message).toContain('JWT_TTL');
            expect(error.message).not.toContain(VALID_SECRET);
            expect(error.message).not.toContain('clave-secreta-db');
        });
    });
});

describe('.env.example (acceptance end-to-end)', () => {
    const exampleEnv = parseDotenv(readFileSync(new URL('../.env.example', import.meta.url), 'utf8'));

    it('parsea OK con JWT_SECRET completado (como lo hace el operador al copiarlo)', () => {
        const config = parseConfig({ ...exampleEnv, JWT_SECRET: VALID_SECRET });

        expect(config.dbHost).toBe('127.0.0.1');
        expect(config.dbName).toBe('sabores_latinoamerica');
        expect(config.dbUser).toBe('root');
        expect(config.dbPass).toBe('');
        expect(config.jwtTtl).toBe(900);
        expect(config.sessionDays).toBe(7);
        expect(config.corsOrigin).toBe('');
        expect(config.cookieSecure).toBe('auto');
        expect(config.appDebug).toBe('0');
        expect(config.port).toBe(3001);
        expect(config.basePath).toBe('/sabores-latinoamerica/api');
        expect(config.cookiePath).toBe('/sabores-latinoamerica/api');
        expect(config.trustProxy).toBe(false);
    });

    it('tal cual (JWT_SECRET vacío) falla nombrando JWT_SECRET: el operador debe completarlo', () => {
        expect(exampleEnv).toHaveProperty('JWT_SECRET', '');

        const error = captureConfigError(() => parseConfig(exampleEnv));

        expect(error.message).toContain('JWT_SECRET');
    });
});
