<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Support\Database;
use App\Support\JsonResponder;
use App\Support\Validation;
use PDO;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class RecipeController
{
    use JsonResponder;

    /** @param array<string, string> $args */
    public function byCountry(Request $request, Response $response, array $args): Response
    {
        $cid = Validation::positiveInt($args['id'] ?? null);
        if ($cid === null) {
            return $this->json($response, ['ok' => false, 'error' => 'Identificador inválido.'], 400);
        }

        $params = $request->getQueryParams();
        $page = 1;
        if (($params['page'] ?? null) !== null) {
            $page = Validation::positiveInt($params['page']);
            if ($page === null) {
                return $this->json($response, ['ok' => false, 'error' => 'Parámetro page inválido.'], 400);
            }
        }
        $perPage = 0;
        if (($params['per_page'] ?? null) !== null) {
            $perPage = Validation::positiveInt($params['per_page']);
            if ($perPage === null || $perPage > 100) {
                return $this->json($response, ['ok' => false, 'error' => 'Parámetro per_page inválido.'], 400);
            }
        }

        $pdo = Database::connection();

        $st = $pdo->prepare('SELECT id, name, emoji, tagline FROM countries WHERE id = ?');
        $st->execute([$cid]);
        $country = $st->fetch();
        if (!$country) {
            return $this->json($response, ['ok' => false, 'error' => 'País no encontrado.'], 404);
        }

        $st = $pdo->prepare('SELECT COUNT(*) FROM recipes WHERE country_id = ?');
        $st->execute([$cid]);
        $total = (int) $st->fetchColumn();

        if ($perPage > 0) {
            $offset = ($page - 1) * $perPage;
            $st = $pdo->prepare(
                'SELECT id, name, description, difficulty, time_minutes, youtube_id
                 FROM recipes WHERE country_id = ? ORDER BY id LIMIT ? OFFSET ?'
            );
            $st->bindValue(1, $cid, PDO::PARAM_INT);
            $st->bindValue(2, $perPage, PDO::PARAM_INT);
            $st->bindValue(3, $offset, PDO::PARAM_INT);
            $st->execute();
        } else {
            $st = $pdo->prepare(
                'SELECT id, name, description, difficulty, time_minutes, youtube_id
                 FROM recipes WHERE country_id = ? ORDER BY id'
            );
            $st->execute([$cid]);
        }
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

        return $this->json($response, [
            'ok' => true,
            'country' => $country,
            'recipes' => $recipes,
            'pagination' => [
                'page' => $page,
                'per_page' => $perPage > 0 ? $perPage : $total,
                'total' => $total,
                'total_pages' => $this->totalPages($total, $perPage),
            ],
        ]);
    }

    private function totalPages(int $total, int $perPage): int
    {
        if ($perPage <= 0) {
            return 1;
        }

        return max(1, (int) ceil($total / $perPage));
    }
}
