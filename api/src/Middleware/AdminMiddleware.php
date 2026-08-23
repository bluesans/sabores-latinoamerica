<?php
declare(strict_types=1);

namespace App\Middleware;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\RequestHandlerInterface as Handler;
use Slim\Psr7\Response as SlimResponse;

/** Debe aplicarse siempre después de AuthMiddleware (que llena "auth_user"). */
final class AdminMiddleware
{
    public function __invoke(Request $request, Handler $handler): Response
    {
        $user = $request->getAttribute('auth_user');
        if (!$user || ($user['role'] ?? 'user') !== 'admin') {
            $response = new SlimResponse(403);
            $json = json_encode(['ok' => false, 'error' => 'Solo administradores.'], JSON_UNESCAPED_UNICODE);
            \assert($json !== false);
            $response->getBody()->write($json);
            return $response->withHeader('Content-Type', 'application/json; charset=utf-8');
        }
        return $handler->handle($request);
    }
}
