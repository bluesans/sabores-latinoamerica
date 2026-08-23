<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\AuthService;
use App\Support\Auth;
use App\Support\Database;
use App\Support\JsonResponder;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class AuthController
{
    use JsonResponder;

    public function register(Request $request, Response $response): Response
    {
        $b = (array) $request->getParsedBody();

        $username = trim((string) ($b['username'] ?? ''));
        $password = (string) ($b['password'] ?? '');

        $result = $this->service()->register($username, $password, $this->ip($request));

        return $this->respond($response, $result);
    }

    public function login(Request $request, Response $response): Response
    {
        $b = (array) $request->getParsedBody();

        $username = trim((string) ($b['username'] ?? ''));
        $password = (string) ($b['password'] ?? '');

        $result = $this->service()->login($username, $password, $this->ip($request));

        return $this->respond($response, $result);
    }

    public function check(Request $request, Response $response): Response
    {
        $user = Auth::userFromRequest($request);

        // Verificar que el usuario todavía existe en la base de datos.
        // Sin esto, un JWT válido de un usuario borrado seguiría funcionando.
        $pdo = Database::connection();
        $st = $pdo->prepare('SELECT id, username, role FROM users WHERE id = ?');
        $st->execute([$user['user_id']]);
        $dbUser = $st->fetch();

        if (!$dbUser) {
            return $this->json($response, [
                'ok' => false,
                'error' => 'Usuario no encontrado.',
            ], 401);
        }

        return $this->json($response, [
            'ok' => true,
            'username' => (string) $dbUser['username'],
            'role' => (string) $dbUser['role'],
        ]);
    }

    public function refresh(Request $request, Response $response): Response
    {
        $token = Auth::bearerToken($request);

        $result = $this->service()->refresh($token);

        return $this->respond($response, $result);
    }

    public function logout(Request $request, Response $response): Response
    {
        $b = (array) $request->getParsedBody();
        $refresh = (string) ($b['refresh'] ?? '');

        $result = $this->service()->logout($refresh);

        return $this->respond($response, $result);
    }

    private function service(): AuthService
    {
        return new AuthService(Database::connection());
    }

    private function ip(Request $request): string
    {
        $ip = (string) ($request->getServerParams()['REMOTE_ADDR'] ?? 'cli');

        if ($ip === '::1') {
            return '127.0.0.1';
        }

        return $ip;
    }

    private function respond(Response $response, array $result): Response
    {
        $data = $result['data'] ?? [];
        $status = $result['status'] ?? 200;

        return $this->json(
            $response,
            is_array($data) ? $data : [],
            is_int($status) ? $status : 200
        );
    }
}