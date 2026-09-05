<?php
declare(strict_types=1);

namespace App\Middleware;

use App\Support\Env;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\RequestHandlerInterface as Handler;

final class CorsMiddleware
{
    public function __invoke(Request $request, Handler $handler): Response
    {
        $response = $handler->handle($request);

        $allowedOrigin = Env::get('CORS_ORIGIN', '');
        // Env::get only returns null when no default is provided.
        \assert($allowedOrigin !== null);

        // Same-origin posture: no CORS surface at all unless explicitly opened.
        if ($allowedOrigin === '') {
            return $response;
        }

        $response = $response
            ->withHeader('Access-Control-Allow-Origin', $allowedOrigin)
            ->withHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
            ->withHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
            ->withHeader('Vary', 'Origin')
            ->withHeader('Access-Control-Max-Age', '600');

        if ($allowedOrigin !== '*') {
            $response = $response->withHeader('Access-Control-Allow-Credentials', 'true');
        }

        return $response;
    }
}