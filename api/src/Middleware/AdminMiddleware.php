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

        if (!$user) {
            return self::deny(401, 'Autenticación requerida.');
        }

        if (($user['role'] ?? 'user') !== 'admin') {
            return self::deny(403, 'Solo administradores.');
        }

        return $handler->handle($request);
    }

    private static function deny(int $status, string $error): Response
    {
        $response = new SlimResponse($status);
        $json = json_encode(['ok' => false, 'error' => $error], JSON_UNESCAPED_UNICODE);

        if ($json === false) {
            throw new \RuntimeException('No se pudo codificar la respuesta JSON.');
        }

        $response->getBody()->write($json);
        return $response->withHeader('Content-Type', 'application/json; charset=utf-8');
    }
}
