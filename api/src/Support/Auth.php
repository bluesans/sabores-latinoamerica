<?php
declare(strict_types=1);

namespace App\Support;

use PDO;
use Psr\Http\Message\ServerRequestInterface as Request;

final class Auth
{
    private const LOGIN_MAX_ATTEMPTS = 10;
    private const LOGIN_WINDOW_MINUTES = 5;

    private const REGISTER_MAX_ATTEMPTS = 5;
    private const REGISTER_WINDOW_MINUTES = 15;

    public static function bearerToken(Request $request): ?string
    {
        $auth = $request->getHeaderLine('Authorization');

        return preg_match('/^Bearer\s+([\w\-.]+)$/', $auth, $m) ? $m[1] : null;
    }

    /** @return array<string, mixed>|null */
    public static function userFromRequest(Request $request): ?array
    {
        $user = $request->getAttribute('auth_user');

        return is_array($user) ? $user : null;
    }

    /** @return array{allowed: bool, retryAfter: int} */
    public static function checkLoginRateDetails(PDO $pdo, string $ip): array
    {
        return self::checkRateDetails(
            $pdo,
            $ip,
            'login',
            self::LOGIN_MAX_ATTEMPTS,
            self::LOGIN_WINDOW_MINUTES
        );
    }

    public static function checkLoginRate(PDO $pdo, string $ip): bool
    {
        return self::checkLoginRateDetails($pdo, $ip)['allowed'];
    }

    /** @return array{allowed: bool, retryAfter: int} */
    public static function checkRegisterRateDetails(PDO $pdo, string $ip): array
    {
        return self::checkRateDetails(
            $pdo,
            $ip,
            'register',
            self::REGISTER_MAX_ATTEMPTS,
            self::REGISTER_WINDOW_MINUTES
        );
    }

    public static function checkRegisterRate(PDO $pdo, string $ip): bool
    {
        return self::checkRegisterRateDetails($pdo, $ip)['allowed'];
    }

    public static function recordFailedLogin(PDO $pdo, string $ip, string $username): void
    {
        self::recordAttempt($pdo, $ip, $username, 'login');
    }

    public static function recordRegisterAttempt(PDO $pdo, string $ip, string $username): void
    {
        self::recordAttempt($pdo, $ip, $username, 'register');
    }

    public static function createRefreshToken(PDO $pdo, int $userId): string
    {
        $token = bin2hex(random_bytes(32));
        $tokenHash = self::hashToken($token);
        $days = Env::int('SESSION_DAYS', 7);

        $pdo->prepare(
            "INSERT INTO sessions (user_id, token, expires_at, revoked_at)
             VALUES (?, ?, DATE_ADD(NOW(), INTERVAL $days DAY), NULL)"
        )->execute([$userId, $tokenHash]);

        return $token;
    }

    public static function purgeExpiredSessions(PDO $pdo): void
    {
        $pdo->exec('DELETE FROM sessions WHERE expires_at < NOW()');
    }

    /**
     * @return array{
     *     id: int,
     *     user_id: int,
     *     expires_at: string,
     *     revoked_at: string|null,
     *     username: string,
     *     role: string
     * }|null
     */
    public static function findRefreshTokenForUpdate(PDO $pdo, string $token): ?array
    {
        return self::fetchSessionRow($pdo, self::hashToken($token), true);
    }

    public static function revokeRefreshToken(PDO $pdo, string $token): void
    {
        $pdo->prepare(
            'UPDATE sessions
             SET revoked_at = NOW()
             WHERE token = ? AND revoked_at IS NULL'
        )->execute([self::hashToken($token)]);
    }

    public static function revokeAllUserSessions(PDO $pdo, int $userId): void
    {
        $pdo->prepare('DELETE FROM sessions WHERE user_id = ?')->execute([$userId]);
    }

    private static function hashToken(string $token): string
    {
        return hash('sha256', $token);
    }

    /**
     * @return array{
     *     id: int,
     *     user_id: int,
     *     expires_at: string,
     *     revoked_at: string|null,
     *     username: string,
     *     role: string
     * }|null
     */
    private static function fetchSessionRow(PDO $pdo, string $tokenHash, bool $forUpdate): ?array
    {
        $sql = 'SELECT s.id, s.user_id, s.expires_at, s.revoked_at, u.username, u.role
                FROM sessions s
                JOIN users u ON u.id = s.user_id
                WHERE s.token = ?';

        if ($forUpdate) {
            $sql .= ' FOR UPDATE';
        }

        $st = $pdo->prepare($sql);
        $st->execute([$tokenHash]);

        $row = $st->fetch(PDO::FETCH_ASSOC);

        if (!is_array($row)) {
            return null;
        }

        return [
            'id' => (int) ($row['id'] ?? 0),
            'user_id' => (int) ($row['user_id'] ?? 0),
            'expires_at' => (string) ($row['expires_at'] ?? ''),
            'revoked_at' => $row['revoked_at'] === null ? null : (string) $row['revoked_at'],
            'username' => (string) ($row['username'] ?? ''),
            'role' => (string) ($row['role'] ?? 'user'),
        ];
    }

    private static function purgeOldAttempts(PDO $pdo): void
    {
        $pdo->exec('DELETE FROM login_attempts WHERE attempted_at < DATE_SUB(NOW(), INTERVAL 1 HOUR)');
    }

    /**
     * Rate-limit check with retry guidance: when blocked, retryAfter is the
     * number of seconds until the oldest attempt inside the window ages out.
     *
     * @return array{allowed: bool, retryAfter: int}
     */
    public static function checkRateDetails(
        PDO $pdo,
        string $ip,
        string $action,
        int $maxAttempts,
        int $minutes
    ): array {
        self::purgeOldAttempts($pdo);

        $st = $pdo->prepare(
            "SELECT MIN(attempted_at), COUNT(*)
             FROM login_attempts
             WHERE ip = ?
               AND action = ?
               AND attempted_at > DATE_SUB(NOW(), INTERVAL $minutes MINUTE)"
        );

        $st->execute([$ip, $action]);

        /** @var array{0: string|null, 1: int}|false $row */
        $row = $st->fetch(PDO::FETCH_NUM);

        if (((int) ($row[1] ?? 0)) < $maxAttempts) {
            return ['allowed' => true, 'retryAfter' => 0];
        }

        // The window clears when its OLDEST attempt ages out.
        $oldest = strtotime((string) ($row[0] ?? ''));
        $retryAfter = $oldest === false
            ? $minutes * 60
            : (int) ceil($oldest + $minutes * 60 - time());

        return ['allowed' => false, 'retryAfter' => max(1, $retryAfter)];
    }

    private static function recordAttempt(
        PDO $pdo,
        string $ip,
        string $username,
        string $action
    ): void {
        $username = trim($username);

        if (function_exists('mb_substr')) {
            $username = mb_substr($username, 0, 30);
        } else {
            $username = substr($username, 0, 30);
        }

        $pdo->prepare('INSERT INTO login_attempts (ip, username, action) VALUES (?, ?, ?)')
            ->execute([$ip, $username, $action]);
    }
}