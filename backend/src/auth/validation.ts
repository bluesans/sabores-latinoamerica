/**
 * Port 1:1 de `api/src/Support/Validation.php`.
 *
 * Ojo con las diferencias de runtime:
 * - `username` usa `\p{L}\p{N}` con flag `u` (code points, igual que PCRE /u).
 * - `passwordError` mide BYTES (`strlen` del PHP), no caracteres.
 * - `truncate` cuenta code points (`mb_substr`).
 */
export function username(value: string): boolean {
    return /^[\p{L}\p{N}_]{3,30}$/u.test(value);
}

export function passwordError(password: string): string | null {
    const bytes = Buffer.byteLength(password, 'utf8');

    if (bytes < 8) {
        return 'La contraseña necesita al menos 8 caracteres.';
    }

    if (bytes > 72) {
        return 'La contraseña no puede superar los 72 caracteres.';
    }

    return null;
}

export function difficulty(value: string): boolean {
    return value === 'easy' || value === 'medium' || value === 'hard';
}

export function positiveInt(value: unknown): number | null {
    if (typeof value === 'number') {
        return Number.isInteger(value) && value > 0 ? value : null;
    }

    if (typeof value !== 'string' || !/^\d+$/.test(value)) {
        return null;
    }

    const parsed = Number(value);

    // Divergencia conocida y deliberada: PHP satura a PHP_INT_MAX para
    // strings > 2^53-1; acá se rechazan para no perder precisión al bindear.
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function youtubeId(value: string): string {
    const normalized = value.trim().replace(/\s+/g, '');

    return /^[A-Za-z0-9_-]{11}$/.test(normalized) ? normalized : '';
}

export function truncate(value: string, max: number): string {
    if (max <= 0) {
        return '';
    }

    return Array.from(value).slice(0, max).join('');
}

export function text(value: string | null | undefined, max: number): string {
    const trimmed = String(value ?? '').trim();

    if (trimmed === '') {
        return '';
    }

    return truncate(trimmed, max);
}
