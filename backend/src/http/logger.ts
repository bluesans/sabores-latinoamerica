/** Opciones del logger de Fastify con redacción de headers/credenciales. */
export const LOGGER_REDACT_PATHS: string[] = ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]', '*.password', '*.passwd', '*.access', '*.refresh', '*.token', '*.secret'];

export const loggerOptions = {
    level: 'warn',
    redact: { paths: LOGGER_REDACT_PATHS, censor: '[REDACTED]' }
};
