/**
 * Núcleo JWT en paridad con `api/src/Support/Jwt.php` (todo 9).
 *
 * Contrato exacto del v1:
 * - HS256 (`alg` en el header), payload `{sub,name,role,token_type:'access',iat,exp}`;
 *   sin `iss`/`aud` ni claims extra;
 * - `iat` obligatorio y no más de 10s en el futuro; `exp` con 10s de leeway;
 * - `token_type` ausente equivale a `access`; cualquier otro valor se rechaza;
 * - firma inválida, header con otro algoritmo o token mal formado -> null.
 *
 * @fastify/jwt solo verifica firma/algoritmo: las reglas de tiempo y de
 * claims se aplican acá con la misma semántica del PHP. fast-jwt mide
 * `clockTolerance` en milisegundos, valida `nbf` (que el PHP ignora) y trata
 * los bordes de `exp` distinto, por eso se desactivan sus validadores.
 */
import jwtPlugin from '@fastify/jwt';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config.js';

export const JWT_ALGORITHM = 'HS256';
export const JWT_LEEWAY_SECONDS = 10;
export const ACCESS_TOKEN_TYPE = 'access';

export type TokenUser = Readonly<{
    id: number;
    username: string;
    role: string;
}>;

export type AccessClaims = Readonly<{
    sub: number;
    name: string;
    role: string;
    token_type: typeof ACCESS_TOKEN_TYPE;
    iat: number;
    exp: number;
}>;

/** `(int)` de PHP: trunca y cae a 0 si el valor no es numérico. */
function phpInt(value: unknown): number {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? Math.trunc(value) : 0;
    }

    const parsed = Number.parseInt(typeof value === 'string' ? value : String(value ?? ''), 10);

    return Number.isFinite(parsed) ? parsed : 0;
}

/** `is_numeric($value) ? (int) $value : null` de PHP (para `iat`). */
function phpNumericInt(value: unknown): number | null {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? Math.trunc(value) : null;
    }

    if (typeof value !== 'string' || value.trim() === '') {
        return null;
    }

    const numeric = Number(value);

    return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
}

/** Registra `app.jwt`; firma HS256 y verificación de firma únicamente. */
export function registerJwt(app: FastifyInstance, config: AppConfig): void {
    app.register(jwtPlugin, {
        secret: config.jwtSecret,
        sign: { algorithm: JWT_ALGORITHM },
        verify: {
            algorithms: [JWT_ALGORITHM],
            // exp/iat/nbf los valida decodeAccessToken con las reglas del PHP.
            ignoreExpiration: true,
            ignoreNotBefore: true
        }
    });
}

/** Emite un access token con los claims y la vigencia EXACTOS de `issueAccess`. */
export function issueAccessToken(app: FastifyInstance, user: TokenUser, ttlSeconds: number): string {
    if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
        throw new Error('JWT_TTL debe ser un entero positivo.');
    }

    const iat = Math.floor(Date.now() / 1000);

    return app.jwt.sign({
        sub: user.id,
        name: user.username,
        role: user.role,
        token_type: ACCESS_TOKEN_TYPE,
        iat,
        exp: iat + ttlSeconds
    });
}

/**
 * Verifica firma y algoritmo con @fastify/jwt y devuelve el payload como
 * mapa, o `null` ante cualquier token inválido.
 */
function verifiedPayload(app: FastifyInstance, token: string): Record<string, unknown> | null {
    try {
        const payload = app.jwt.verify<Record<string, unknown>>(token);

        return typeof payload === 'object' && payload !== null ? payload : null;
    } catch {
        return null;
    }
}

/**
 * Decodifica un access token con la misma tolerancia y reglas del PHP.
 * Devuelve `null` ante cualquier token inválido (nunca lanza).
 */
export function decodeAccessToken(app: FastifyInstance, token: string): AccessClaims | null {
    const claims = verifiedPayload(app, token);

    if (claims === null) {
        return null;
    }

    const iat = phpNumericInt(claims['iat']);

    if (iat === null) {
        return null;
    }

    // (int) del PHP: exp ausente o basura cae a 0 y queda vencido.
    const exp = phpInt(claims['exp']);
    const now = Math.floor(Date.now() / 1000);

    // Mismos bordes que Jwt::decode: exp < now-10 y iat > now+10 se rechazan.
    if (exp < now - JWT_LEEWAY_SECONDS) {
        return null;
    }

    if (iat > now + JWT_LEEWAY_SECONDS) {
        return null;
    }

    if ((claims['token_type'] ?? ACCESS_TOKEN_TYPE) !== ACCESS_TOKEN_TYPE) {
        return null;
    }

    return {
        sub: phpInt(claims['sub']),
        name: String(claims['name'] ?? ''),
        role: String(claims['role'] ?? 'user'),
        token_type: ACCESS_TOKEN_TYPE,
        iat,
        exp
    };
}
