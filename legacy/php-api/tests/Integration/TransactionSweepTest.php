<?php
declare(strict_types=1);

namespace Tests\Integration;

use App\Controllers\AdminController;
use App\Support\Database;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\Psr7\Factory\RequestFactory;
use Slim\Psr7\Factory\ResponseFactory;

use function TestDb_pdo;
use function TestDb_reloadSchema;

/**
 * Todo 26 - transaction & write-path sweep.
 *
 * AUDIT (verified by code read + git history, no production change required):
 *  - saveRecipe is the ONLY multi-statement admin write. It is wrapped in
 *    beginTransaction/commit with a catch (Throwable) that rolls back while
 *    still inTransaction() and maps any failure to error_log + generic 500
 *    (todo 13).
 *  - renameIngredient maps duplicate-name violations (errno 1062 / SQLSTATE
 *    23000) to 409 and ANY OTHER PDOException to error_log + generic 500.
 *    That breadth was already introduced in commit 025bdb2 (todo 14), so this
 *    todo's "broaden the catch" sub-point is verified by code read; forcing an
 *    artificial generic PDOException would require a mock PDO wrapper, which
 *    was deliberately rejected as overkill. The reachable failure modes ARE
 *    automated in AdminValidationTest: duplicate -> 409 and rowCount-based
 *    unknown-id -> 404.
 *  - AuthService::refresh holds the only other beginTransaction in api/src;
 *    it is guarded by try/catch (Throwable) with an inTransaction()-checked
 *    rollBack before rethrowing.
 *  - Remaining admin writes (saveCountry UPDATE, deleteRecipe,
 *    deleteIngredient) are single statements - atomic on their own - and any
 *    PDOException bubbles to JsonErrorHandler, which logs full detail
 *    server-side behind an error id and returns a generic
 *    'Error interno del servidor.' unless debug details are explicitly on.
 *
 * What THIS class automates is the cascade contract promised by the admin.js
 * confirm copy ('¿Eliminar ingrediente? Se quitará de las recetas que lo
 * usen.'): deleting a seeded, heavily-used ingredient must remove its
 * recipe_ingredient links (fk_ri_ingredient ON DELETE CASCADE) while leaving
 * every recipe row intact.
 */
final class TransactionSweepTest extends TestCase
{
    /** Seed ingredient 'Cebolla' - linked to many recipes by 000_install.sql. */
    private const SEED_CEBOLLA_ID = 6;
    private const SEED_RECIPE_COUNT = 57;

    private AdminController $controller;

    public static function setUpBeforeClass(): void
    {
        // Bind the Database singleton to the scratch schema BEFORE any
        // controller call opens a connection in this process (idempotent:
        // AdminValidationTest sets the same value when it ran first).
        $_ENV['DB_NAME'] = 'sabores_latinoamerica_test';
    }

    protected function setUp(): void
    {
        // Full DROP/CREATE/import per test: this class deletes seeded rows,
        // so every test must start from the canonical seed regardless of
        // execution order, and nothing this class destroys may leak into
        // other tests (tearDownAfterClass restores the seed as well).
        TestDb_reloadSchema();
        $this->controller = new AdminController();
    }

