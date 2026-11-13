/**
 * CORS en paridad con `api/src/Middleware/CorsMiddleware.php`.
 *
 * - `CORS_ORIGIN=''`  -> mismo origen: ninguna cabecera CORS;
 * - `CORS_ORIGIN='*'` -> origen abierto, SIN credenciales;
 * - origen exacto     -> ese origen + `Access-Control-Allow-Credentials`.
 *
 * Se aplica a TODAS las respuestas (también errores y preflight), como el
 * middleware del PHP que envuelve al handler.
 */
import type { FastifyReply } from 'fastify';
import type { AppConfig } from '../config.js';

export function applyCorsHeaders(reply: FastifyReply, config: AppConfig): void {
    if (config.corsOrigin === '') {
        return;
    }

    reply.header('access-control-allow-origin', config.corsOrigin);
    reply.header('access-control-allow-headers', 'Content-Type, Authorization');
    reply.header('access-control-allow-methods', 'GET, POST, PUT, DELETE, OPTIONS');
    reply.header('vary', 'Origin');
    reply.header('access-control-max-age', '600');

    if (config.corsOrigin !== '*') {
        reply.header('access-control-allow-credentials', 'true');
    }
}
