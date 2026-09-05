<?php
declare(strict_types=1);

use App\Controllers\AdminController;
use App\Controllers\AuthController;
use App\Controllers\CountryController;
use App\Controllers\FavoriteController;
use App\Controllers\HealthController;
use App\Controllers\IngredientController;
use App\Controllers\RecipeController;
use App\Controllers\SearchController;
use App\Controllers\StatsController;
use App\Middleware\AdminMiddleware;
use App\Middleware\AuthMiddleware;
use Slim\App;

return function (App $app): void {
    // ---------- Salud ----------
    $app->get('/health', [HealthController::class, 'index']);

    // ---------- Auth ----------
    $app->post('/auth/register', [AuthController::class, 'register']);
    $app->post('/auth/login', [AuthController::class, 'login']);
    $app->post('/auth/logout', [AuthController::class, 'logout']);
    $app->post('/auth/refresh', [AuthController::class, 'refresh']);
    $app->get('/auth/check', [AuthController::class, 'check'])->add(AuthMiddleware::class);

    // ---------- Recursos protegidos ----------
    $app->get('/countries', [CountryController::class, 'index'])->add(AuthMiddleware::class);
    $app->get('/countries/{id:[0-9]+}/recipes', [RecipeController::class, 'byCountry'])->add(AuthMiddleware::class);
    $app->get('/stats', [StatsController::class, 'index'])->add(AuthMiddleware::class);
    $app->get('/ingredients/{id:[0-9]+}', [IngredientController::class, 'show'])->add(AuthMiddleware::class);
    $app->get('/search', [SearchController::class, 'index'])->add(AuthMiddleware::class);

    $app->get('/favorites', [FavoriteController::class, 'index'])->add(AuthMiddleware::class);
    $app->post('/favorites', [FavoriteController::class, 'toggle'])->add(AuthMiddleware::class);

    // ---------- Administración ----------
    $app->group('/admin', function ($group) {
        $group->get('/data', [AdminController::class, 'list']);
        $group->post('/recipes', [AdminController::class, 'saveRecipe']);
        $group->delete('/recipes/{id}', [AdminController::class, 'deleteRecipe']);
        $group->put('/countries/{id}', [AdminController::class, 'saveCountry']);
        $group->put('/ingredients/{id}', [AdminController::class, 'renameIngredient']);
        $group->delete('/ingredients/{id}', [AdminController::class, 'deleteIngredient']);
        $group->get('/sessions', [AdminController::class, 'sessions']);
        $group->delete('/sessions/{id:[0-9]+}', [AdminController::class, 'revokeSession']);
    })->add(AdminMiddleware::class)->add(AuthMiddleware::class);
};