    public static function tearDownAfterClass(): void
    {
        // Leave the scratch seed pristine for any class ordered after this one.
        TestDb_reloadSchema();
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private function deleteIngredientViaController(int $id): ResponseInterface
    {
        try {
            $request = (new RequestFactory())->createRequest('DELETE', 'http://localhost/admin/ingredients/' . $id);
            // Slim's factory always builds full server requests; the PSR-17
            // return type is just the narrower RequestInterface contract.
            \assert($request instanceof ServerRequestInterface);

            return $this->controller->deleteIngredient(
                $request,
                (new ResponseFactory())->createResponse(),
                ['id' => (string) $id]
            );
        } finally {
            $pdo = Database::connection();
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
        }
    }

    /** @return array<string, mixed> */
    private function body(ResponseInterface $response): array
    {
        $response->getBody()->seek(0);
        $raw = (string) $response->getBody();
        $decoded = json_decode($raw, true);
        $this->assertIsArray($decoded, "Response body is not JSON: {$raw}");
        return $decoded;
    }

    /**
     * @return array{0: int, 1: list<int>} linked-row count and the recipe ids using the ingredient
     */
    private function usageOf(int $ingredientId): array
    {
        $st = TestDb_pdo()->prepare(
            'SELECT recipe_id FROM recipe_ingredient WHERE ingredient_id = ? ORDER BY recipe_id'
        );
        $st->execute([$ingredientId]);
        $recipeIds = array_map('intval', $st->fetchAll(\PDO::FETCH_COLUMN, 0));
        return [count($recipeIds), $recipeIds];
    }

    private function totalRecipes(): int
    {
        return $this->scalarCount('SELECT COUNT(*) FROM recipes');
    }

    /** Behavior-free helper: runs a scalar COUNT and asserts prepare success. */
    private function scalarCount(string $sql): int
    {
        $st = TestDb_pdo()->query($sql);
        \assert($st !== false);
        return (int) $st->fetchColumn();
    }

    // ------------------------------------------------------------------
    // Cascade semantics behind the admin.js confirm copy
    // ------------------------------------------------------------------

    public function testDeleteSeededIngredientCascadesLinksAndKeepsRecipes(): void
    {
        $id = self::SEED_CEBOLLA_ID;

        [$usesBefore, $linkedRecipeIds] = $this->usageOf($id);
        $this->assertGreaterThan(1, $usesBefore, 'seed ingredient must be used by multiple recipes');
        $this->assertSame(self::SEED_RECIPE_COUNT, $this->totalRecipes(), 'canonical seed must hold 57 recipes');

        $res = $this->deleteIngredientViaController($id);

        $this->assertSame(200, $res->getStatusCode());
        $data = $this->body($res);
        $this->assertTrue($data['ok']);

        // 1) The ingredient row itself is gone.
        $st = TestDb_pdo()->prepare('SELECT 1 FROM ingredients WHERE id = ?');
        $st->execute([$id]);
        $this->assertFalse($st->fetchColumn(), 'ingredient row must be gone');

        // 2) Every recipe_ingredient link cascaded away...
        [$usesAfter] = $this->usageOf($id);
        $this->assertSame(0, $usesAfter, 'all recipe_ingredient rows for the ingredient must be gone');

        // 3) ...but NO recipe was removed: only its link to the ingredient.
        $this->assertSame(self::SEED_RECIPE_COUNT, $this->totalRecipes(), 'recipes must survive the cascade');
        foreach ($linkedRecipeIds as $rid) {
            $st = TestDb_pdo()->prepare('SELECT 1 FROM recipes WHERE id = ?');
            $st->execute([$rid]);
            $this->assertTrue((bool) $st->fetchColumn(), "recipe {$rid} must still exist after cascade");
        }

        // 4) Other ingredients' links were untouched (spot-check sibling id 8 'Limón').
        [, $limonLinks] = $this->usageOf(8);
        $this->assertGreaterThan(0, count($limonLinks), "unrelated ingredients must keep their links");
    }

    public function testDeleteUnknownIngredientStillReturns404WithoutSideEffects(): void
    {
        // Regression guard paired with AdminValidationTest::testDeleteIngredientMissingReturns404:
        // the rowCount-based guard must keep answering 404 after any refactor
        // of the delete path, and must not mutate anything.
        $before = [
            'ingredients' => $this->scalarCount('SELECT COUNT(*) FROM ingredients'),
            'links' => $this->scalarCount('SELECT COUNT(*) FROM recipe_ingredient'),
            'recipes' => $this->totalRecipes(),
        ];

        $res = $this->deleteIngredientViaController(999999);

        $this->assertSame(404, $res->getStatusCode());
        $data = $this->body($res);
        $this->assertFalse($data['ok']);
        $this->assertSame('Ingrediente no encontrado.', $data['error'] ?? null);

        $after = [
            'ingredients' => $this->scalarCount('SELECT COUNT(*) FROM ingredients'),
            'links' => $this->scalarCount('SELECT COUNT(*) FROM recipe_ingredient'),
            'recipes' => $this->totalRecipes(),
        ];
        $this->assertSame($before, $after, 'a 404 delete must not change any row counts');
    }
}
