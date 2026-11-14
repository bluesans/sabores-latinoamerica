/**
 * Entry point del backend Node (Fase 1).
 *
 * Carga y valida `backend/.env`, levanta Fastify en `PORT` (loopback: Apache
 * llega por ProxyPass) y cierra ordenadamente el pool MySQL al recibir
 * SIGINT/SIGTERM. El prefijo público lo aplica `createApp` con `BASE_PATH`.
 */
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { closePool, getPool } from './db/pool.js';
import { loggerOptions } from './http/logger.js';

const config = loadConfig();
// `warn`: errores sí, requests (URL/IP) no: el PHP tampoco los loguea.
const app = createApp({ config, db: getPool(), logger: loggerOptions });

async function shutdown(signal: string): Promise<void> {
    app.log.info({ signal }, 'cerrando backend');

    await app.close();
    await closePool();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
        void shutdown(signal);
    });
}

try {
    await app.listen({ port: config.port, host: '127.0.0.1' });
} catch (error) {
    app.log.error(error);
    process.exit(1);
}
