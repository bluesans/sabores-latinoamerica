/**
 * Rutas de administración en paridad con `AdminController` (todo 19).
 *
 * Guards: AuthMiddleware (401) + AdminMiddleware (403 "Solo administradores.").
 * Quirks conservados: DELETE /admin/recipes/:id castea con (int) PHP
 * ('12abc' -> 12, 'abc' -> 0 -> 404); countries/ingredients usan positiveInt.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { requireAuth } from '../auth/guard.js';
import { difficulty, positiveInt, youtubeId } from '../auth/validation.js';
import { redactText } from '../http/redact.js';

type IdParams = { id: string };

function requireAdmin(): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
    return async (request, reply) => {
        if (request.authUser === null) {
            await reply.code(401).send({ ok: false, error: 'Autenticación requerida.' });

            return;
        }

        if (request.authUser.role !== 'admin') {
            await reply.code(403).send({ ok: false, error: 'Solo administradores.' });

            return;
        }
    };
}

function bodyRecord(body: unknown): Record<string, unknown> {
    return body !== null && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

/** `(int)` de PHP para el arg de ruta: prefijo numérico, resto 0. */
function phpInt(value: unknown): number {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? Math.trunc(value) : 0;
    }

    if (typeof value === 'boolean') {
        return value ? 1 : 0;
    }

    if (typeof value === 'string') {
        const match = /^\s*[+-]?\d+/.exec(value);

        return match === null ? 0 : Number(match[0]);
    }

    return 0;
}

function bodyString(value: unknown): string {
    if (value === null || value === undefined) {
        return '';
    }

    if (typeof value === 'boolean') {
        return value ? '1' : '';
    }

    if (Array.isArray(value) || typeof value === 'object') {
        return 'Array';
    }

    return String(value);
}

function mbLength(value: string): number {
    return Array.from(value).length;
}

function phpTrim(value: string): string {
    return value.trim();
}

function timeMinutes(value: unknown): number | null | undefined {
    if (value === null || value === undefined || bodyString(value) === '') {
        return null;
    }

    let parsed: number | false;

    if (typeof value === 'number' && Number.isInteger(value)) {
        parsed = value;
    } else if (typeof value === 'string' && /^-?\d+$/.test(phpTrim(value))) {
        parsed = Number(phpTrim(value));
    } else {
        parsed = false;
    }

    if (parsed === false || parsed < 0 || parsed > 100000) {
        return undefined;
    }

    return parsed;
}

