/**
 * Factory de la app Fastify, testeable con `fastify.inject`.
 *
 * Paridad de capa HTTP con `api/index.php` + `JsonErrorHandler` +
 * `CorsMiddleware` (v1 PHP):
 * - rutas montadas bajo `BASE_PATH` (el PHP usa `setBasePath`);
 * - GET/HEAD `/` bajo el prefijo -> 404 global;
 * - método/path sin match -> 405 global y SIN cabecera `Allow` (Slim marca
 *   `Method Not Allowed` por su catch-all OPTIONS `/{routes:.+}`);
 * - OPTIONS non-root -> 200 con body vacío y `text/html; charset=UTF-8`
 *   (respuesta por defecto de Slim, pineada por el fixture `options_preflight`);
 * - JSON con `application/json; charset=utf-8` en TODA respuesta de la API,
 *   errores incluidos;
 * - CORS idéntico al middleware PHP, aplicado a todas las respuestas.
 *
 * No se registran stubs de rutas de negocio: cada grupo llega en su todo
 * (9-19) con su contrato real; inventar respuestas rompería la paridad.
 */
import Fastify, { type FastifyError, type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { Pool } from 'mysql2/promise';
import { registerAuthGuard } from './auth/guard.js';
import { registerJwt } from './auth/jwt.js';
import type { AppConfig } from './config.js';
import { applyCorsHeaders } from './http/cors.js';
import { buildErrorPayload, httpRoutingError, resolveErrorStatus } from './http/error-envelope.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerHealthRoutes } from './routes/health.js';

export type CreateAppOptions = Readonly<{
    config: AppConfig;
    db: Pool;
    logger?: FastifyServerOptions['logger'];
}>;

/** Path sin query string (`/x?y=1` -> `/x`). */
function requestPath(url: string): string {
    const queryIndex = url.indexOf('?');

    return queryIndex === -1 ? url : url.slice(0, queryIndex);
}

/**
 * Path relativo al prefijo, como el `basePath` de Slim. Un path fuera del
 * prefijo se evalúa tal cual: el catch-all OPTIONS del PHP también lo
 * alcanzaría y por eso un GET desconocido sigue siendo 405.
 */
function stripBasePath(path: string, basePath: string): string {
    if (path === basePath) {
        return '/';
    }

    if (path.startsWith(`${basePath}/`)) {
        return path.slice(basePath.length);
    }

    return path;
}

export function createApp(options: CreateAppOptions): FastifyInstance {
    const { config, db } = options;
    const app = Fastify({
        trustProxy: config.trustProxy,
        ...(options.logger === undefined ? {} : { logger: options.logger })
    });

    registerJwt(app, config);
    registerAuthGuard(app);

    // CORS se aplica al final: cubre 200, errores y preflight por igual.
    // Estilo callback (4 args): un hook sincrónico de 3 args deja el inject colgado.
    app.addHook('onSend', (_request, reply, _payload, done) => {
        applyCorsHeaders(reply, config);
        done();
    });

    app.setErrorHandler((error: FastifyError, _request, reply) => {
        const status = resolveErrorStatus(error);
        const payload = buildErrorPayload(error, status, config, app.log);

        return reply.code(status).type('application/json; charset=utf-8').send(payload);
    });

    app.setNotFoundHandler((request, reply) => {
        const path = stripBasePath(requestPath(request.raw.url ?? '/'), config.basePath);

        // Bajo el prefijo exacto ("/") Slim no matchea su catch-all: 404.
        if (path === '/') {
            const error = httpRoutingError('HttpNotFoundException', 404);
            const status = resolveErrorStatus(error);
            const payload = buildErrorPayload(error, status, config, app.log);

            return reply.code(status).type('application/json; charset=utf-8').send(payload);
        }

        // Preflight: 200 sin body, con el content-type por defecto de Slim.
        if (request.method === 'OPTIONS') {
            return reply.code(200).type('text/html; charset=UTF-8').send();
        }

        // Cualquier otro método/path sin match -> 405 sin `Allow`.
        const error = httpRoutingError('HttpMethodNotAllowedException', 405);
        const status = resolveErrorStatus(error);
        const payload = buildErrorPayload(error, status, config, app.log);

        return reply.code(status).type('application/json; charset=utf-8').send(payload);
    });

    app.register(
        async instance => {
            registerHealthRoutes(instance, db);
            registerAuthRoutes(instance, config, db);
        },
        { prefix: config.basePath }
    );

    return app;
}
