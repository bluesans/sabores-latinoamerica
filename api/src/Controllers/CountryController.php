<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Support\Database;
use App\Support\JsonResponder;
use PDO;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class CountryController
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

        // Every selected column is grouped: ONLY_FULL_GROUP_BY-safe on both
        // MySQL and MariaDB (MariaDB does not infer functional dependency
        // from the primary key).
        $rows = $db->query(
            'SELECT c.id, c.iso_code, c.name, c.emoji, c.tagline, COUNT(r.id) AS recipe_count
             FROM countries c
             LEFT JOIN recipes r ON r.country_id = c.id
             GROUP BY c.id, c.iso_code, c.name, c.emoji, c.tagline
             ORDER BY c.id'
        )->fetchAll();

        foreach ($rows as &$r) { $r['recipe_count'] = (int) $r['recipe_count']; }
        unset($r);

        return $this->json($response, ['ok' => true, 'countries' => $rows]);
    }
}
