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

        $allowedOrigin = Env::get('CORS_ORIGIN', '*');
        // Env::get only returns null when no default is provided.
        \assert($allowedOrigin !== null);

        $response = $response
            ->withHeader('Access-Control-Allow-Origin', $allowedOrigin)
            ->withHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
            ->withHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

        if ($allowedOrigin !== '*') {
            $response = $response->withHeader('Access-Control-Allow-Credentials', 'true');
        }

        return $response;
    }
}