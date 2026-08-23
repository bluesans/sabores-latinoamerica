<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\AuthService;
use App\Support\Auth;
use App\Support\Cookies;
use App\Support\Database;
use App\Support\JsonResponder;
use PDO;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class AuthController
{
    use JsonResponder;

    /**
     * Optional PDO override (integration tests bind the scratch schema);
     * production resolves Database::connection() lazily as before.
     */
    public function __construct(private ?PDO $pdo = null)
    {
    }

    public function register(Request $request, Response $response): Response
    {
        $b = (array) $request->getParsedBody();

        $username = trim((string) ($b['username'] ?? ''));
        $password = (string) ($b['password'] ?? '');

        $result = $this->service()->register($username, $password, $this->ip($request));

        return $this->respondWithSessionCookie($response, $result);
    }

    public function login(Request $request, Response $response): Response
    {
        $b = (array) $request->getParsedBody();

        $username = trim((string) ($b['username'] ?? ''));
        $password = (string) ($b['password'] ?? '');

        $result = $this->service()->login($username, $password, $this->ip($request));

        return $this->respondWithSessionCookie($response, $result);
    }

    public function check(Request $request, Response $response): Response
    {
        $user = Auth::userFromRequest($request);

        // AuthMiddleware always populates auth_user before this route runs.
        \assert($user !== null);

        // Verificar que el usuario todavía existe en la base de datos.
        // Sin esto, un JWT válido de un usuario borrado seguiría funcionando.
        $pdo = $this->pdo ?? Database::connection();
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
        // Cookie-first (todo 18); Authorization bearer kept as transition fallback.
        $cookieToken = $_COOKIE[Cookies::refreshCookieName()] ?? null;
        $token = is_string($cookieToken) && $cookieToken !== ''
            ? $cookieToken
            : Auth::bearerToken($request);

        $result = $this->service()->refresh($token);

        if (($result['ok'] ?? false) === true) {
            return $this->respondWithSessionCookie($response, $result);
        }

        // A failed refresh must evict the stale cookie client-side.
        return $this->respond(Cookies::clear($response), $result);
    }

    public function logout(Request $request, Response $response): Response
    {
        $b = (array) $request->getParsedBody();

        // Cookie-first; legacy body field kept as transition fallback.
        $cookieToken = $_COOKIE[Cookies::refreshCookieName()] ?? '';
        $refresh = is_string($cookieToken) && $cookieToken !== ''
            ? $cookieToken
            : (string) ($b['refresh'] ?? '');

        $result = $this->service()->logout($refresh);

        // Always expire the cookie, even when there was nothing to revoke.
        return $this->respond(Cookies::clear($response), $result);
    }

    private function service(): AuthService
    {
        return new AuthService($this->pdo ?? Database::connection());
    }

    private function ip(Request $request): string
    {
        $ip = (string) ($request->getServerParams()['REMOTE_ADDR'] ?? 'cli');

        if ($ip === '::1') {
            return '127.0.0.1';
        }

        return $ip;
    }

    /**
     * Success responses carrying a fresh refresh token move it out of the JSON
     * body and into the HttpOnly cookie (todo 18).
     *
     * @param array{ok: bool, status: int, data: array<string, mixed>, headers: array<string, string>} $result
     */
    private function respondWithSessionCookie(Response $response, array $result): Response
    {
        $refresh = (string) ($result['data']['refresh'] ?? '');
        unset($result['data']['refresh']);

        if ($refresh !== '') {
            $response = Cookies::issue($response, $refresh);
        }

        return $this->respond($response, $result);
    }

    /** @param array{ok: bool, status: int, data: array<string, mixed>, headers: array<string, string>} $result */
    private function respond(Response $response, array $result): Response
    {
        $data = $result['data'] ?? [];
        $status = $result['status'] ?? 200;

        // Optional hint headers from the service layer (e.g. Retry-After on 429).
        foreach ((array) ($result['headers'] ?? []) as $name => $value) {
            $response = $response->withHeader((string) $name, (string) $value);
        }

        return $this->json(
            $response,
            is_array($data) ? $data : [],
            is_int($status) ? $status : 200
        );
    }
}