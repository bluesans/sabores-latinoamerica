<?php
declare(strict_types=1);

namespace App\Support;

final class Validation
{
    public static function username(string $username): bool
    {
        return preg_match('/^[\p{L}\p{N}_]{3,30}$/u', $username) === 1;
    }

    public static function passwordError(string $password): ?string
    {
        if (strlen($password) < 6) {
            return 'La contraseña necesita al menos 6 caracteres.';
        }

        if (strlen($password) > 72) {
            return 'La contraseña no puede superar los 72 caracteres.';
        }

        return null;
    }

    public static function difficulty(string $difficulty): bool
    {
        return in_array($difficulty, ['easy', 'medium', 'hard'], true);
    }

    public static function positiveInt(mixed $value): ?int
    {
        if (!is_numeric($value)) {
            return null;
        }

        $int = (int) $value;

        return $int > 0 ? $int : null;
    }

    public static function youtubeId(string $value): string
    {
        $value = trim($value);
        $value = preg_replace('/\s+/', '', $value) ?? '';

        return preg_match('/^[A-Za-z0-9_-]{11}$/', $value) === 1 ? $value : '';
    }

    public static function text(?string $value, int $max): string
    {
        $value = trim((string) $value);

        if ($value === '') {
            return '';
        }

        return self::truncate($value, $max);
    }

    public static function truncate(string $value, int $max): string
    {
        if ($max <= 0) {
            return '';
        }

        if (function_exists('mb_substr')) {
            return mb_substr($value, 0, $max);
        }

        return substr($value, 0, $max);
    }
}