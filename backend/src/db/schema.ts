/**
 * Esquema Drizzle de la base viva, producto de `npx drizzle-kit pull` (0.31.11
 * contra MariaDB 10.4) y REVISADO A MANO contra `db/migrations/000_install.sql`,
 * `001_sessions_ip_ua.sql` y `002_attempt_refresh_action.sql`.
 *
 * Correcciones al código generado (quirk de la introspección en MariaDB):
 * - El pull OMITE primary keys → se declaran a mano (`primaryKey()` y el
 *   compuesto de `favorites` / `recipe_ingredient`).
 * - Los DEFAULT NULL salen como string literal `'NULL'` → se descartan.
 * - `current_timestamp()` sale como string literal → `sql` + `current_timestamp()`.
 * - Los ENUM con default salen con comillas escapadas (`'\'login\''`) → valor real.
 * - `login_attempts.id` es `bigint unsigned` → `{ unsigned: true }`.
 * - La vista `v_estadisticas` queda FUERA: el backend no la usa (StatsController
 *   calcula por su cuenta) y el pull la generaba con `ALGORITHM = undefined`,
 *   `SQL SECURITY definer` y nombres calificados a `sabores_latinoamerica`
 *   (no portable); sigue en el baseline SQL.
 *
 * Los DATETIME van en `{ mode: 'string' }` para paridad con PDO (el pool usa
 * `dateStrings: true`): `'YYYY-MM-DD HH:MM:SS'`, sin objetos Date.
 */
import { sql } from 'drizzle-orm';
import { bigint, char, datetime, index, int, mysqlEnum, mysqlTable, primaryKey, text, unique, varchar } from 'drizzle-orm/mysql-core';

export const countries = mysqlTable(
    'countries',
    {
        id: int().primaryKey(),
        isoCode: int('iso_code').notNull(),
        name: varchar({ length: 100 }).notNull(),
        emoji: varchar({ length: 10 }),
        tagline: varchar({ length: 150 })
    },
    table => [unique('uq_iso_code').on(table.isoCode)]
);

export const users = mysqlTable(
    'users',
    {
        id: int().autoincrement().primaryKey(),
        username: varchar({ length: 30 }).notNull(),
        password: varchar({ length: 255 }).notNull(),
        role: mysqlEnum(['user', 'admin']).default('user').notNull(),
        createdAt: datetime('created_at', { mode: 'string' }).default(sql`current_timestamp()`).notNull()
    },
    table => [unique('uq_username').on(table.username)]
);

export const sessions = mysqlTable(
    'sessions',
    {
        id: bigint({ mode: 'number' }).autoincrement().primaryKey(),
        userId: int('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade', onUpdate: 'restrict' }),
        token: char({ length: 64 }).notNull(),
        createdAt: datetime('created_at', { mode: 'string' }).default(sql`current_timestamp()`).notNull(),
        expiresAt: datetime('expires_at', { mode: 'string' }).notNull(),
        revokedAt: datetime('revoked_at', { mode: 'string' }),
        ip: varchar({ length: 45 }),
        userAgent: varchar('user_agent', { length: 255 })
    },
    table => [index('idx_sessions_user').on(table.userId), index('idx_sessions_user_revoked').on(table.userId, table.revokedAt), unique('uq_token').on(table.token)]
);

export const loginAttempts = mysqlTable(
    'login_attempts',
    {
        id: bigint({ mode: 'number', unsigned: true }).autoincrement().primaryKey(),
        ip: varchar({ length: 45 }).notNull(),
        username: varchar({ length: 30 }).default('').notNull(),
        action: mysqlEnum(['login', 'register', 'refresh']).default('login').notNull(),
        attemptedAt: datetime('attempted_at', { mode: 'string' }).default(sql`current_timestamp()`).notNull()
    },
    table => [index('idx_login_attempts_ip_time').on(table.ip, table.attemptedAt), index('idx_login_attempts_username').on(table.username), index('idx_login_attempts_action_ip_time').on(table.action, table.ip, table.attemptedAt)]
);

export const recipes = mysqlTable(
    'recipes',
    {
        id: int().autoincrement().primaryKey(),
        countryId: int('country_id')
            .notNull()
            .references(() => countries.id, { onDelete: 'restrict', onUpdate: 'restrict' }),
        name: varchar({ length: 200 }).notNull(),
        description: text(),
        difficulty: mysqlEnum(['easy', 'medium', 'hard']),
        timeMinutes: int('time_minutes'),
        youtubeId: varchar('youtube_id', { length: 30 })
    },
    table => [index('idx_recipes_country_name').on(table.countryId, table.name)]
);

export const ingredients = mysqlTable(
    'ingredients',
    {
        id: int().autoincrement().primaryKey(),
        name: varchar({ length: 200 }).notNull()
    },
    table => [unique('uq_ing_name').on(table.name)]
);

export const recipeIngredient = mysqlTable(
    'recipe_ingredient',
    {
        recipeId: int('recipe_id')
            .notNull()
            .references(() => recipes.id, { onDelete: 'cascade', onUpdate: 'restrict' }),
        ingredientId: int('ingredient_id')
            .notNull()
            .references(() => ingredients.id, { onDelete: 'cascade', onUpdate: 'restrict' })
    },
    table => [primaryKey({ columns: [table.recipeId, table.ingredientId] })]
);

export const favorites = mysqlTable(
    'favorites',
    {
        userId: int('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade', onUpdate: 'restrict' }),
        recipeId: int('recipe_id')
            .notNull()
            .references(() => recipes.id, { onDelete: 'cascade', onUpdate: 'restrict' }),
        createdAt: datetime('created_at', { mode: 'string' }).default(sql`current_timestamp()`).notNull()
    },
    table => [primaryKey({ columns: [table.userId, table.recipeId] }), index('idx_favorites_recipe').on(table.recipeId)]
);
