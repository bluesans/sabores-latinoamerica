/**
 * Redacción de logs: password/cookie/authorization nunca salen en claro
 * (todo 24, acceptance de compliance).
 */
import { describe, expect, it } from 'vitest';
import { loggerOptions } from '../src/http/logger.js';
import { redactSensitive, redactText } from '../src/http/redact.js';

const SECRETS = ['super-secret', 'Bearer abc.def', 'sdl_refresh=deadbeef', 'jwt-access', 'refresh-token', 'top-secret', 'hunter2'];

describe('redacción de logs', () => {
    it('enmascara claves sensibles en estructuras anidadas', () => {
        const input = {
            username: 'ada',
            password: 'super-secret',
            headers: { authorization: 'Bearer abc.def', cookie: 'sdl_refresh=deadbeef' },
            nested: { access: 'jwt-access', refresh: 'refresh-token', token: 'tok', secret: 'top-secret' },
            list: [{ password: 'hunter2' }]
        };
        const output = redactSensitive(input);
        const json = JSON.stringify(output);

        for (const secret of SECRETS) {
            expect(json).not.toContain(secret);
        }

        expect(json).toContain('[REDACTED]');
        expect(JSON.parse(json).username).toBe('ada');
    });

    it('enmascara credenciales en texto libre de errores', () => {
        const text = redactText('login failed password=hunter2 Authorization: Bearer abc.def cookie: sdl_refresh=deadbeef token=refresh-token');
        const output = text;

        for (const secret of SECRETS) {
            expect(output).not.toContain(secret);
        }

        expect(output).toContain('[REDACTED]');
    });

    it('el logger de Fastify declara redacción para headers y credenciales', () => {
        expect(loggerOptions.redact.paths).toContain('req.headers.authorization');
        expect(loggerOptions.redact.paths).toContain('req.headers.cookie');
        expect(loggerOptions.redact.paths).toContain('*.password');
        expect(loggerOptions.redact.censor).toBe('[REDACTED]');
    });
});
