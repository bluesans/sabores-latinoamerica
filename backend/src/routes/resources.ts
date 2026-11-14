/**
 * Recursos públicos en paridad con los controllers PHP (todo 17).
 *
 * Todas las rutas van detrás de AuthMiddleware. SQL, orden y shapes son
 * copia 1:1 del v1; los enteros se castean a number (mysql2 ya los devuelve
 * así, pero se normaliza para no depender del driver).
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { requireAuth } from '../auth/guard.js';
import { positiveInt } from '../auth/validation.js';

const LIKE_ESCAPE = "ESCAPE '\\\\'";

type IdParams = { id: string };
type Query = Record<string, unknown>;

function emptySearch(): { ok: true; countries: never[]; recipes: never[]; ingredients: never[] } {
    return { ok: true, countries: [], recipes: [], ingredients: [] };
}

function searchQuery(request: FastifyRequest): string {
    const raw = (request.query as Query)['q'];

    return typeof raw === 'string' ? raw.trim() : '';
}

function queryValue(request: FastifyRequest, key: string): unknown {
    return (request.query as Query)[key];
}

/** `ceil(total/perPage)` con el piso de 1 y el caso sin per_page del PHP. */
function totalPages(total: number, perPage: number): number {
    if (perPage <= 0) {
        return 1;
    }

    return Math.max(1, Math.ceil(total / perPage));
}

