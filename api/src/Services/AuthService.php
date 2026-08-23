<?php
declare(strict_types=1);

namespace App\Services;

use App\Support\Auth;
use App\Support\Jwt;
use App\Support\Validation;
use PDO;
use PDOException;

final class AuthService
{
    public function __construct(private PDO $pdo)
    {
    }

    /** @return array{ok: bool, status: int, data: array<string, mixed>, headers: array<string, string>} */
    public function register(string $username, string $password, string $ip): array
    {
        $username = trim($username);

        $rate = Auth::checkRegisterRateDetails($this->pdo, $ip);

        if (!$rate['allowed']) {
            return self::failure('Demasiados registros desde esta conexión. Esperá unos minutos.', 429, [
                'Retry-After' => (string) $rate['retryAfter'],
            ]);
        }

        Auth::recordRegisterAttempt($this->pdo, $ip, $username);

        if (!Validation::username($username)) {
            return self::failure(
                'El usuario debe tener entre 3 y 30 caracteres: letras, números o guión bajo.',
                422
            );
        }

        $passwordError = Validation::passwordError($password);

        if ($passwordError !== null) {
            return self::failure($passwordError, 422);
        }

        // Web registration always creates a plain user; the admin role is
        // granted exclusively by bin/create-admin.php. Username uniqueness is
        // enforced atomically by the UNIQUE uq_username index (no TOCTOU
        // check-then-insert race): a duplicate INSERT surfaces as SQLSTATE
        // 23000 / driver code 1062 and maps to HTTP 409.
        try {
            $this->pdo->prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)')
                ->execute([
                    $username,
                    password_hash($password, PASSWORD_DEFAULT),
                    'user',
                ]);
        } catch (PDOException $e) {
            $errorInfo = $e->errorInfo;
            // PDO driver errors always populate errorInfo; the stub allows null.
            \assert(is_array($errorInfo));
            [$sqlState, $driverCode] = $errorInfo;

            if ($sqlState === '23000' || (int) $driverCode === 1062) {
                return self::failure('Ese usuario ya existe. Probá con otro.', 409);
            }

            throw $e;
        }

        $userId = (int) ($this->pdo->lastInsertId() ?: 0);

        if ($userId <= 0) {
            return self::failure('No se pudo crear el usuario.', 500);
        }

        return self::success([
            'username' => $username,
            'role' => 'user',
            'refresh' => Auth::createRefreshToken($this->pdo, $userId),
            'access' => Jwt::issueAccess([
                'id' => $userId,
                'username' => $username,
                'role' => 'user',
            ]),
        ]);
    }

    /** @return array{ok: bool, status: int, data: array<string, mixed>, headers: array<string, string>} */
    public function login(string $username, string $password, string $ip): array
    {
        $username = trim($username);

        $rate = Auth::checkLoginRateDetails($this->pdo, $ip);

        if (!$rate['allowed']) {
            return self::failure('Demasiados intentos. Esperá unos minutos.', 429, [
                'Retry-After' => (string) $rate['retryAfter'],
            ]);
        }

        $st = $this->pdo->prepare('SELECT id, username, password, role FROM users WHERE username = ?');
        $st->execute([$username]);

        $user = $st->fetch(PDO::FETCH_ASSOC);

        if (!is_array($user) || !password_verify($password, (string) ($user['password'] ?? ''))) {
            Auth::recordFailedLogin($this->pdo, $ip, $username);

            return self::failure('Usuario o contraseña incorrectos.', 401);
        }

        $userId = (int) ($user['id'] ?? 0);
        $username = (string) ($user['username'] ?? '');
        $role = (string) ($user['role'] ?? 'user');

        if ($userId <= 0) {
            return self::failure('No se pudo iniciar sesión.', 500);
        }

        return self::success([
            'username' => $username,
            'role' => $role,
            'refresh' => Auth::createRefreshToken($this->pdo, $userId),
            'access' => Jwt::issueAccess([
                'id' => $userId,
                'username' => $username,
                'role' => $role,
            ]),
        ]);
    }

    /** @return array{ok: bool, status: int, data: array<string, mixed>, headers: array<string, string>} */
    public function refresh(?string $token): array
    {
        if ($token === null || $token === '') {
            return self::failure('Sesión expirada.', 401);
        }

        $this->pdo->beginTransaction();

        try {
            Auth::purgeExpiredSessions($this->pdo);

            $row = Auth::findRefreshTokenForUpdate($this->pdo, $token);

            if ($row === null) {
                $this->pdo->rollBack();

                return self::failure('Sesión expirada.', 401);
            }

            if ($row['revoked_at'] !== null) {
                Auth::revokeAllUserSessions($this->pdo, $row['user_id']);
                $this->pdo->commit();

                return self::failure('Sesión expirada.', 401);
            }

            $expiresAt = strtotime($row['expires_at']);

            if ($expiresAt === false || $expiresAt <= time()) {
                $this->pdo->rollBack();

                return self::failure('Sesión expirada.', 401);
            }

            Auth::revokeRefreshToken($this->pdo, $token);

            $newRefresh = Auth::createRefreshToken($this->pdo, $row['user_id']);

            $this->pdo->commit();

            return self::success([
                'access' => Jwt::issueAccess([
                    'id' => $row['user_id'],
                    'username' => $row['username'],
                    'role' => $row['role'],
                ]),
                'refresh' => $newRefresh,
            ]);
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }

            throw $e;
        }
    }

    /** @return array{ok: bool, status: int, data: array<string, mixed>, headers: array<string, string>} */
    public function logout(string $refresh): array
    {
        if ($refresh !== '') {
            Auth::revokeRefreshToken($this->pdo, $refresh);
        }

        return self::success([]);
    }

    /**
     * @param array<string, mixed> $data
     * @return array{ok: bool, status: int, data: array<string, mixed>, headers: array<string, string>}
     */
    private static function success(array $data, int $status = 200): array
    {
        return [
            'ok' => true,
            'status' => $status,
            'data' => array_merge(['ok' => true], $data),
            'headers' => [],
        ];
    }

    /**
     * @param array<string, string> $headers
     * @return array{ok: bool, status: int, data: array<string, mixed>, headers: array<string, string>}
     */
    private static function failure(string $error, int $status, array $headers = []): array
    {
        return [
            'ok' => false,
            'status' => $status,
            'data' => [
                'ok' => false,
                'error' => $error,
            ],
            'headers' => $headers,
        ];
    }
}