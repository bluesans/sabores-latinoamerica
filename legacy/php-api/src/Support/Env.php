<?php
declare(strict_types=1);

namespace App\Support;

final class Env
{
    public static function get(string $key, ?string $default = null): ?string
    {
        $value = $_ENV[$key] ?? $_SERVER[$key] ?? getenv($key);
        // The ?? chain already discards null operands, so $value is string|false here.
        if ($value === false || $value === '') return $default;
        return (string) $value;
    }

    public static function int(string $key, int $default): int
    {
        $v = self::get($key);
        return $v === null ? $default : (int) $v;
    }
}
