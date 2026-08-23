<?php
declare(strict_types=1);

namespace App\Middleware;

use App\Support\Auth;
use App\Support\Jwt;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\RequestHandlerInterface as Handler;
use Slim\Psr7\Response as SlimResponse;

final class AuthMiddleware
{
    public function __invoke(Request $request, Handler $handler): Response
    {
        $token = Auth::bearerToken($request);
        $payload = $token ? Jwt::decode($token) : null;

        if (!$payload) {
            $response = new SlimResponse(401);
            $json = json_encode(['ok' => false, 'error' => 'Necesitás iniciar sesión.'], JSON_UNESCAPED_UNICODE);
            \assert($json !== false);
            $response->getBody()->write($json);
            return $response->withHeader('Content-Type', 'application/json; charset=utf-8');
        }

        $request = $request->withAttribute('auth_user', [
            'user_id'  => (int) $payload['sub'],
            'username' => $payload['name'],
            'role'     => $payload['role'] ?? 'user',
        ]);

        return $handler->handle($request);
    }
}
