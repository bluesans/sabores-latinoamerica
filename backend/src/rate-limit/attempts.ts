/**
 * Rate limiting por base de datos en paridad con `api/src/Support/Auth.php`
 * (todo 11). Sin @fastify/rate-limit: los intentos viven en
 * `login_attempts` y se cuentan por IP + acción + ventana, igual que el v1.
 *
 * Umbrales EXACTOS del PHP:
 * - login:    10 intentos / 5 min
 * - register:  5 intentos / 15 min
 * - refresh:  10 intentos / 5 min
 *
 * `checkRateDetails` purga los intentos de más de 1 hora en cada chequeo,
 * y `retryAfter` es el tiempo hasta que el intento más viejo de la ventana
 * cumple el plazo (mínimo 1s), tal como `ceil(oldest + window - time())`.
 */

import type { FastifyRequest } from 'fastify';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { AppConfig } from '../config.js';

export type RateLimitExecutor = Pick<PoolConnection, 'execute'>;

export type RateLimitAction = 'login' | 'register' | 'refresh' | 'delete';

export type RateLimitResult = Readonly<{
    allowed: boolean;
    retryAfter: number;
}>;

type RateLimitRule = Readonly<{
    maxAttempts: number;
    windowMinutes: number;
    message: string;
}>;

type RateRow = RowDataPacket & {
    oldest: string | null;
    total: number;
};

export const RATE_LIMITS: Readonly<Record<RateLimitAction, RateLimitRule>> = {
    login: { maxAttempts: 10, windowMinutes: 5, message: 'Demasiados intentos. Esperá unos minutos.' },
    register: { maxAttempts: 5, windowMinutes: 15, message: 'Demasiados registros desde esta conexión. Esperá unos minutos.' },
    refresh: { maxAttempts: 10, windowMinutes: 5, message: 'Demasiados intentos. Esperá unos minutos.' },
    delete: { maxAttempts: 5, windowMinutes: 15, message: 'Demasiados intentos. Esperá unos minutos.' }
};

/** Mensaje de paridad para el 429 de la acción. */
export function rateLimitMessage(action: RateLimitAction): string {
    return RATE_LIMITS[action].message;
}

/** Borra intentos de más de 1 hora (misma estrategia que el PHP). */
async function purgeOldAttempts(executor: RateLimitExecutor): Promise<void> {
    await executor.execute('DELETE FROM login_attempts WHERE attempted_at < DATE_SUB(NOW(), INTERVAL 1 HOUR)');
}

/**
 * Chequeo de cuota con hint de reintento.
 *
 * Se purga primero y se cuenta lo que cae dentro de la ventana. Si el
 * conteo alcanzó el máximo, `retryAfter` es el tiempo hasta que el intento
 * más viejo deje la ventana (nunca menor a 1s).
 */
export async function checkRateDetails(executor: RateLimitExecutor, ip: string, action: RateLimitAction): Promise<RateLimitResult> {
    const rule = RATE_LIMITS[action];

    await purgeOldAttempts(executor);

    const [rows] = await executor.execute<RateRow[]>(
        `SELECT MIN(attempted_at) AS oldest, COUNT(*) AS total
         FROM login_attempts
         WHERE ip = ? AND action = ? AND attempted_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
        [ip, action, rule.windowMinutes]
    );

    const total = Number(rows[0]?.total ?? 0);

    if (total < rule.maxAttempts) {
        return { allowed: true, retryAfter: 0 };
    }

    const oldestRaw = rows[0]?.oldest;
    const oldestSeconds = oldestRaw === null || oldestRaw === undefined ? Number.NaN : Math.floor(Date.parse(String(oldestRaw).replace(' ', 'T')) / 1000);
    const windowSeconds = rule.windowMinutes * 60;
    const retryAfter = Number.isFinite(oldestSeconds) ? Math.ceil(oldestSeconds + windowSeconds - Math.floor(Date.now() / 1000)) : windowSeconds;

    return { allowed: false, retryAfter: Math.max(1, retryAfter) };
}

/** trim + mb_substr(30) del PHP. */
function normalizeUsername(username: string): string {
    return Array.from(username.trim()).slice(0, 30).join('');
}

/** Inserta un intento con la acción indicada. */
export async function recordAttempt(executor: RateLimitExecutor, ip: string, username: string, action: RateLimitAction): Promise<void> {
    await executor.execute('INSERT INTO login_attempts (ip, username, action) VALUES (?, ?, ?)', [ip, normalizeUsername(username), action]);
}

export function checkLoginRateDetails(executor: RateLimitExecutor, ip: string): Promise<RateLimitResult> {
    return checkRateDetails(executor, ip, 'login');
}

export function checkRegisterRateDetails(executor: RateLimitExecutor, ip: string): Promise<RateLimitResult> {
    return checkRateDetails(executor, ip, 'register');
}

export function checkRefreshRateDetails(executor: RateLimitExecutor, ip: string): Promise<RateLimitResult> {
    return checkRateDetails(executor, ip, 'refresh');
}

export function checkDeleteRateDetails(executor: RateLimitExecutor, ip: string): Promise<RateLimitResult> {
    return checkRateDetails(executor, ip, 'delete');
}

export function recordFailedLogin(executor: RateLimitExecutor, ip: string, username: string): Promise<void> {
    return recordAttempt(executor, ip, username, 'login');
}

export function recordRegisterAttempt(executor: RateLimitExecutor, ip: string, username: string): Promise<void> {
    return recordAttempt(executor, ip, username, 'register');
}

export function recordFailedRefresh(executor: RateLimitExecutor, ip: string): Promise<void> {
    return recordAttempt(executor, ip, '', 'refresh');
}

export function recordDeleteAttempt(executor: RateLimitExecutor, ip: string, username: string): Promise<void> {
    return recordAttempt(executor, ip, username, 'delete');
}

/**
 * IP del cliente con la política del PHP (`AuthController::ip`):
 * - `TRUST_PROXY=0` (default): `socket.remoteAddress`, XFF IGNORADO;
 * - con TRUST_PROXY configurado: Fastify ya validó el proxy y `request.ip`
 *   refleja `X-Forwarded-For`;
 * - `::1` se normaliza a `127.0.0.1` y sin dato se usa `'cli'`, igual que el v1.
 */
export function clientIp(request: Pick<FastifyRequest, 'ip' | 'socket'>, trustProxy: AppConfig['trustProxy']): string {
    const raw = trustProxy === false ? (request.socket.remoteAddress ?? 'cli') : request.ip || 'cli';

    return raw === '::1' ? '127.0.0.1' : raw;
}
