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
        // Silently cap oversized queries before they reach the LIKE patterns.
        if (mb_strlen($q) > 100) {
            $q = mb_substr($q, 0, 100);
        }
        $like = '%' . self::likeEscape($q) . '%';
        $pdo  = Database::connection();
        // SQL literal holding a single backslash (the LIKE escape character).
        $esc = "'\\\\'";

        $c = $pdo->prepare("SELECT id, name, emoji FROM countries WHERE name LIKE ? ESCAPE {$esc} AND id IN (SELECT DISTINCT country_id FROM recipes) ORDER BY name, id LIMIT 4");
        $c->execute([$like]);

        $r = $pdo->prepare(
            "SELECT r.id, r.name, c.id AS country_id, c.name AS country_name, c.emoji
             FROM recipes r JOIN countries c ON c.id = r.country_id
             WHERE r.name LIKE ? ESCAPE {$esc} OR r.description LIKE ? ESCAPE {$esc} ORDER BY r.id LIMIT 6"
        );
        $r->execute([$like, $like]);

        $i = $pdo->prepare(
            "SELECT i.id, i.name, COUNT(ri.recipe_id) AS uses
             FROM ingredients i LEFT JOIN recipe_ingredient ri ON ri.ingredient_id = i.id
             WHERE i.name LIKE ? ESCAPE {$esc} GROUP BY i.id, i.name ORDER BY uses DESC, i.name, i.id LIMIT 4"
        );
        $i->execute([$like]);

        return $this->json($response, [
            'ok' => true,
            'countries' => $c->fetchAll(),
            'recipes' => $r->fetchAll(),
            'ingredients' => $i->fetchAll(),
        ]);
    }

    /**
     * Escapes MySQL LIKE wildcards so user input is matched literally.
     * Backslash first (it is the LIKE escape char itself), then % and _.
     */
    private static function likeEscape(string $q): string
    {
        return addcslashes($q, '\\%_');
    }
}