export function registerAdminRoutes(app: FastifyInstance, pool: Pool): void {
    const guards = { preHandler: [requireAuth(app), requireAdmin()] };

    app.get('/admin/data', guards, async (_request, reply) => {
        const [recipes] = await pool.query<RowDataPacket[]>(
            `SELECT r.id, r.country_id, r.name, r.description, r.difficulty, r.time_minutes, r.youtube_id, c.name AS country_name
             FROM recipes r JOIN countries c ON c.id = r.country_id
             ORDER BY c.id, r.id`
        );
        const [links] = await pool.query<RowDataPacket[]>(
            `SELECT ri.recipe_id, i.name FROM recipe_ingredient ri
             JOIN ingredients i ON i.id = ri.ingredient_id ORDER BY i.name`
        );
        const [countries] = await pool.query<RowDataPacket[]>('SELECT id, name, emoji, tagline FROM countries ORDER BY id');
        const [ingredients] = await pool.query<RowDataPacket[]>(
            `SELECT i.id, i.name, COUNT(ri.recipe_id) AS uses FROM ingredients i
             LEFT JOIN recipe_ingredient ri ON ri.ingredient_id = i.id GROUP BY i.id, i.name ORDER BY i.name`
        );

        const byRecipe = new Map<number, string[]>();
        const indexById = new Map<number, number>();

        recipes.forEach((recipe, index) => {
            indexById.set(Number(recipe['id']), index);
            byRecipe.set(Number(recipe['id']), []);
        });

        for (const row of links) {
            const rid = Number(row['recipe_id']);
            const list = byRecipe.get(rid);

            if (list !== undefined && indexById.has(rid)) {
                list.push(String(row['name']));
            }
        }

        return reply.send({
            ok: true,
            recipes: recipes.map(recipe => ({
                id: Number(recipe['id']),
                country_id: Number(recipe['country_id']),
                name: String(recipe['name']),
                description: recipe['description'],
                difficulty: recipe['difficulty'],
                time_minutes: recipe['time_minutes'] === null ? null : Number(recipe['time_minutes']),
                youtube_id: recipe['youtube_id'],
                country_name: String(recipe['country_name']),
                ingredients: byRecipe.get(Number(recipe['id'])) ?? []
            })),
            countries: countries.map(country => ({
                id: Number(country['id']),
                name: String(country['name']),
                emoji: country['emoji'],
                tagline: country['tagline']
            })),
            ingredients: ingredients.map(ingredient => ({
                id: Number(ingredient['id']),
                name: String(ingredient['name']),
                uses: Number(ingredient['uses'])
            }))
        });
    });

    app.post('/admin/recipes', guards, async (request, reply) => {
        const body = bodyRecord(request.body);
        const name = phpTrim(body['name'] === null || body['name'] === undefined ? '' : bodyString(body['name']));
        const errors: Record<string, string> = {};

        if (name === '') {
            errors['name'] = 'El nombre es obligatorio.';
        } else if (mbLength(name) > 200) {
            errors['name'] = 'El nombre no puede superar los 200 caracteres.';
        }

        const countryId = positiveInt(body['country_id']);

        if (countryId === null) {
            errors['country_id'] = 'País inválido.';
        } else {
            const [rows] = await pool.execute<RowDataPacket[]>('SELECT 1 FROM countries WHERE id = ?', [countryId]);

            if (rows.length === 0) {
                errors['country_id'] = 'País inválido.';
            }
        }

        const rawDifficulty = body['difficulty'];
        let normalizedDifficulty: string | null = null;

        if (rawDifficulty !== null && rawDifficulty !== undefined && bodyString(rawDifficulty) !== '') {
            const value = bodyString(rawDifficulty);

            if (!difficulty(value)) {
                errors['difficulty'] = 'Dificultad inválida.';
            } else {
                normalizedDifficulty = value;
            }
        }

        const timeValue = timeMinutes(body['time_minutes']);

        if (timeValue === undefined) {
            errors['time_minutes'] = 'Tiempo inválido.';
        }

        const rawYoutube = body['youtube_id'];
        let normalizedYoutube: string | null = null;

        if (rawYoutube !== null && rawYoutube !== undefined && bodyString(rawYoutube) !== '') {
            const input = bodyString(rawYoutube);
            const trimmed = phpTrim(input);
            const normalized = youtubeId(input);

            if (normalized === '' || normalized !== trimmed) {
                errors['youtube_id'] = 'ID de YouTube inválido (11 caracteres).';
            } else {
                normalizedYoutube = normalized;
            }
        }

        const rawDescription = body['description'];
        let description = '';

        if (rawDescription !== null && rawDescription !== undefined && bodyString(rawDescription) !== '') {
            description = bodyString(rawDescription);

            if (mbLength(description) > 10000) {
                errors['description'] = 'La descripción no puede superar los 10000 caracteres.';
            }
        }

        const ingredientInputs = Array.isArray(body['ingredients']) ? body['ingredients'] : [];
        const ingredientNames: string[] = [];

        for (const raw of ingredientInputs) {
            const ingredientName = phpTrim(bodyString(raw));

            if (ingredientName === '') {
                continue;
            }

            if (mbLength(ingredientName) > 200) {
                errors['ingredients'] = 'El nombre del ingrediente no puede superar los 200 caracteres.';
                break;
            }

            ingredientNames.push(ingredientName);
        }

        if (Object.keys(errors).length > 0) {
            return reply.code(422).send({ ok: false, error: Object.values(errors)[0], errors });
        }

        const persistedTime = timeValue === undefined ? null : timeValue;
        const id = phpInt(body['id'] ?? 0);

        if (id > 0) {
            const [rows] = await pool.execute<RowDataPacket[]>('SELECT 1 FROM recipes WHERE id = ?', [id]);

            if (rows.length === 0) {
                return reply.code(404).send({ ok: false, error: 'Receta no encontrada.' });
            }
        }

        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            let recipeId = id;

            if (id > 0) {
                await connection.execute('UPDATE recipes SET country_id=?, name=?, description=?, difficulty=?, time_minutes=?, youtube_id=? WHERE id=?', [countryId, name, description, normalizedDifficulty, persistedTime, normalizedYoutube, id]);
            } else {
                const [result] = await connection.execute('INSERT INTO recipes (country_id, name, description, difficulty, time_minutes, youtube_id) VALUES (?,?,?,?,?,?)', [countryId, name, description, normalizedDifficulty, persistedTime, normalizedYoutube]);
                recipeId = Number((result as { insertId: number }).insertId);
            }

            await connection.execute('DELETE FROM recipe_ingredient WHERE recipe_id = ?', [recipeId]);

            for (const ingredientName of ingredientNames) {
                await connection.execute('INSERT IGNORE INTO ingredients (name) VALUES (?)', [ingredientName]);

                const [found] = await connection.execute<RowDataPacket[]>('SELECT id FROM ingredients WHERE name = ?', [ingredientName]);
                const ingredientId = Number(found[0]?.['id'] ?? 0);

                if (ingredientId > 0) {
                    await connection.execute('INSERT IGNORE INTO recipe_ingredient (recipe_id, ingredient_id) VALUES (?, ?)', [recipeId, ingredientId]);
                }
            }

            await connection.commit();

            return reply.send({ ok: true, id: recipeId });
        } catch (error) {
            await connection.rollback();
            request.log.error(`[AdminController::saveRecipe] ${redactText(String(error))}`);

            return reply.code(500).send({ ok: false, error: 'Error interno del servidor.' });
        } finally {
            connection.release();
        }
    });

    app.delete<{ Params: IdParams }>('/admin/recipes/:id', guards, async (request, reply) => {
        const [result] = await pool.execute('DELETE FROM recipes WHERE id = ?', [phpInt(request.params.id)]);

        if ((result as { affectedRows: number }).affectedRows === 0) {
            return reply.code(404).send({ ok: false, error: 'Receta no encontrada.' });
        }

        return reply.send({ ok: true });
    });

    app.put<{ Params: IdParams }>('/admin/countries/:id', guards, async (request, reply) => {
        const id = positiveInt(request.params.id);

        if (id === null) {
            return reply.code(400).send({ ok: false, error: 'ID inválido.' });
        }

        const [rows] = await pool.execute<RowDataPacket[]>('SELECT 1 FROM countries WHERE id = ?', [id]);

        if (rows.length === 0) {
            return reply.code(404).send({ ok: false, error: 'País no encontrado.' });
        }

        const body = bodyRecord(request.body);
        const emoji = bodyString(body['emoji']);
        const tagline = bodyString(body['tagline']);
        const errors: Record<string, string> = {};

        if (mbLength(emoji) > 10) {
            errors['emoji'] = 'El emoji no puede superar los 10 caracteres.';
        }

        if (mbLength(tagline) > 150) {
            errors['tagline'] = 'El tagline no puede superar los 150 caracteres.';
        }

        if (Object.keys(errors).length > 0) {
            return reply.code(422).send({ ok: false, error: Object.values(errors)[0], errors });
        }

        await pool.execute('UPDATE countries SET emoji = ?, tagline = ? WHERE id = ?', [emoji, tagline, id]);

        return reply.send({ ok: true });
    });

    app.put<{ Params: IdParams }>('/admin/ingredients/:id', guards, async (request, reply) => {
        const body = bodyRecord(request.body);
        const name = phpTrim(body['name'] === null || body['name'] === undefined ? '' : bodyString(body['name']));
        const id = positiveInt(request.params.id);

        if (id === null) {
            return reply.code(400).send({ ok: false, error: 'ID inválido.' });
        }

        if (name === '') {
            return reply.code(422).send({ ok: false, error: 'El nombre es obligatorio.', errors: { name: 'El nombre es obligatorio.' } });
        }

        if (mbLength(name) > 200) {
            return reply.code(422).send({ ok: false, error: 'El nombre no puede superar los 200 caracteres.', errors: { name: 'El nombre no puede superar los 200 caracteres.' } });
        }

        try {
            const [result] = await pool.execute('UPDATE ingredients SET name = ? WHERE id = ?', [name, id]);

            if ((result as { affectedRows: number }).affectedRows === 0) {
                const [rows] = await pool.execute<RowDataPacket[]>('SELECT 1 FROM ingredients WHERE id = ?', [id]);

                if (rows.length === 0) {
                    return reply.code(404).send({ ok: false, error: 'Ingrediente no encontrado.' });
                }
            }
        } catch (error) {
            const errno = (error as { errno?: number }).errno;
            const code = (error as { code?: string }).code;

            if (errno === 1062 || code === 'ER_DUP_ENTRY' || code === 'SQLSTATE23000') {
                return reply.code(409).send({ ok: false, error: 'Ese nombre ya existe.' });
            }

            request.log.error(`[AdminController::renameIngredient] ${redactText(String(error))}`);

            return reply.code(500).send({ ok: false, error: 'Error interno del servidor.' });
        }

        return reply.send({ ok: true });
    });

    app.delete<{ Params: IdParams }>('/admin/ingredients/:id', guards, async (request, reply) => {
        const id = positiveInt(request.params.id);

        if (id === null) {
            return reply.code(400).send({ ok: false, error: 'ID inválido.' });
        }

        const [result] = await pool.execute('DELETE FROM ingredients WHERE id = ?', [id]);

        if ((result as { affectedRows: number }).affectedRows === 0) {
            return reply.code(404).send({ ok: false, error: 'Ingrediente no encontrado.' });
        }

        return reply.send({ ok: true });
    });

    app.get('/admin/sessions', guards, async (_request, reply) => {
        const [sessions] = await pool.query<RowDataPacket[]>(
            `SELECT s.id, u.username, s.created_at, s.expires_at, s.revoked_at, s.ip, s.user_agent
             FROM sessions s
             JOIN users u ON u.id = s.user_id
             ORDER BY s.created_at DESC`
        );

        return reply.send({
            ok: true,
            sessions: sessions.map(session => ({
                id: Number(session['id']),
                username: String(session['username']),
                created_at: session['created_at'],
                expires_at: session['expires_at'],
                revoked_at: session['revoked_at'],
                ip: session['ip'],
                user_agent: session['user_agent']
            }))
        });
    });

    app.delete<{ Params: IdParams }>('/admin/sessions/:id(^\\d+$)', guards, async (request, reply) => {
        const id = positiveInt(request.params.id);

        if (id === null) {
            return reply.code(400).send({ ok: false, error: 'ID inválido.' });
        }

        const [result] = await pool.execute('UPDATE sessions SET revoked_at = NOW() WHERE id = ? AND revoked_at IS NULL', [id]);

        if ((result as { affectedRows: number }).affectedRows === 0) {
            return reply.code(404).send({ ok: false, error: 'Sesión no encontrada.' });
        }

        return reply.send({ ok: true });
    });
}
