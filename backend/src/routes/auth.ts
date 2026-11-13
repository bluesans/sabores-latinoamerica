/**
 * Rutas de auth del todo 13: register + check, en paridad con
 * `AuthController`/`AuthService` del v1.
 */
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'mysql2/promise';
import { refreshCookieForRequest } from '../auth/cookies.js';
import { requireAuth } from '../auth/guard.js';
import { findUserForCheck, registerUser } from '../auth/service.js';
import type { AppConfig } from '../config.js';
import { clientIp } from '../rate-limit/attempts.js';

/** `(string)($b[$key] ?? '')` del PHP para strings/numbers/booleans. */
function bodyString(body: unknown, key: string): string {
    if (typeof body !== 'object' || body === null) {
        return '';
    }

    const value = (body as Record<string, unknown>)[key];

    if (typeof value === 'string') {
        return value;
    }

    if (typeof value === 'number') {
        return String(value);
    }

    if (typeof value === 'boolean') {
        // (string) true === '1', (string) false === '' en PHP.
        return value ? '1' : '';
    }

    return '';
}

export function registerAuthRoutes(app: FastifyInstance, config: AppConfig, pool: Pool): void {
    app.post('/auth/register', async (request, reply) => {
        const result = await registerUser(app, pool, config, {
            username: bodyString(request.body, 'username'),
            password: bodyString(request.body, 'password'),
            ip: clientIp(request, config.trustProxy)
        });

        if (!result.ok) {
            for (const [name, value] of Object.entries(result.headers)) {
                reply.header(name, value);
            }

            return reply.code(result.status).send(result.body);
        }

        reply.header('set-cookie', refreshCookieForRequest(config, request, result.refreshToken));

        return reply.send(result.body);
    });

    app.get('/auth/check', { preHandler: requireAuth(app) }, async (request, reply) => {
        const authUser = request.authUser;

        if (authUser === null) {
            return reply.code(401).header('www-authenticate', 'Bearer').send({ ok: false, error: 'Necesitás iniciar sesión.' });
        }

        const user = await findUserForCheck(pool, authUser.id);

        if (user === null) {
            return reply.code(401).send({ ok: false, error: 'Usuario no encontrado.' });
        }

        return reply.send({ ok: true, username: user.username, role: user.role });
    });
}
