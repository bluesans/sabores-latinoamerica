<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Support\Database;
use App\Support\JsonResponder;
use PDO;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class StatsController
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

        // Same math as v_estadisticas, inlined so /stats keeps working when
        // the view is absent and stays portable across installs.
        $stats = $db->query(
            'SELECT
                (SELECT COUNT(DISTINCT country_id) FROM recipes) AS paises_con_recetas,
                (SELECT COUNT(*) FROM recipes) AS total_recetas,
                (SELECT COUNT(*) FROM ingredients) AS ingredientes_distintos,
                (SELECT COUNT(*) FROM recipes WHERE youtube_id IS NOT NULL AND youtube_id <> \'\') AS recetas_con_video'
        )->fetch();

        $top = $db->query(
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
