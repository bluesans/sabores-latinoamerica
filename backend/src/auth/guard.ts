/**
 * Guard de autenticación Bearer en paridad con `AuthMiddleware.php` (todo 13).
 *
 * Envelope de middleware: `{ok:false,error}` SIN id, status 401 y
 * `WWW-Authenticate: Bearer`. El usuario queda en `request.authUser`.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { decodeAccessToken } from './jwt.js';

export type AuthUser = Readonly<{
    id: number;
    username: string;
    role: string;
}>;

declare module 'fastify' {
    interface FastifyRequest {
        authUser: AuthUser | null;
    }
}

/** Decora la request una sola vez por instancia. */
export function registerAuthGuard(app: FastifyInstance): void {
    app.decorateRequest('authUser', null);
}

/** `Auth::bearerToken`: `Bearer <token>` con [\w.-]+ (ASCII, como el PHP). */
export function bearerToken(header: string | undefined): string | null {
    if (header === undefined) {
        return null;
    }

    const match = /^Bearer\s+([\w\-.]+)$/.exec(header);

    return match?.[1] ?? null;
}

/** preHandler que exige un access token válido y puebla `request.authUser`. */
export function requireAuth(app: FastifyInstance): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
    return async (request, reply) => {
        const token = bearerToken(request.headers.authorization);
        const claims = token === null ? null : decodeAccessToken(app, token);

        if (claims === null) {
            await reply.code(401).header('www-authenticate', 'Bearer').send({ ok: false, error: 'Necesitás iniciar sesión.' });

            return;
        }

        request.authUser = { id: claims.sub, username: claims.name, role: claims.role };
    };
}
