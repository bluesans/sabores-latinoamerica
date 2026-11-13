/**
 * Rutas de auth del todo 13: register + check, en paridad con
 * `AuthController`/`AuthService` del v1.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'mysql2/promise';
import { clearedRefreshCookieForRequest, REFRESH_COOKIE_NAME, refreshCookieForRequest } from '../auth/cookies.js';
import { bearerToken, requireAuth } from '../auth/guard.js';
import { deleteAccount, findUserForCheck, loginUser, refreshSession, registerUser } from '../auth/service.js';
import type { AppConfig } from '../config.js';
import { clientIp } from '../rate-limit/attempts.js';
import { logoutSession } from '../sessions/repository.js';

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

/** Cookie de refresh tal como la ve el servidor (cookie-first del v1). */
function cookieRefreshToken(request: FastifyRequest): string {
    const value = request.cookies[REFRESH_COOKIE_NAME];

    return typeof value === 'string' ? value : '';
}

/** `(bool)$b[$key]` estricto: solo el booleano JSON `true` cuenta. */
function bodyBoolean(body: unknown, key: string): boolean {
    if (typeof body !== 'object' || body === null) {
        return false;
    }

    return (body as Record<string, unknown>)[key] === true;
}

export function registerAuthRoutes(app: FastifyInstance, config: AppConfig, pool: Pool): void {
    app.post('/auth/register', async (request, reply) => {
        const result = await registerUser(app, pool, config, {
            username: bodyString(request.body, 'username'),
            password: bodyString(request.body, 'password'),
            ip: clientIp(request, config.trustProxy),
            consents: {
                acceptTerms: bodyBoolean(request.body, 'accept_terms'),
                acceptPrivacy: bodyBoolean(request.body, 'accept_privacy'),
                ageConfirmed: bodyBoolean(request.body, 'age_confirmed')
            }
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

    app.post('/auth/login', async (request, reply) => {
        const result = await loginUser(app, pool, config, {
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

    app.post('/auth/logout', async (request, reply) => {
        const token = cookieRefreshToken(request) || bodyString(request.body, 'refresh');

        await logoutSession(pool, token);
        reply.header('set-cookie', clearedRefreshCookieForRequest(config, request));

        return reply.send({ ok: true });
    });

    app.post('/auth/refresh', async (request, reply) => {
        const cookieToken = cookieRefreshToken(request);
        const token = cookieToken !== '' ? cookieToken : (bearerToken(request.headers.authorization) ?? '');
        const result = await refreshSession(app, pool, config, {
            token,
            ip: clientIp(request, config.trustProxy),
            userAgent: request.headers['user-agent'] ?? ''
        });

        if (!result.ok) {
            for (const [name, value] of Object.entries(result.headers)) {
                reply.header(name, value);
            }

            // Todo fallo de refresh (incluido 429) evicta la cookie stale.
            reply.header('set-cookie', clearedRefreshCookieForRequest(config, request));

            return reply.code(result.status).send(result.body);
        }

        reply.header('set-cookie', refreshCookieForRequest(config, request, result.refreshToken));

        return reply.send(result.body);
    });

    app.delete('/auth/account', { preHandler: requireAuth(app) }, async (request, reply) => {
        const authUser = request.authUser;

        if (authUser === null) {
            return reply.code(401).header('www-authenticate', 'Bearer').send({ ok: false, error: 'Necesitás iniciar sesión.' });
        }

        const result = await deleteAccount(pool, {
            userId: authUser.id,
            password: bodyString(request.body, 'password'),
            ip: clientIp(request, config.trustProxy)
        });

        if (!result.ok) {
            for (const [name, value] of Object.entries(result.headers)) {
                reply.header(name, value);
            }

            return reply.code(result.status).send(result.body);
        }

        reply.header('set-cookie', clearedRefreshCookieForRequest(config, request));

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
