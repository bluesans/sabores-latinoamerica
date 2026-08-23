<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Support\Database;
use App\Support\JsonResponder;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class IngredientController
{
    use JsonResponder;

    public function show(Request $request, Response $response, array $args): Response
    {
        $id  = (int) $args['id'];
        $pdo = Database::connection();

        $st = $pdo->prepare('SELECT id, name FROM ingredients WHERE id = ?');
        $st->execute([$id]);
        $ing = $st->fetch();
        if (!$ing) {
            return $this->json($response, ['ok' => false, 'error' => 'Ingrediente no encontrado.'], 404);
        }

        $st = $pdo->prepare(
            'SELECT r.id AS recipe_id, r.name AS recipe_name, r.difficulty,
                    c.id AS country_id, c.name AS country_name, c.emoji
             FROM recipe_ingredient ri
             JOIN recipes   r ON r.id = ri.recipe_id
             JOIN countries c ON c.id = r.country_id
             WHERE ri.ingredient_id = ?
             ORDER BY c.name, r.name'
        );
        $st->execute([$id]);

        return $this->json($response, ['ok' => true, 'ingredient' => $ing, 'recipes' => $st->fetchAll()]);
    }
}
