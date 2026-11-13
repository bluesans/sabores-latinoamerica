/**
 * Port 1:1 de `api/tests/Integration/ErrorIdTest.php` (todo 8).
 */
import type { FastifyServerOptions } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { type AppConfig, parseConfig } from '../../src/config.js';

const BASE_ENV: Record<string, string> = {
    DB_HOST: '127.0.0.1',
    DB_NAME: 'sabores_test',
    DB_USER: 'root',
    JWT_SECRET: 's'.repeat(64),
    BASE_PATH: '/sabores-latinoamerica/api'
};

function configWith(overrides: Record<string, string> = {}): AppConfig {
    return parseConfig({ ...BASE_ENV, ...overrides });
}

type LoggerCapture = { lines: string[]; logger: FastifyServerOptions['logger'] };

function captureLogger(): LoggerCapture {
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

const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
    await Promise.all(closers.splice(0).map(async close => close()));
});

function boomApp(config: AppConfig, logger: FastifyServerOptions['logger']): ReturnType<typeof createApp> {
    const app = createApp({ config, db: { query: async () => 1 }, logger });

    app.get('/__boom', async () => {
        throw new Error('boom-secret');
    });
    closers.push(async () => app.close());

    return app;
}

describe('ErrorIdTest (PHP)', () => {
    it('testProductionModeHidesDetailButLogsSecretWithId', async () => {
        const { lines, logger } = captureLogger();
        const app = boomApp(configWith({ APP_DEBUG: '0' }), logger);
        const response = await app.inject({ method: 'GET', url: '/__boom' });
        const body = response.json();

        expect(response.statusCode).toBe(500);
        expect(body.ok).toBe(false);
        expect(body.id).toMatch(/^[0-9a-f]{16}$/);
        expect(body).not.toHaveProperty('message');
        expect(body).not.toHaveProperty('file');
        expect(body).not.toHaveProperty('line');
        expect(body).not.toHaveProperty('exception');
        expect(lines.join('')).toContain(`[api-error ${body.id}]`);
        expect(lines.join('')).toContain('boom-secret');
    });

    it('testDebugModeKeepsIdAndAddsDetail', async () => {
        const { logger } = captureLogger();
        const app = boomApp(configWith({ APP_DEBUG: '1' }), logger);
        const response = await app.inject({ method: 'GET', url: '/__boom' });
        const body = response.json();

        expect(response.statusCode).toBe(500);
        expect(body.ok).toBe(false);
        expect(body.id).toMatch(/^[0-9a-f]{16}$/);
        expect(body.exception).toBe('Error');
        expect(body.message).toBe('boom-secret');
        expect(typeof body.file).toBe('string');
        expect(typeof body.line).toBe('number');
    });
});
