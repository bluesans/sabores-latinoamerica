/**
 * Suite de contrato de la capa HTTP (todo 8), contra los fixtures dorados
 * del v1 PHP capturados en el todo 7.
 *
 * Cubre: health 200/503, envelopes globales 404/405 con id de 16 hex,
 * ausencia de `Allow` en 405, OPTIONS non-root 200 vacío, CORS en sus tres
 * modos y los campos de detalle de APP_DEBUG. No toca la DB viva: inyecta
 * un stub de `SELECT 1`.
 */
import type { FastifyInstance, FastifyServerOptions } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { type AppConfig, parseConfig } from '../src/config.js';
import type { HealthDatabase } from '../src/routes/health.js';

const API = '/sabores-latinoamerica/api';
const ERROR_ID = /^[0-9a-f]{16}$/;
const PHP_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00$/;

const BASE_ENV: Record<string, string> = {
    DB_HOST: '127.0.0.1',
    DB_NAME: 'sabores_test',
    DB_USER: 'root',
    JWT_SECRET: 'a'.repeat(32),
    BASE_PATH: API,
    APP_DEBUG: '0',
    CORS_ORIGIN: ''
};

const OK_DB: HealthDatabase = {
    query: async () => [[{ '1': 1 }], []]
};

const DOWN_DB: HealthDatabase = {
    query: async () => {
        throw new Error('db caída');
    }
};

const apps: FastifyInstance[] = [];

function configWith(overrides: Record<string, string> = {}): AppConfig {
    return parseConfig({ ...BASE_ENV, ...overrides });
}

function makeApp(overrides: Record<string, string> = {}, db: HealthDatabase = OK_DB, logger?: FastifyServerOptions['logger']): FastifyInstance {
    const app = createApp({ config: configWith(overrides), db, ...(logger === undefined ? {} : { logger }) });
    apps.push(app);

    return app;
}

afterEach(async () => {
    await Promise.all(apps.splice(0).map(async app => app.close()));
});

describe('GET /health', () => {
    it('devuelve el shape exacto del fixture con DB arriba', async () => {
        const response = await makeApp().inject({ method: 'GET', url: `${API}/health` });

        expect(response.statusCode).toBe(200);
        expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
        expect(response.json()).toEqual({
            ok: true,
            api: true,
            db: true,
            time: expect.stringMatching(PHP_TIMESTAMP)
        });
    });

    it('devuelve 503 con ok:false y db:false cuando el SELECT 1 falla', async () => {
        const response = await makeApp({}, DOWN_DB).inject({ method: 'GET', url: `${API}/health` });

        expect(response.statusCode).toBe(503);
        expect(response.json()).toEqual({
            ok: false,
            api: true,
            db: false,
            time: expect.stringMatching(PHP_TIMESTAMP)
        });
    });

    it('HEAD se resuelve como el GET del PHP (200 y body vacío)', async () => {
        const response = await makeApp().inject({ method: 'HEAD', url: `${API}/health` });

        expect(response.statusCode).toBe(200);
        expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
        expect(response.body).toBe('');
    });
});

describe('envelopes globales (JsonErrorHandler)', () => {
    it('GET / bajo el prefijo -> 404 con id de 16 hex', async () => {
        const response = await makeApp().inject({ method: 'GET', url: `${API}/` });

        expect(response.statusCode).toBe(404);
        expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
        expect(response.json()).toEqual({
            ok: false,
            error: 'Ruta no encontrada.',
            id: expect.stringMatching(ERROR_ID)
        });
    });

    it('GET a un path desconocido -> 405 SIN cabecera Allow', async () => {
        const response = await makeApp().inject({ method: 'GET', url: `${API}/no-existe-este-path` });

        expect(response.statusCode).toBe(405);
        expect(response.headers.allow).toBeUndefined();
        expect(response.json()).toEqual({
            ok: false,
            error: 'Método HTTP no permitido.',
            id: expect.stringMatching(ERROR_ID)
        });
    });

    it('POST /health -> 405 (path existente con otro método), sin Allow', async () => {
        const response = await makeApp().inject({ method: 'POST', url: `${API}/health` });

        expect(response.statusCode).toBe(405);
        expect(response.headers.allow).toBeUndefined();
    });

    it('GET /countries/12abc/recipes -> 405 como el regex del PHP', async () => {
        const response = await makeApp().inject({ method: 'GET', url: `${API}/countries/12abc/recipes` });

        expect(response.statusCode).toBe(405);
        expect(response.json().error).toBe('Método HTTP no permitido.');
    });

    it('fuera del prefijo un GET tampoco es 404: el catch-all OPTIONS del PHP lo vuelve 405', async () => {
        const response = await makeApp().inject({ method: 'GET', url: '/health' });

        expect(response.statusCode).toBe(405);
    });

    it('HEAD / bajo el prefijo -> 404', async () => {
        const response = await makeApp().inject({ method: 'HEAD', url: `${API}/` });

        expect(response.statusCode).toBe(404);
    });
});

