<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Support\Database;
use App\Support\JsonResponder;
use App\Support\Validation;
use PDOException;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Throwable;

final class AdminController
{
    use JsonResponder;

    public function list(Request $request, Response $response): Response
    {
        $pdo = Database::connection();
        $stRecipes = $pdo->query(
            'SELECT r.id, r.country_id, r.name, r.description, r.difficulty, r.time_minutes, r.youtube_id, c.name AS country_name
             FROM recipes r JOIN countries c ON c.id = r.country_id
             ORDER BY c.id, r.id'
        );
        \assert($stRecipes !== false);
        $recipes = $stRecipes->fetchAll();
        $stIngs = $pdo->query(
            'SELECT ri.recipe_id, i.name FROM recipe_ingredient ri
             JOIN ingredients i ON i.id = ri.ingredient_id ORDER BY i.name'
        );
        \assert($stIngs !== false);
        $ings = $stIngs->fetchAll();

        foreach ($recipes as &$r) { $r['ingredients'] = []; }
        unset($r);
        foreach ($ings as $row) {
            foreach ($recipes as &$r) {
                if ((int) $r['id'] === (int) $row['recipe_id']) { $r['ingredients'][] = $row['name']; break; }
            }
        }
        unset($r);

        $stCountries = $pdo->query('SELECT id, name, emoji, tagline FROM countries ORDER BY id');
        \assert($stCountries !== false);
        $countries = $stCountries->fetchAll();
        $stIngredients = $pdo->query(
            'SELECT i.id, i.name, COUNT(ri.recipe_id) AS uses FROM ingredients i
             LEFT JOIN recipe_ingredient ri ON ri.ingredient_id = i.id GROUP BY i.id, i.name ORDER BY i.name'
        );
        \assert($stIngredients !== false);

        return $this->json($response, [
            'ok' => true,
            'recipes' => $recipes,
            'countries' => $countries,
            'ingredients' => $stIngredients->fetchAll(),
        ]);
    }

