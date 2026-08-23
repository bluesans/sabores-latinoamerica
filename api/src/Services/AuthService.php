<?php
declare(strict_types=1);

namespace App\Services;

use App\Support\Auth;
use App\Support\Jwt;
use App\Support\Validation;
use PDO;

final class AuthService
{
    public function __construct(private PDO $pdo)
    {
    }

    public function register(string $username, string $password, string $ip): array
    {
        $username = trim($username);

        if (!Auth::checkRegisterRate($this->pdo, $ip)) {
            return self::failure('Demasiados registros desde esta conexión. Esperá unos minutos.', 429);
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

        $st = $this->pdo->prepare('SELECT id FROM users WHERE username = ?');
        $st->execute([$username]);

        if ($st->fetch(PDO::FETCH_ASSOC)) {
            return self::failure('Ese usuario ya existe. Probá con otro.', 409);
        }

        $countStatement = $this->pdo->query('SELECT COUNT(*) FROM users');
        $userCount = $countStatement === false ? 0 : (int) $countStatement->fetchColumn();

        $role = $userCount === 0 ? 'admin' : 'user';

        $this->pdo->prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)')
            ->execute([
                $username,
                password_hash($password, PASSWORD_DEFAULT),
                $role,
            ]);

        $userId = (int) ($this->pdo->lastInsertId() ?: 0);

        if ($userId <= 0) {
            return self::failure('No se pudo crear el usuario.', 500);
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

    public function login(string $username, string $password, string $ip): array
    {
        $username = trim($username);

        if (!Auth::checkLoginRate($this->pdo, $ip)) {
            return self::failure('Demasiados intentos. Esperá unos minutos.', 429);
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

    public function logout(string $refresh): array
    {
        if ($refresh !== '') {
            Auth::revokeRefreshToken($this->pdo, $refresh);
        }

        return self::success([]);
    }

    private static function success(array $data, int $status = 200): array
    {
        return [
            'ok' => true,
            'status' => $status,
            'data' => array_merge(['ok' => true], $data),
        ];
    }

    private static function failure(string $error, int $status): array
    {
        return [
            'ok' => false,
            'status' => $status,
            'data' => [
                'ok' => false,
                'error' => $error,
            ],
        ];
    }
}