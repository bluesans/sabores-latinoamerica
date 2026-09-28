<?php
declare(strict_types=1);

namespace App\Support;

use Psr\Http\Message\ResponseInterface as Response;

/**
 * Refresh-token cookie surface (todo 18).
 *
 * The refresh token travels ONLY in an HttpOnly SameSite=Strict cookie from
 * here on; JSON bodies no longer carry it. withHeader() replaces any previous
 * Set-Cookie value, so issue()/clear() can never stack duplicate headers -
 * every response carries at most one.
 */
final class Cookies
{
    public const REFRESH_NAME = 'sdl_refresh';

    public static function refreshCookieName(): string
    {
        return self::REFRESH_NAME;
    }

    /**
     * Base path of the deployed app (same logic as index.php setBasePath):
     * '/sabores-latinoamerica/api' under Apache, '/' in CLI contexts where
     * SCRIPT_NAME is undefined.
     */
    public static function basePath(): string
    {
        $path = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');

        return $path === '' ? '/' : $path;
    }

    public static function issue(Response $response, string $rawToken): Response
    {
        return self::attach($response, $rawToken, Env::int('SESSION_DAYS', 7) * 86400);
    }

    public static function clear(Response $response): Response
    {
        return self::attach($response, '', 0);
    }

    private static function attach(Response $response, string $value, int $maxAge): Response
    {
        // The raw token is [0-9a-f]{64} (bin2hex of random_bytes), safe as-is.
        $parts = [
            self::REFRESH_NAME . '=' . $value,
            'Path=' . self::basePath(),
            'Max-Age=' . $maxAge,
            'HttpOnly',
            'SameSite=Strict',
        ];

        if ($maxAge <= 0) {
            // Max-Age=0 basta en clientes modernos; Expires pasado cubre viejos.
            $parts[] = 'Expires=Thu, 01 Jan 1970 00:00:00 GMT';
        }

        if (self::secure()) {
            $parts[] = 'Secure';
        }

        return $response->withHeader('Set-Cookie', implode('; ', $parts));
    }

    /**
     * COOKIE_SECURE: '1'|'true' always marks Secure; '0' never does;
     * 'auto' (default) marks Secure only when the request arrived over HTTPS,
     * directly or behind a proxy that set X-Forwarded-Proto.
     */
    private static function secure(): bool
    {
        return match (Env::get('COOKIE_SECURE', 'auto')) {
            '1', 'true' => true,
            '0' => false,
            default => self::requestIsHttps(),
        };
    }

    private static function requestIsHttps(): bool
    {
        $https = strtolower((string) ($_SERVER['HTTPS'] ?? ''));

        if ($https !== '' && $https !== 'off') {
            return true;
        }

        return strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
    }
}
