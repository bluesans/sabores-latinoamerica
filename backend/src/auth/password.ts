/**
 * Hashing de contraseñas en paridad con el PHP (todo 9).
 *
 * `PASSWORD_DEFAULT` en el PHP de XAMPP (8.4.24) es bcrypt con costo 12 y
 * prefijo `$2y$`. bcryptjs emite `$2b$` y verifica `$2y$`; ambos sentidos se
 * validaron contra `password_hash`/`password_verify` reales, incluidos
 * passwords multibyte.
 */
import bcrypt from 'bcryptjs';

/** Costo de `PASSWORD_DEFAULT` en PHP 8.4 (verificado con `php -r`). */
export const PHP_BCRYPT_COST = 12;

/** Hash bcrypt compatible con `password_verify` del PHP. */
export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, PHP_BCRYPT_COST);
}

/** Verifica un hash bcrypt del PHP (`$2y$`) o de Node (`$2b$`). */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
        return await bcrypt.compare(password, hash);
    } catch {
        // password_verify() devuelve false ante un hash inválido, no lanza.
        return false;
    }
}

/**
 * Equivalente a `password_needs_rehash($hash, PASSWORD_DEFAULT)`:
 * true si el algoritmo no es bcrypt o el costo difiere del default PHP.
 */
export function passwordNeedsRehash(hash: string): boolean {
    // bcrypt completo: $2a$|$2b$|$2y$ + costo 2 dígitos + salt+hash 53 chars.
    const match = /^\$2[aby]\$(\d{2})\$[./A-Za-z0-9]{53}$/.exec(hash);

    if (match === null || match[1] === undefined) {
        return true;
    }

    return Number(match[1]) !== PHP_BCRYPT_COST;
}
