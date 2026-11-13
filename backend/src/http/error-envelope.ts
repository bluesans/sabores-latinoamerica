/**
 * Envelopes de error del backend Node, en paridad con el v1 PHP.
 *
 * Fuente de verdad: `api/src/Middleware/JsonErrorHandler.php` +
 * `api/src/Middleware/AuthMiddleware.php`:
 * - errores globales (ruteo y excepciones no controladas):
 *   `{ok:false,error,id}` con id de 16 hex y log `[api-error <id>]`;
 * - APP_DEBUG=1 agrega los campos de detalle del PHP (exception/message/
 *   file/line); APP_DEBUG=0 no filtra nada;
 * - textos EXACTOS del PHP, sin inventar mensajes.
 */
import { randomBytes } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import { type AppConfig, isDebug } from '../config.js';

/** `JsonErrorHandler`: ruta sin match. */
export const NOT_FOUND_MESSAGE = 'Ruta no encontrada.';
/** `JsonErrorHandler`: statusCode de ruta existente con otro método. */
export const METHOD_NOT_ALLOWED_MESSAGE = 'Método HTTP no permitido.';
/** `JsonErrorHandler`: cualquier excepción sin status 4xx propio. */
export const INTERNAL_ERROR_MESSAGE = 'Error interno del servidor.';
/** `JsonErrorHandler`: 4xx genérico con APP_DEBUG=0. */
export const REQUEST_ERROR_MESSAGE = 'Error en la solicitud.';

/** Forma del envelope global. */
export type ApiErrorPayload = {
    ok: false;
    error: string;
    id: string;
    exception?: string;
    message?: string;
    file?: string;
    line?: number;
};

/** Error sintético de ruteo, con el nombre de la excepción equivalente de Slim. */
export function httpRoutingError(name: 'HttpNotFoundException' | 'HttpMethodNotAllowedException', statusCode: 404 | 405): Error {
    const error = new Error(statusCode === 404 ? NOT_FOUND_MESSAGE : METHOD_NOT_ALLOWED_MESSAGE);
    error.name = name;

    return Object.assign(error, { statusCode });
}

/** Id aleatorio de 16 hex, igual a `bin2hex(random_bytes(8))` del PHP. */
export function newErrorId(): string {
    return randomBytes(8).toString('hex');
}

/**
 * Status del envelope global: usa `statusCode` solo si es un 4xx/5xx válido;
 * cualquier otra cosa cae en 500 (misma rama que `JsonErrorHandler`).
 */
export function resolveErrorStatus(error: Error): number {
    const status = (error as Error & { statusCode?: unknown }).statusCode;

    return typeof status === 'number' && status >= 400 && status <= 599 ? status : 500;
}

/** Texto del envelope con la precedencia exacta de `JsonErrorHandler`. */
export function resolveErrorMessage(error: Error, status: number, config: AppConfig): string {
    if (status === 404) {
        return NOT_FOUND_MESSAGE;
    }

    if (status === 405) {
        return METHOD_NOT_ALLOWED_MESSAGE;
    }

    if (status >= 400 && status < 500) {
        return isDebug(config) ? error.message : REQUEST_ERROR_MESSAGE;
    }

    return INTERNAL_ERROR_MESSAGE;
}

/** Primer frame del stack (`file:line`), como `getFile()`/`getLine()` del PHP. */
export function resolveErrorLocation(error: Error): { file: string; line: number } {
    const frame = error.stack?.split('\n').find(entry => entry.trimStart().startsWith('at '));

    if (frame === undefined) {
        return { file: 'unknown', line: 0 };
    }

    const match = /^\s*at (?:.*? \()?(.+?):(\d+):\d+\)?$/.exec(frame);

    if (match === null || match[1] === undefined || match[2] === undefined) {
        return { file: 'unknown', line: 0 };
    }

    return { file: match[1], line: Number(match[2]) };
}

/** Arma el payload global y escribe el log con el MISMO id del body. */
export function buildErrorPayload(error: Error, status: number, config: AppConfig, logger: FastifyBaseLogger): ApiErrorPayload {
    const id = newErrorId();
    const location = resolveErrorLocation(error);

    logger.error(`[api-error ${id}] ${error.name}: ${error.message} in ${location.file}:${location.line}`);

    const payload: ApiErrorPayload = {
        ok: false,
        error: resolveErrorMessage(error, status, config),
        id
    };

    if (isDebug(config)) {
        payload.exception = error.name;
        payload.message = error.message;
        payload.file = location.file;
        payload.line = location.line;
    }

    return payload;
}
