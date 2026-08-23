<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Support\Database;
use App\Support\JsonResponder;
use PDO;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Throwable;

final class HealthController
{
    use JsonResponder;

    /**
     * @param PDO|array<string,mixed>|null $pdo Optional PDO override (test
     *  injection). Slim's default invocation strategy always passes a third
     *  positional argument - the route-arguments array - so the parameter
     *  must tolerate arrays; anything that is not a PDO falls back to the
     *  shared Database::connection() handle.
     */
    public function index(Request $request, Response $response, PDO|array|null $pdo = null): Response
    {
        $db = $pdo instanceof PDO ? $pdo : Database::connection();
        $dbOk = false;

        try {
            $db->query('SELECT 1');
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