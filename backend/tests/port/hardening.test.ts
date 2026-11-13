/**
 * Port 1:1 de `api/tests/Integration/HardeningTest.php`.
 *
 * Portados ahora (capa HTTP del todo 8): CORS con Vary/Max-Age, CORS
 * silencioso y timestamp UTC de /health. El resto depende de los recursos
 * públicos (17), favoritos (18), auth middleware (13) y rutas admin (19).
 */
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { type AppConfig, parseConfig } from '../../src/config.js';

const API = '/sabores-latinoamerica/api';
const BASE_ENV: Record<string, string> = {
    DB_HOST: '127.0.0.1',
    DB_NAME: 'sabores_test',
    DB_USER: 'root',
    JWT_SECRET: 's'.repeat(64),
    BASE_PATH: API
};

const apps: FastifyInstance[] = [];

function makeApp(overrides: Record<string, string> = {}): FastifyInstance {
    const config: AppConfig = parseConfig({ ...BASE_ENV, ...overrides });
    const app = createApp({ config, db: { query: async () => 1 } });
    apps.push(app);

    return app;
}

afterEach(async () => {
    await Promise.all(apps.splice(0).map(async app => app.close()));
});

const PENDING: ReadonlyArray<readonly [string, string]> = [
    ['testByCountryNonNumericIdReturns400', 'todo 17'],
    ['testIngredientNonNumericIdReturns400', 'todo 17'],
    ['testByCountryWellFormedMissingIdStill404', 'todo 17'],
    ['testFavoriteToggleBadRecipeIdReturns400', 'todo 18'],
    ['testFavoriteToggleWellFormedMissingStill404', 'todo 18'],
    ['testByCountryBadPaginationParamsReturn400', 'todo 17'],
    ['testByCountryWithoutParamsReturnsAllWithPaginationMeta', 'todo 17'],
    ['testByCountryPageTwoDiffersFromPageOne', 'todo 17'],
    ['testRoutesConstrainPublicIdsButNotAdminGroup', 'todos 17 y 19'],
    ['testAuthMiddleware401CarriesWwwAuthenticate', 'todo 13'],
    ['testSearchLimitedResultsAreDeterministicallyOrdered', 'todo 17']
];

describe('HardeningTest (PHP)', () => {
    it('testCorsEmitsVaryAndMaxAgeWhenOriginConfigured', async () => {
        const response = await makeApp({ CORS_ORIGIN: 'https://example.com' }).inject({ method: 'GET', url: `${API}/health` });

        expect(response.headers['access-control-allow-origin']).toBe('https://example.com');
        expect(response.headers.vary).toBe('Origin');
        expect(response.headers['access-control-max-age']).toBe('600');
    });

    it('testCorsStaysSilentWhenOriginEmpty', async () => {
        const response = await makeApp({ CORS_ORIGIN: '' }).inject({ method: 'GET', url: `${API}/health` });

        expect(response.headers['access-control-allow-origin']).toBeUndefined();
        expect(response.headers.vary).toBeUndefined();
    });

    it('testHealthTimeIsExplicitUtc', async () => {
        const response = await makeApp().inject({ method: 'GET', url: `${API}/health` });
        const body = response.json();

        expect(response.statusCode).toBe(200);
        expect(body.time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(String(body.time).endsWith('+00:00')).toBe(true);
    });

    for (const [name, closing] of PENDING) {
        it.todo(`${name} — lo cierra el ${closing}`);
    }
});
