<?php
declare(strict_types=1);

namespace App\Support;

final class Jwt
{
    private const LEEWAY_SECONDS = 10;
    private const DEFAULT_TTL_SECONDS = 900;

    /** @param array<string, mixed> $payload */
    public static function encode(array $payload): string
    {
        $header = json_encode([
            'alg' => 'HS256',
            'typ' => 'JWT',
        ]);

        $body = json_encode($payload);

        if ($header === false || $body === false) {
            throw new \RuntimeException('No se pudo codificar el JWT.');
        }

        $h = self::b64u($header);
        $p = self::b64u($body);

        return "$h.$p." . self::b64u(
            hash_hmac('sha256', "$h.$p", self::secret(), true)
        );
    }

    /** @return array<string, mixed>|null */
    public static function decode(string $token): ?array
    {
        $parts = explode('.', $token);

        if (count($parts) !== 3) {
            return null;
        }

        [$h, $p, $s] = $parts;

        $headerRaw = self::b64uDecode($h);

        if ($headerRaw === false) {
            return null;
        }

        $header = json_decode($headerRaw, true);

        if (!is_array($header) || ($header['alg'] ?? '') !== 'HS256') {
            return null;
        }

        $payloadRaw = self::b64uDecode($p);

        if ($payloadRaw === false) {
            return null;
        }

        $payload = json_decode($payloadRaw, true);

        if (!is_array($payload)) {
            return null;
        }

        $expected = self::b64u(
            hash_hmac('sha256', "$h.$p", self::secret(), true)
        );

        if (!hash_equals($expected, $s)) {
            return null;
        }

        $now = time();
        $exp = (int) ($payload['exp'] ?? 0);
        $iat = (int) ($payload['iat'] ?? 0);

        if ($exp < ($now - self::LEEWAY_SECONDS)) {
            return null;
        }

        if ($iat > ($now + self::LEEWAY_SECONDS)) {
            return null;
        }

        if (($payload['token_type'] ?? 'access') !== 'access') {
            return null;
        }

        return $payload;
    }

    /** @param array<string, int|string> $user */
    public static function issueAccess(array $user): string
    {
        return self::encode([
            'sub' => (int) ($user['id'] ?? 0),
            'name' => (string) ($user['username'] ?? ''),
            'role' => (string) ($user['role'] ?? 'user'),
            'token_type' => 'access',
            'iat' => time(),
            'exp' => time() + Env::int('JWT_TTL', self::DEFAULT_TTL_SECONDS),
        ]);
    }

    private static function b64u(string $d): string
    {
        return rtrim(strtr(base64_encode($d), '+/', '-_'), '=');
    }

    private static function b64uDecode(string $s): string|false
    {
        return base64_decode(strtr($s, '-_', '+/'), true);
    }

    private static function secret(): string
    {
        $secret = (string) Env::get('JWT_SECRET', '');

        if ($secret === '' || $secret === 'cambiame_por_una_clave_larga_y_aleatoria') {
            throw new \RuntimeException(
                'JWT_SECRET no está configurado. Configurá una clave larga y aleatoria en api/.env.'
            );
        }

        return $secret;
    }
}