<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Support\Database;
use App\Support\JsonResponder;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class RecipeController
{
    use JsonResponder;

    public function byCountry(Request $request, Response $response, array $args): Response
    {
        $cid = (int) $args['id'];
        $pdo = Database::connection();

        $st = $pdo->prepare('SELECT id, name, emoji, tagline FROM countries WHERE id = ?');
        $st->execute([$cid]);
        $country = $st->fetch();
        if (!$country) {
            return $this->json($response, ['ok' => false, 'error' => 'País no encontrado.'], 404);
        }

        $st = $pdo->prepare(
            'SELECT id, name, description, difficulty, time_minutes, youtube_id
             FROM recipes WHERE country_id = ? ORDER BY id'
        );
        $st->execute([$cid]);
        $recipes = $st->fetchAll();

        if ($recipes) {
            $ids = array_column($recipes, 'id');
            $in  = implode(',', array_fill(0, count($ids), '?'));
            $st  = $pdo->prepare(
                "SELECT ri.recipe_id, i.id, i.name
                 FROM recipe_ingredient ri
                 JOIN ingredients i ON i.id = ri.ingredient_id
                 WHERE ri.recipe_id IN ($in)
                 ORDER BY i.name"
            );
            $st->execute($ids);
            $byRecipe = [];
            foreach ($st->fetchAll() as $row) {
                $byRecipe[$row['recipe_id']][] = ['id' => (int) $row['id'], 'name' => $row['name']];
            }
            foreach ($recipes as &$r) {
                $r['ingredients'] = $byRecipe[$r['id']] ?? [];
            }
            unset($r);
        }

        return $this->json($response, ['ok' => true, 'country' => $country, 'recipes' => $recipes]);
    }
}