export function registerResourceRoutes(app: FastifyInstance, pool: Pool): void {
    app.get('/countries', { preHandler: requireAuth(app) }, async (_request, reply) => {
        // Columnas agrupadas = ONLY_FULL_GROUP_BY-safe en MySQL y MariaDB.
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT c.id, c.iso_code, c.name, c.emoji, c.tagline, COUNT(r.id) AS recipe_count
             FROM countries c
             LEFT JOIN recipes r ON r.country_id = c.id
             GROUP BY c.id, c.iso_code, c.name, c.emoji, c.tagline
             ORDER BY c.id`
        );

        return reply.send({
            ok: true,
            countries: rows.map(row => ({
                id: Number(row['id']),
                iso_code: Number(row['iso_code']),
                name: String(row['name']),
                emoji: row['emoji'],
                tagline: row['tagline'],
                recipe_count: Number(row['recipe_count'])
            }))
        });
    });

    app.get<{ Params: IdParams }>('/countries/:id(^\\d+$)/recipes', { preHandler: requireAuth(app) }, async (request, reply) => {
        const countryId = positiveInt(request.params.id);

        if (countryId === null) {
            return reply.code(400).send({ ok: false, error: 'Identificador inválido.' });
        }

        const pageRaw = queryValue(request, 'page');
        let page = 1;

        if (pageRaw !== undefined) {
            const parsed = positiveInt(pageRaw);

            if (parsed === null) {
                return reply.code(400).send({ ok: false, error: 'Parámetro page inválido.' });
            }

            page = parsed;
        }

        const perPageRaw = queryValue(request, 'per_page');
        let perPage = 0;

        if (perPageRaw !== undefined) {
            const parsed = positiveInt(perPageRaw);

            if (parsed === null || parsed > 100) {
                return reply.code(400).send({ ok: false, error: 'Parámetro per_page inválido.' });
            }

            perPage = parsed;
        }

        const [countryRows] = await pool.execute<RowDataPacket[]>('SELECT id, name, emoji, tagline FROM countries WHERE id = ?', [countryId]);
        const country = countryRows[0];

        if (country === undefined) {
            return reply.code(404).send({ ok: false, error: 'País no encontrado.' });
        }

        const [totalRows] = await pool.execute<RowDataPacket[]>('SELECT COUNT(*) AS total FROM recipes WHERE country_id = ?', [countryId]);
        const total = Number(totalRows[0]?.['total'] ?? 0);

        let recipes: RowDataPacket[];

        if (perPage > 0) {
            const offset = (page - 1) * perPage;
            const [rows] = await pool.execute<RowDataPacket[]>(
                `SELECT id, name, description, difficulty, time_minutes, youtube_id
                 FROM recipes WHERE country_id = ? ORDER BY id LIMIT ? OFFSET ?`,
                [countryId, perPage, offset]
            );
            recipes = rows;
        } else {
            const [rows] = await pool.execute<RowDataPacket[]>(
                `SELECT id, name, description, difficulty, time_minutes, youtube_id
                 FROM recipes WHERE country_id = ? ORDER BY id`,
                [countryId]
            );
            recipes = rows;
        }

        const byRecipe = new Map<number, Array<{ id: number; name: string }>>();

        if (recipes.length > 0) {
            const ids = recipes.map(recipe => Number(recipe['id']));
            const placeholders = ids.map(() => '?').join(',');
            const [ingredientRows] = await pool.execute<RowDataPacket[]>(
                `SELECT ri.recipe_id, i.id, i.name
                 FROM recipe_ingredient ri
                 JOIN ingredients i ON i.id = ri.ingredient_id
                 WHERE ri.recipe_id IN (${placeholders})
                 ORDER BY i.name`,
                ids
            );

            for (const row of ingredientRows) {
                const recipeId = Number(row['recipe_id']);
                const list = byRecipe.get(recipeId) ?? [];

                list.push({ id: Number(row['id']), name: String(row['name']) });
                byRecipe.set(recipeId, list);
            }
        }

        return reply.send({
            ok: true,
            country: {
                id: Number(country['id']),
                name: String(country['name']),
                emoji: country['emoji'],
                tagline: country['tagline']
            },
            recipes: recipes.map(recipe => ({
                id: Number(recipe['id']),
                name: String(recipe['name']),
                description: recipe['description'],
                difficulty: recipe['difficulty'],
                time_minutes: recipe['time_minutes'] === null ? null : Number(recipe['time_minutes']),
                youtube_id: recipe['youtube_id'],
                ingredients: byRecipe.get(Number(recipe['id'])) ?? []
            })),
            pagination: {
                page,
                per_page: perPage > 0 ? perPage : total,
                total,
                total_pages: totalPages(total, perPage)
            }
        });
    });

    app.get('/stats', { preHandler: requireAuth(app) }, async (_request, reply) => {
        // Misma matemática que v_estadisticas, inline (no depende de la vista).
        const [statsRows] = await pool.query<RowDataPacket[]>(
            `SELECT
                (SELECT COUNT(DISTINCT country_id) FROM recipes) AS paises_con_recetas,
                (SELECT COUNT(*) FROM recipes) AS total_recetas,
                (SELECT COUNT(*) FROM ingredients) AS ingredientes_distintos,
                (SELECT COUNT(*) FROM recipes WHERE youtube_id IS NOT NULL AND youtube_id <> '') AS recetas_con_video`
        );
        const stats = statsRows[0];

        const [top] = await pool.query<RowDataPacket[]>(
            `SELECT i.id, i.name, COUNT(*) AS uses
             FROM recipe_ingredient ri
             JOIN ingredients i ON i.id = ri.ingredient_id
             GROUP BY i.id, i.name
             ORDER BY uses DESC, i.name
             LIMIT 8`
        );

        return reply.send({
            ok: true,
            stats: {
                paises_con_recetas: Number(stats?.['paises_con_recetas'] ?? 0),
                total_recetas: Number(stats?.['total_recetas'] ?? 0),
                ingredientes_distintos: Number(stats?.['ingredientes_distintos'] ?? 0),
                recetas_con_video: Number(stats?.['recetas_con_video'] ?? 0)
            },
            top_ingredients: top.map(row => ({ id: Number(row['id']), name: String(row['name']), uses: Number(row['uses']) }))
        });
    });

    app.get<{ Params: IdParams }>('/ingredients/:id(^\\d+$)', { preHandler: requireAuth(app) }, async (request, reply) => {
        const id = positiveInt(request.params.id);

        if (id === null) {
            return reply.code(400).send({ ok: false, error: 'Identificador inválido.' });
        }

        const [ingredientRows] = await pool.execute<RowDataPacket[]>('SELECT id, name FROM ingredients WHERE id = ?', [id]);
        const ingredient = ingredientRows[0];

        if (ingredient === undefined) {
            return reply.code(404).send({ ok: false, error: 'Ingrediente no encontrado.' });
        }

        const [recipes] = await pool.execute<RowDataPacket[]>(
            `SELECT r.id AS recipe_id, r.name AS recipe_name, r.difficulty,
                    c.id AS country_id, c.name AS country_name, c.emoji
             FROM recipe_ingredient ri
             JOIN recipes r ON r.id = ri.recipe_id
             JOIN countries c ON c.id = r.country_id
             WHERE ri.ingredient_id = ?
             ORDER BY c.name, r.name`,
            [id]
        );

        return reply.send({
            ok: true,
            ingredient: { id: Number(ingredient['id']), name: String(ingredient['name']) },
            recipes: recipes.map(row => ({
                recipe_id: Number(row['recipe_id']),
                recipe_name: String(row['recipe_name']),
                difficulty: row['difficulty'],
                country_id: Number(row['country_id']),
                country_name: String(row['country_name']),
                emoji: row['emoji']
            }))
        });
    });

    app.get('/search', { preHandler: requireAuth(app) }, async (request, reply) => {
        let q = searchQuery(request);
        const chars = Array.from(q);

        if (chars.length < 2) {
            return reply.send(emptySearch());
        }

        // Cap silencioso de queries gigantes antes de armar los LIKE.
        if (chars.length > 100) {
            q = chars.slice(0, 100).join('');
        }

        // addcslashes($q, '\\%_'): backslash primero, luego % y _.
        const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;

        const [countries] = await pool.execute<RowDataPacket[]>(
            `SELECT id, name, emoji FROM countries
             WHERE name LIKE ? ${LIKE_ESCAPE} AND id IN (SELECT DISTINCT country_id FROM recipes)
             ORDER BY name, id LIMIT 4`,
            [like]
        );

        const [recipes] = await pool.execute<RowDataPacket[]>(
            `SELECT r.id, r.name, c.id AS country_id, c.name AS country_name, c.emoji
             FROM recipes r JOIN countries c ON c.id = r.country_id
             WHERE r.name LIKE ? ${LIKE_ESCAPE} OR r.description LIKE ? ${LIKE_ESCAPE}
             ORDER BY r.id LIMIT 6`,
            [like, like]
        );

        const [ingredients] = await pool.execute<RowDataPacket[]>(
            `SELECT i.id, i.name, COUNT(ri.recipe_id) AS uses
             FROM ingredients i LEFT JOIN recipe_ingredient ri ON ri.ingredient_id = i.id
             WHERE i.name LIKE ? ${LIKE_ESCAPE}
             GROUP BY i.id, i.name ORDER BY uses DESC, i.name, i.id LIMIT 4`,
            [like]
        );

        return reply.send({
            ok: true,
            countries: countries.map(row => ({ id: Number(row['id']), name: String(row['name']), emoji: row['emoji'] })),
            recipes: recipes.map(row => ({
                id: Number(row['id']),
                name: String(row['name']),
                country_id: Number(row['country_id']),
                country_name: String(row['country_name']),
                emoji: row['emoji']
            })),
            ingredients: ingredients.map(row => ({ id: Number(row['id']), name: String(row['name']), uses: Number(row['uses']) }))
        });
    });
}
