/**
 * Servicio de auth en paridad con `AuthService::register` y
 * `AuthController::check` (todo 13).
 *
 * Orden EXACTO de register: rate-limit -> validación -> record del intento ->
 * INSERT -> sesión/refresh -> access token. Así, cuando la cuota está agotada
 * o los datos son inválidos NO se insertan usuarios huérfanos.
 */
import type { FastifyInstance } from 'fastify';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { AppConfig } from '../config.js';
import { checkRegisterRateDetails, rateLimitMessage, recordRegisterAttempt } from '../rate-limit/attempts.js';
import { createSession } from '../sessions/repository.js';
import { issueAccessToken } from './jwt.js';
import { hashPassword } from './password.js';
import { passwordError, username as validUsername } from './validation.js';

export type RegisterInput = Readonly<{
    username: string;
    password: string;
    ip: string;
}>;

export type RegisterSuccess = Readonly<{
    ok: true;
    status: 200;
    body: { ok: true; username: string; role: string; access: string };
    refreshToken: string;
}>;

export type ServiceFailure = Readonly<{
    ok: false;
    status: number;
    body: { ok: false; error: string };
    headers: Readonly<Record<string, string>>;
}>;

export type RegisterResult = RegisterSuccess | ServiceFailure;

export type CheckedUser = Readonly<{
    username: string;
    role: string;
}>;

function failure(error: string, status: number, headers: Record<string, string> = {}): ServiceFailure {
    return { ok: false, status, body: { ok: false, error }, headers };
}

/** `username` ya viene trimmeado por el controller, igual que el PHP. */
export async function registerUser(app: FastifyInstance, pool: Pool, config: AppConfig, input: RegisterInput): Promise<RegisterResult> {
    const username = input.username.trim();

    const rate = await checkRegisterRateDetails(pool, input.ip);

    if (!rate.allowed) {
        return failure(rateLimitMessage('register'), 429, { 'Retry-After': String(rate.retryAfter) });
    }

    if (!validUsername(username)) {
        return failure('El usuario debe tener entre 3 y 30 caracteres: letras, números o guión bajo.', 422);
    }

    const passwordProblem = passwordError(input.password);

    if (passwordProblem !== null) {
        return failure(passwordProblem, 422);
    }

    // La cuota se consume recién con datos válidos (anti self-DoS del PHP).
    await recordRegisterAttempt(pool, input.ip, username);

    let userId: number;

    try {
        const [result] = await pool.execute<ResultSetHeader>('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username, await hashPassword(input.password), 'user']);

        userId = result.insertId;
    } catch (error) {
        if (isDuplicateEntry(error)) {
            return failure('Ese usuario ya existe. Probá con otro.', 409);
        }

        throw error;
    }

    if (userId <= 0) {
        return failure('No se pudo crear el usuario.', 500);
    }

    const refreshToken = await createSession(pool, {
        userId,
        sessionDays: config.sessionDays,
        ip: input.ip,
        // register NO pasa user-agent en el v1: la columna queda NULL.
        userAgent: null
    });

    const access = issueAccessToken(app, { id: userId, username, role: 'user' }, config.jwtTtl);

    return {
        ok: true,
        status: 200,
        body: { ok: true, username, role: 'user', access },
        refreshToken
    };
}

/** `AuthController::check`: usuario vigente en DB o 401. */
export async function findUserForCheck(pool: Pool, userId: number): Promise<CheckedUser | null> {
    const [rows] = await pool.execute<RowDataPacket[]>('SELECT id, username, role FROM users WHERE id = ?', [userId]);

    const row = rows[0];

    if (row === undefined) {
        return null;
    }

    return { username: String(row['username'] ?? ''), role: String(row['role'] ?? 'user') };
}

function isDuplicateEntry(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
        return false;
    }

    const candidate = error as { code?: unknown; errno?: unknown; sqlState?: unknown };

    // Guard amplio del PHP: SQLSTATE 23000 OR driver code 1062.
    return candidate.code === 'ER_DUP_ENTRY' || Number(candidate.errno) === 1062 || candidate.sqlState === '23000';
}
