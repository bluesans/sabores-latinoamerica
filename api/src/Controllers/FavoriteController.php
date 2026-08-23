<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Support\Auth;
use App\Support\Database;
use App\Support\JsonResponder;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class FavoriteController
{
    use JsonResponder;

    public function index(Request $request, Response $response): Response
    {
        $user = Auth::userFromRequest($request);
        // AuthMiddleware always populates auth_user before this route runs.
        \assert($user !== null);
        $st = Database::connection()->prepare(
            'SELECT r.id, r.name, r.difficulty, r.time_minutes, c.id AS country_id, c.name AS country_name, c.emoji
             FROM favorites f
             JOIN recipes r ON r.id = f.recipe_id
             JOIN countries c ON c.id = r.country_id
             WHERE f.user_id = ?
             ORDER BY f.created_at DESC'
        );
        $st->execute([$user['user_id']]);

        return $this->json($response, ['ok' => true, 'favorites' => $st->fetchAll()]);
    }

    public function toggle(Request $request, Response $response): Response
    {
        $user = Auth::userFromRequest($request);
        // AuthMiddleware always populates auth_user before this route runs.
        \assert($user !== null);
        $b    = (array) $request->getParsedBody();
        $rid  = (int) ($b['recipe_id'] ?? 0);
        $pdo  = Database::connection();

        $st = $pdo->prepare('SELECT id FROM recipes WHERE id = ?');
        $st->execute([$rid]);
        if (!$st->fetch()) {
            return $this->json($response, ['ok' => false, 'error' => 'Receta inexistente.'], 404);
        }

        if (!empty($b['add'])) {
            $pdo->prepare('INSERT IGNORE INTO favorites (user_id, recipe_id) VALUES (?, ?)')
                ->execute([$user['user_id'], $rid]);
        } else {
            $pdo->prepare('DELETE FROM favorites WHERE user_id = ? AND recipe_id = ?')
                ->execute([$user['user_id'], $rid]);
        }

        return $this->json($response, ['ok' => true]);
    }
}