describe('OPTIONS non-root', () => {
    it('OPTIONS /x -> 200, body vacío y text/html como Slim', async () => {
        const response = await makeApp().inject({ method: 'OPTIONS', url: `${API}/x` });

        expect(response.statusCode).toBe(200);
        expect(response.headers['content-type']).toBe('text/html; charset=UTF-8');
        expect(response.body).toBe('');
    });

    it('OPTIONS / bajo el prefijo -> 404 (el catch-all no matchea la raíz)', async () => {
        const response = await makeApp().inject({ method: 'OPTIONS', url: `${API}/` });

        expect(response.statusCode).toBe(404);
        expect(response.json().error).toBe('Ruta no encontrada.');
    });

    it('OPTIONS sobre un path existente también es 200 vacío (catch-all del PHP)', async () => {
        const response = await makeApp().inject({ method: 'OPTIONS', url: `${API}/health` });

        expect(response.statusCode).toBe(200);
        expect(response.body).toBe('');
    });
});

describe('CORS (CorsMiddleware)', () => {
    it("CORS_ORIGIN='' no emite ninguna cabecera CORS", async () => {
        const response = await makeApp().inject({ method: 'GET', url: `${API}/health` });

        expect(response.headers['access-control-allow-origin']).toBeUndefined();
        expect(response.headers['access-control-allow-credentials']).toBeUndefined();
    });

    it("CORS_ORIGIN='*' abre el origen sin credenciales", async () => {
        const response = await makeApp({ CORS_ORIGIN: '*' }).inject({ method: 'GET', url: `${API}/health` });

        expect(response.headers['access-control-allow-origin']).toBe('*');
        expect(response.headers['access-control-allow-headers']).toBe('Content-Type, Authorization');
        expect(response.headers['access-control-allow-methods']).toBe('GET, POST, PUT, DELETE, OPTIONS');
        expect(response.headers['access-control-max-age']).toBe('600');
        expect(response.headers.vary).toBe('Origin');
        expect(response.headers['access-control-allow-credentials']).toBeUndefined();
    });

    it('un origen exacto agrega credenciales', async () => {
        const response = await makeApp({ CORS_ORIGIN: 'https://tudominio.com' }).inject({ method: 'GET', url: `${API}/health` });

        expect(response.headers['access-control-allow-origin']).toBe('https://tudominio.com');
        expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('las cabeceras CORS también cubren errores globales y preflight', async () => {
        const notFound = await makeApp({ CORS_ORIGIN: '*' }).inject({ method: 'GET', url: `${API}/` });
        const preflight = await makeApp({ CORS_ORIGIN: '*' }).inject({ method: 'OPTIONS', url: `${API}/x` });

        expect(notFound.headers['access-control-allow-origin']).toBe('*');
        expect(preflight.headers['access-control-allow-origin']).toBe('*');
    });
});

describe('errores no controlados (500 forzado)', () => {
    function loggerLines(): { lines: string[]; logger: FastifyServerOptions['logger'] } {
        const lines: string[] = [];

        return {
            lines,
            logger: {
                level: 'error',
                stream: {
                    write: (line: string) => {
                        lines.push(line);
                    }
                }
            }
        };
    }

    it('APP_DEBUG=0: envelope interno, id de 16 hex y marker en el log sin filtrar el mensaje', async () => {
        const { lines, logger } = loggerLines();
        const app = makeApp({}, OK_DB, logger);
        app.get('/boom', async () => {
            throw new Error('boom-secret');
        });

        const response = await app.inject({ method: 'GET', url: '/boom' });
        const body = response.json();

        expect(response.statusCode).toBe(500);
        expect(Object.keys(body).sort()).toEqual(['error', 'id', 'ok']);
        expect(body.error).toBe('Error interno del servidor.');
        expect(body.id).toMatch(ERROR_ID);
        expect(lines.join('')).toContain(`[api-error ${body.id}]`);
        expect(lines.join('')).toContain('boom-secret');
    });

    it('APP_DEBUG=1: agrega exception/message/file/line como el PHP', async () => {
        const { logger } = loggerLines();
        const app = makeApp({ APP_DEBUG: '1' }, OK_DB, logger);
        app.get('/boom', async () => {
            throw new Error('debug-boom');
        });

        const response = await app.inject({ method: 'GET', url: '/boom' });
        const body = response.json();

        expect(response.statusCode).toBe(500);
        expect(body).toMatchObject({
            ok: false,
            error: 'Error interno del servidor.',
            id: expect.stringMatching(ERROR_ID),
            exception: 'Error',
            message: 'debug-boom'
        });
        expect(typeof body.file).toBe('string');
        expect(typeof body.line).toBe('number');
    });
});
