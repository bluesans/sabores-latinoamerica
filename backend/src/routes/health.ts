/**
 * `GET /health` en paridad con `api/src/Controllers/HealthController.php`.
 *
 * Shape EXACTO del fixture `tests/fixtures/php/health.json`:
 * `{ok,api,db,time}`; `ok`/`db` reflejan el `SELECT 1`, y el status es
 * 200 con DB arriba o 503 con DB caída (el PHP también devuelve `ok:false`).
 *
 * `time` usa el formato `DateTimeInterface::format('c')` del PHP
 * (`YYYY-MM-DDTHH:MM:SS+00:00`, sin milisegundos).
 */
import type { FastifyInstance } from 'fastify';

/** Handle mínimo de DB: el pool real de mysql2 o un stub de test. */
export type HealthDatabase = {
    query(sql: string): Promise<unknown>;
};

/** Timestamp UTC con el formato `c` de PHP. */
export function utcTimestamp(now: Date = new Date()): string {
    return now.toISOString().replace(/\.\d{3}Z$/, '+00:00');
}

export function registerHealthRoutes(app: FastifyInstance, db: HealthDatabase): void {
    app.get('/health', async (_request, reply) => {
        let dbOk = false;

        try {
            await db.query('SELECT 1');
            dbOk = true;
        } catch {
            dbOk = false;
        }

        return reply.code(dbOk ? 200 : 503).send({
            ok: dbOk,
            api: true,
            db: dbOk,
            time: utcTimestamp()
        });
    });
}
