<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Support\Database;
use App\Support\JsonResponder;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class CountryController
{
    use JsonResponder;

    public function index(Request $request, Response $response): Response
    {
        $rows = Database::connection()->query(
            'SELECT c.id, c.iso_code, c.name, c.emoji, c.tagline, COUNT(r.id) AS recipe_count
             FROM countries c
             LEFT JOIN recipes r ON r.country_id = c.id
             GROUP BY c.id
             ORDER BY c.id'
        )->fetchAll();

        foreach ($rows as &$r) { $r['recipe_count'] = (int) $r['recipe_count']; }
        unset($r);

        return $this->json($response, ['ok' => true, 'countries' => $rows]);
    }
}
