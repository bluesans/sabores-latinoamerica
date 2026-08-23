<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Support\Database;
use App\Support\JsonResponder;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Throwable;

final class HealthController
{
    use JsonResponder;

    public function index(Request $request, Response $response): Response
    {
        $dbOk = false;

        try {
            Database::connection()->query('SELECT 1');
            $dbOk = true;
        } catch (Throwable $e) {
            $dbOk = false;
        }

        return $this->json($response, [
            'ok' => $dbOk,
            'api' => true,
            'db' => $dbOk,
            'time' => date('c'),
        ], $dbOk ? 200 : 503);
    }
}