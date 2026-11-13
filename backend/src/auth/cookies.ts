/**
 * Cookie de refresh en paridad con `api/src/Support/Cookies.php` (todo 9).
 *
 * Formato exacto (mismo orden y atributos):
 * `sdl_refresh=<token>; Path=<cookiePath>; Max-Age=<SESSION_DAYS*86400>;
 *  HttpOnly; SameSite=Strict[; Expires=Thu, 01 Jan 1970 00:00:00 GMT][; Secure]`
 *
 * `COOKIE_SECURE=auto` marca Secure si la request llegó por HTTPS, directo o
 * con `X-Forwarded-Proto: https` (el PHP confía en ese header siempre).
 */
import type { FastifyRequest } from 'fastify';
import type { AppConfig } from '../config.js';

export const REFRESH_COOKIE_NAME = 'sdl_refresh';
export const COOKIE_CLEAR_EXPIRES = 'Thu, 01 Jan 1970 00:00:00 GMT';

function buildRefreshCookie(config: AppConfig, value: string, maxAge: number, secure: boolean): string {
    const parts = [`${REFRESH_COOKIE_NAME}=${value}`, `Path=${config.cookiePath}`, `Max-Age=${maxAge}`, 'HttpOnly', 'SameSite=Strict'];

    if (maxAge <= 0) {
        // Max-Age=0 basta en clientes modernos; Expires pasado cubre viejos.
        parts.push(`Expires=${COOKIE_CLEAR_EXPIRES}`);
    }

    if (secure) {
        parts.push('Secure');
    }

    return parts.join('; ');
}

/** Set-Cookie de emisión: token crudo + Max-Age de SESSION_DAYS. */
export function refreshCookie(config: AppConfig, rawToken: string, secure: boolean): string {
    return buildRefreshCookie(config, rawToken, config.sessionDays * 86400, secure);
}

/** Set-Cookie de borrado: valor vacío, Max-Age=0 y Expires epoch. */
export function clearedRefreshCookie(config: AppConfig, secure: boolean): string {
    return buildRefreshCookie(config, '', 0, secure);
}

/** HTTPS real o `X-Forwarded-Proto: https` (misma regla que Cookies::secure). */
export function requestIsHttps(request: Pick<FastifyRequest, 'protocol' | 'headers'>): boolean {
    if (request.protocol === 'https') {
        return true;
    }

    const forwarded = request.headers['x-forwarded-proto'];
    const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;

    return value?.toLowerCase() === 'https';
}

/** Resuelve `COOKIE_SECURE`: '1'/'0' fuerzan; 'auto' mira la request. */
export function cookieSecureForRequest(config: AppConfig, request: Pick<FastifyRequest, 'protocol' | 'headers'>): boolean {
    if (config.cookieSecure === '1') {
        return true;
    }

    if (config.cookieSecure === '0') {
        return false;
    }

    return requestIsHttps(request);
}

/** Set-Cookie de emisión con el Secure resuelto desde la request. */
export function refreshCookieForRequest(config: AppConfig, request: Pick<FastifyRequest, 'protocol' | 'headers'>, rawToken: string): string {
    return refreshCookie(config, rawToken, cookieSecureForRequest(config, request));
}

/** Set-Cookie de borrado con el Secure resuelto desde la request. */
export function clearedRefreshCookieForRequest(config: AppConfig, request: Pick<FastifyRequest, 'protocol' | 'headers'>): string {
    return clearedRefreshCookie(config, cookieSecureForRequest(config, request));
}
