/**
 * Redacción de datos sensibles para logs (todo 24).
 *
 * Nunca se loguean passwords, cookies, Authorization, tokens ni secretos.
 * Se aplica a objetos estructurados y a texto libre (errores de drivers).
 */
const SENSITIVE_KEY = /(password|passwd|authorization|cookie|set-cookie|access|refresh|token|secret|jwt)/i;

export function redactSensitive(value: unknown, seen = new WeakSet<object>()): unknown {
    if (Array.isArray(value)) {
        return value.map(item => redactSensitive(item, seen));
    }

    if (value !== null && typeof value === 'object') {
        if (seen.has(value)) {
            return '[Circular]';
        }

        seen.add(value);

        const output: Record<string, unknown> = {};

        for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
            output[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactSensitive(child, seen);
        }

        return output;
    }

    return value;
}

export function redactText(text: string): string {
    return text
        .replace(/\b(password|passwd|token|secret|authorization|cookie)(\s*[:=]\s*)[^\s,;}"']+/gi, '$1$2[REDACTED]')
        .replace(/Bearer\s+[\w.-]+/gi, 'Bearer [REDACTED]')
        .replace(/sdl_refresh=[0-9a-f]+/gi, 'sdl_refresh=[REDACTED]');
}
