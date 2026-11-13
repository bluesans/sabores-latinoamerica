/**
 * Primitivas del refresh token en paridad con `api/src/Support/Auth.php`.
 *
 * El token viaja crudo en la cookie (64 hex); en `sessions.token` se guarda
 * SOLO `sha256(token)` en hex, igual que el PHP.
 */
import { createHash, randomBytes } from 'node:crypto';

/** 32 bytes aleatorios en hex (64 caracteres), como `bin2hex(random_bytes(32))`. */
export function createRefreshToken(): string {
    return randomBytes(32).toString('hex');
}

/** `hash('sha256', $token)`: SHA-256 hex en minúsculas. */
export function hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}