    public function saveRecipe(Request $request, Response $response): Response
    {
        $b    = (array) $request->getParsedBody();
        $name = trim((string) ($b['name'] ?? ''));
        $errors = [];

        // --- Validation happens BEFORE any transaction is opened. ---
        if ($name === '') {
            $errors['name'] = 'El nombre es obligatorio.';
        } elseif (mb_strlen($name) > 200) {
            $errors['name'] = 'El nombre no puede superar los 200 caracteres.';
        }

        $cid = Validation::positiveInt($b['country_id'] ?? null);
        if ($cid === null) {
            $errors['country_id'] = 'País inválido.';
        } else {
            $st = Database::connection()->prepare('SELECT 1 FROM countries WHERE id = ?');
            $st->execute([$cid]);
            if ($st->fetchColumn() === false) {
                $errors['country_id'] = 'País inválido.';
            }
        }

        $rawDifficulty = $b['difficulty'] ?? null;
        $difficulty = null;
        if ($rawDifficulty !== null && (string) $rawDifficulty !== '') {
            $difficulty = (string) $rawDifficulty;
            if (!Validation::difficulty($difficulty)) {
                $errors['difficulty'] = 'Dificultad inválida.';
            }
        }

        $rawTime = $b['time_minutes'] ?? null;
        $timeMinutes = null;
        if ($rawTime !== null && (string) $rawTime !== '') {
            $timeVal = is_int($rawTime)
                ? $rawTime
                : (is_string($rawTime) && preg_match('/^-?\d+$/', trim($rawTime)) === 1 ? (int) $rawTime : false);
            if ($timeVal === false || $timeVal < 0 || $timeVal > 100000) {
                $errors['time_minutes'] = 'Tiempo inválido.';
            } else {
                $timeMinutes = $timeVal;
            }
        }

        $rawYoutube = $b['youtube_id'] ?? null;
        $youtubeId = null;
        if ($rawYoutube !== null && (string) $rawYoutube !== '') {
            $trimmedInput = trim((string) $rawYoutube);
            $normalized = Validation::youtubeId((string) $rawYoutube);
            if ($normalized === '' || $normalized !== $trimmedInput) {
                $errors['youtube_id'] = 'ID de YouTube inválido (11 caracteres).';
            } else {
                $youtubeId = $normalized;
            }
        }

        $rawDescription = $b['description'] ?? null;
        $description = '';
        if ($rawDescription !== null && (string) $rawDescription !== '') {
            $description = (string) $rawDescription;
            if (mb_strlen($description) > 10000) {
                $errors['description'] = 'La descripción no puede superar los 10000 caracteres.';
            }
        }

        if ($errors !== []) {
            // Top-level `error` mirrors the first field message so the existing
            // toast path (api.js throws Error(data.error)) keeps working.
            return $this->json($response, [
                'ok' => false,
                'error' => reset($errors),
                'errors' => $errors,
            ], 422);
        }

        $pdo = Database::connection();
        try {
            $pdo->beginTransaction();

            $id = (int) ($b['id'] ?? 0);
            if ($id > 0) {
                $pdo->prepare('UPDATE recipes SET country_id=?, name=?, description=?, difficulty=?, time_minutes=?, youtube_id=? WHERE id=?')
                    ->execute([$cid, $name, $description, $difficulty, $timeMinutes, $youtubeId, $id]);
            } else {
                $pdo->prepare('INSERT INTO recipes (country_id, name, description, difficulty, time_minutes, youtube_id) VALUES (?,?,?,?,?,?)')
                    ->execute([$cid, $name, $description, $difficulty, $timeMinutes, $youtubeId]);
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
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log('[AdminController::saveRecipe] ' . $e);
            return $this->json($response, ['ok' => false, 'error' => 'Error interno del servidor.'], 500);
        }

        return $this->json($response, ['ok' => true, 'id' => $id]);
    }

    /** @param array<string, string> $args */
    public function deleteRecipe(Request $request, Response $response, array $args): Response
    {
        $st = Database::connection()->prepare('DELETE FROM recipes WHERE id = ?');
        $st->execute([(int) $args['id']]);
        if ($st->rowCount() === 0) {
            return $this->json($response, ['ok' => false, 'error' => 'Receta no encontrada.'], 404);
        }
        return $this->json($response, ['ok' => true]);
    }

    /** @param array<string, string> $args */
    public function saveCountry(Request $request, Response $response, array $args): Response
    {
        $id = (int) $args['id'];
        $pdo = Database::connection();

        $st = $pdo->prepare('SELECT 1 FROM countries WHERE id = ?');
        $st->execute([$id]);
        if ($st->fetchColumn() === false) {
            return $this->json($response, ['ok' => false, 'error' => 'País no encontrado.'], 404);
        }

        $b = (array) $request->getParsedBody();
        $emoji   = (string) ($b['emoji'] ?? '');
        $tagline = (string) ($b['tagline'] ?? '');
        $errors = [];

        if (mb_strlen($emoji) > 10) {
            $errors['emoji'] = 'El emoji no puede superar los 10 caracteres.';
        }
        if (mb_strlen($tagline) > 150) {
            $errors['tagline'] = 'El tagline no puede superar los 150 caracteres.';
        }
        if ($errors !== []) {
            return $this->json($response, [
                'ok' => false,
                'error' => reset($errors),
                'errors' => $errors,
            ], 422);
        }

        $pdo->prepare('UPDATE countries SET emoji = ?, tagline = ? WHERE id = ?')
            ->execute([$emoji, $tagline, $id]);
        return $this->json($response, ['ok' => true]);
    }

    /** @param array<string, string> $args */
    public function renameIngredient(Request $request, Response $response, array $args): Response
    {
        $b = (array) $request->getParsedBody();
        $name = trim((string) ($b['name'] ?? ''));
        $id = (int) $args['id'];

        if ($name === '') {
            return $this->json($response, [
                'ok' => false,
                'error' => 'El nombre es obligatorio.',
                'errors' => ['name' => 'El nombre es obligatorio.'],
            ], 422);
        }
        if (mb_strlen($name) > 200) {
            return $this->json($response, [
                'ok' => false,
                'error' => 'El nombre no puede superar los 200 caracteres.',
                'errors' => ['name' => 'El nombre no puede superar los 200 caracteres.'],
            ], 422);
        }

        try {
            $st = Database::connection()->prepare('UPDATE ingredients SET name = ? WHERE id = ?');
            $st->execute([$name, $id]);
            if ($st->rowCount() === 0) {
                // rowCount 0 also happens when the new name equals the old one;
                // only report 404 when the ingredient really does not exist.
                $check = Database::connection()->prepare('SELECT 1 FROM ingredients WHERE id = ?');
                $check->execute([$id]);
                if ($check->fetchColumn() === false) {
                    return $this->json($response, ['ok' => false, 'error' => 'Ingrediente no encontrado.'], 404);
                }
            }
        } catch (PDOException $e) {
            if ((int) ($e->errorInfo[1] ?? 0) === 1062 || $e->getCode() === '23000') {
                return $this->json($response, ['ok' => false, 'error' => 'Ese nombre ya existe.'], 409);
            }
            error_log('[AdminController::renameIngredient] ' . $e);
            return $this->json($response, ['ok' => false, 'error' => 'Error interno del servidor.'], 500);
        }
        return $this->json($response, ['ok' => true]);
    }

    /** @param array<string, string> $args */
    public function deleteIngredient(Request $request, Response $response, array $args): Response
    {
        $st = Database::connection()->prepare('DELETE FROM ingredients WHERE id = ?');
        $st->execute([(int) $args['id']]);
        if ($st->rowCount() === 0) {
            return $this->json($response, ['ok' => false, 'error' => 'Ingrediente no encontrado.'], 404);
        }
        return $this->json($response, ['ok' => true]);
    }
}
