<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Support\Database;
use App\Support\JsonResponder;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class SearchController
{
    use JsonResponder;

    public function index(Request $request, Response $response): Response
    {
        $q = trim((string) ($request->getQueryParams()['q'] ?? ''));
        if (mb_strlen($q) < 2) {
            return $this->json($response, ['ok' => true, 'countries' => [], 'recipes' => [], 'ingredients' => []]);
        }
        $like = '%' . $q . '%';
        $pdo  = Database::connection();

        $c = $pdo->prepare('SELECT id, name, emoji FROM countries WHERE name LIKE ? AND id IN (SELECT DISTINCT country_id FROM recipes) LIMIT 4');
        $c->execute([$like]);

        $r = $pdo->prepare(
            'SELECT r.id, r.name, c.id AS country_id, c.name AS country_name, c.emoji
             FROM recipes r JOIN countries c ON c.id = r.country_id
             WHERE r.name LIKE ? OR r.description LIKE ? LIMIT 6'
        );
        $r->execute([$like, $like]);

        $i = $pdo->prepare(
            'SELECT i.id, i.name, COUNT(ri.recipe_id) AS uses
             FROM ingredients i LEFT JOIN recipe_ingredient ri ON ri.ingredient_id = i.id
             WHERE i.name LIKE ? GROUP BY i.id, i.name ORDER BY uses DESC LIMIT 4'
        );
        $i->execute([$like]);

        return $this->json($response, [
            'ok' => true,
            'countries' => $c->fetchAll(),
            'recipes' => $r->fetchAll(),
            'ingredients' => $i->fetchAll(),
        ]);
    }
}
