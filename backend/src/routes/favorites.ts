/**
 * Favoritos en paridad con `FavoriteController` (todo 18).
 *
 * Toggle por truthiness de `add` (empty() de PHP), INSERT IGNORE/DELETE,
 * GET con JOIN y ORDER BY created_at DESC. Sin validaciones nuevas.
 */
import type { FastifyInstance } from 'fastify';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { requireAuth } from '../auth/guard.js';
import { positiveInt } from '../auth/validation.js';

function phpEmpty(value: unknown): boolean {
    if (value === null || value === undefined || value === false) {
        return true;
    }

    if (typeof value === 'number') {
        return value === 0;
    }

    if (typeof value === 'string') {
        return value === '' || value === '0';
    }

    if (Array.isArray(value)) {
        return value.length === 0;
    }

    if (typeof value === 'object') {
        return Object.keys(value as Record<string, unknown>).length === 0;
    }

    return false;
}

function bodyRecord(body: unknown): Record<string, unknown> {
    return body !== null && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

export function registerFavoriteRoutes(app: FastifyInstance, pool: Pool): void {
    app.get('/favorites', { preHandler: requireAuth(app) }, async (request, reply) => {
        const user = request.authUser;
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT r.id, r.name, r.difficulty, r.time_minutes, c.id AS country_id, c.name AS country_name, c.emoji
             FROM favorites f
             JOIN recipes r ON r.id = f.recipe_id
             JOIN countries c ON c.id = r.country_id
             WHERE f.user_id = ?
             ORDER BY f.created_at DESC`,
            [user?.id ?? 0]
        );

        return reply.send({
            ok: true,
            favorites: rows.map(row => ({
                id: Number(row['id']),
                name: String(row['name']),
                difficulty: row['difficulty'],
                time_minutes: row['time_minutes'] === null ? null : Number(row['time_minutes']),
                country_id: Number(row['country_id']),
                country_name: String(row['country_name']),
                emoji: row['emoji']
            }))
        });
    });

    app.post('/favorites', { preHandler: requireAuth(app) }, async (request, reply) => {
        const user = request.authUser ?? { id: 0 };
        const body = bodyRecord(request.body);
        const recipeId = positiveInt(body['recipe_id']);

        if (recipeId === null) {
            return reply.code(400).send({ ok: false, error: 'Identificador inválido.' });
        }

        const [recipes] = await pool.execute<RowDataPacket[]>('SELECT id FROM recipes WHERE id = ?', [recipeId]);

        if (recipes.length === 0) {
            return reply.code(404).send({ ok: false, error: 'Receta inexistente.' });
        }

        if (!phpEmpty(body['add'])) {
            await pool.execute('INSERT IGNORE INTO favorites (user_id, recipe_id) VALUES (?, ?)', [user.id, recipeId]);
        } else {
            await pool.execute('DELETE FROM favorites WHERE user_id = ? AND recipe_id = ?', [user.id, recipeId]);
        }

        return reply.send({ ok: true });
    });
}
