<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Support\Database;
use App\Support\JsonResponder;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class StatsController
{
    use JsonResponder;

    public function index(Request $request, Response $response): Response
    {
        $pdo = Database::connection();
        $stats = $pdo->query('SELECT * FROM v_estadisticas')->fetch();
        $top = $pdo->query(
            'SELECT i.id, i.name, COUNT(*) AS uses
             FROM recipe_ingredient ri
             JOIN ingredients i ON i.id = ri.ingredient_id
             GROUP BY i.id, i.name
             ORDER BY uses DESC, i.name
             LIMIT 8'
        )->fetchAll();

        return $this->json($response, ['ok' => true, 'stats' => $stats, 'top_ingredients' => $top]);
    }
}
