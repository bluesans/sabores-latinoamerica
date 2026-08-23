<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Support\Database;
use App\Support\JsonResponder;
use PDOException;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class AdminController
{
    use JsonResponder;

    public function list(Request $request, Response $response): Response
    {
        $pdo = Database::connection();
        $recipes = $pdo->query(
            'SELECT r.id, r.country_id, r.name, r.description, r.difficulty, r.time_minutes, r.youtube_id, c.name AS country_name
             FROM recipes r JOIN countries c ON c.id = r.country_id
             ORDER BY c.id, r.id'
        )->fetchAll();
        $ings = $pdo->query(
            'SELECT ri.recipe_id, i.name FROM recipe_ingredient ri
             JOIN ingredients i ON i.id = ri.ingredient_id ORDER BY i.name'
        )->fetchAll();

        foreach ($recipes as &$r) { $r['ingredients'] = []; }
        unset($r);
        foreach ($ings as $row) {
            foreach ($recipes as &$r) {
                if ((int) $r['id'] === (int) $row['recipe_id']) { $r['ingredients'][] = $row['name']; break; }
            }
        }
        unset($r);

        return $this->json($response, [
            'ok' => true,
            'recipes' => $recipes,
            'countries' => $pdo->query('SELECT id, name, emoji, tagline FROM countries ORDER BY id')->fetchAll(),
            'ingredients' => $pdo->query(
                'SELECT i.id, i.name, COUNT(ri.recipe_id) AS uses FROM ingredients i
                 LEFT JOIN recipe_ingredient ri ON ri.ingredient_id = i.id GROUP BY i.id, i.name ORDER BY i.name'
            )->fetchAll(),
        ]);
    }

    public function saveRecipe(Request $request, Response $response): Response
    {
        $b    = (array) $request->getParsedBody();
        $name = trim((string) ($b['name'] ?? ''));
        $cid  = (int) ($b['country_id'] ?? 0);
        if ($name === '' || $cid <= 0) {
            return $this->json($response, ['ok' => false, 'error' => 'Nombre y país son obligatorios.'], 422);
        }

        $pdo = Database::connection();
        $pdo->beginTransaction();

        $id = (int) ($b['id'] ?? 0);
        if ($id > 0) {
            $pdo->prepare('UPDATE recipes SET country_id=?, name=?, description=?, difficulty=?, time_minutes=?, youtube_id=? WHERE id=?')
                ->execute([$cid, $name, (string) ($b['description'] ?? ''), $b['difficulty'] ?? null,
                           (int) ($b['time_minutes'] ?? 0), (string) ($b['youtube_id'] ?? '') ?: null, $id]);
        } else {
            $pdo->prepare('INSERT INTO recipes (country_id, name, description, difficulty, time_minutes, youtube_id) VALUES (?,?,?,?,?,?)')
                ->execute([$cid, $name, (string) ($b['description'] ?? ''), $b['difficulty'] ?? null,
                           (int) ($b['time_minutes'] ?? 0), (string) ($b['youtube_id'] ?? '') ?: null]);
            $id = (int) $pdo->lastInsertId();
        }

        $pdo->prepare('DELETE FROM recipe_ingredient WHERE recipe_id = ?')->execute([$id]);
        foreach ((array) ($b['ingredients'] ?? []) as $nm) {
            $nm = trim((string) $nm);
            if ($nm === '') continue;
            $pdo->prepare('INSERT IGNORE INTO ingredients (name) VALUES (?)')->execute([$nm]);
            $st = $pdo->prepare('SELECT id FROM ingredients WHERE name = ?');
            $st->execute([$nm]);
            $iid = (int) $st->fetchColumn();
            if ($iid) {
                $pdo->prepare('INSERT IGNORE INTO recipe_ingredient (recipe_id, ingredient_id) VALUES (?, ?)')->execute([$id, $iid]);
            }
        }
        $pdo->commit();

        return $this->json($response, ['ok' => true, 'id' => $id]);
    }

    public function deleteRecipe(Request $request, Response $response, array $args): Response
    {
        Database::connection()->prepare('DELETE FROM recipes WHERE id = ?')->execute([(int) $args['id']]);
        return $this->json($response, ['ok' => true]);
    }

    public function saveCountry(Request $request, Response $response, array $args): Response
    {
        $b = (array) $request->getParsedBody();
        Database::connection()->prepare('UPDATE countries SET emoji = ?, tagline = ? WHERE id = ?')
            ->execute([(string) ($b['emoji'] ?? ''), (string) ($b['tagline'] ?? ''), (int) $args['id']]);
        return $this->json($response, ['ok' => true]);
    }

    public function renameIngredient(Request $request, Response $response, array $args): Response
    {
        $b = (array) $request->getParsedBody();
        try {
            Database::connection()->prepare('UPDATE ingredients SET name = ? WHERE id = ?')
                ->execute([trim((string) ($b['name'] ?? '')), (int) $args['id']]);
        } catch (PDOException $e) {
            return $this->json($response, ['ok' => false, 'error' => 'Ese nombre ya existe.'], 409);
        }
        return $this->json($response, ['ok' => true]);
    }

    public function deleteIngredient(Request $request, Response $response, array $args): Response
    {
        Database::connection()->prepare('DELETE FROM ingredients WHERE id = ?')->execute([(int) $args['id']]);
        return $this->json($response, ['ok' => true]);
    }
}
