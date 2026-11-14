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
 * Failure-first integration coverage for the admin write path (todos 13 & 14).
 *
 * Calls AdminController methods directly with Slim PSR-7 objects against the
 * real scratch MySQL schema (sabores_latinoamerica_test). The schema is
 * reloaded before this class runs so every execution starts from the canonical
 * seed (countries 1..22, recipes 1..57) regardless of test order.
 */
final class AdminValidationTest extends TestCase
{
    private const MISSING_COUNTRY_ID = 99999;
    private const MISSING_INGREDIENT_ID = 999999;
    private const MISSING_RECIPE_ID = 999999;

    private AdminController $controller;

    public static function setUpBeforeClass(): void
    {
        // Bind the Database singleton to the scratch schema BEFORE any
        // controller call opens a connection in this process.
        $_ENV['DB_NAME'] = 'sabores_latinoamerica_test';
        TestDb_reloadSchema();
    }

    protected function setUp(): void
    {
        $this->controller = new AdminController();
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    /**
     * @param array<string, mixed>|null $parsedBody
     */
    private function request(string $method, string $path, ?array $parsedBody = null): ServerRequestInterface
    {
        $request = (new RequestFactory())->createRequest($method, 'http://localhost' . $path);
        // Slim's factory always builds full server requests; the PSR-17 return
        // type is just the narrower RequestInterface contract.
        \assert($request instanceof ServerRequestInterface);
        if ($parsedBody !== null) {
            $request = $request->withParsedBody($parsedBody);
        }
        return $request;
    }

    /**
     * Runs a controller callable and guarantees no transaction is left dangling
     * on the shared Database singleton if the current implementation throws
     * mid-transaction (expected while the fix is still red).
     */
    private function invoke(callable $fn): ResponseInterface
    {
        try {
            return $fn();
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

    /** @param array<string, mixed> $payload */
    private function saveRecipe(array $payload): ResponseInterface
    {
        return $this->invoke(
            fn (): ResponseInterface => $this->controller->saveRecipe(
                $this->request('POST', '/admin/recipes', $payload),
                (new ResponseFactory())->createResponse()
            )
        );
    }

    /** @param array<string, mixed> $payload */
    private function saveCountry(string $id, array $payload): ResponseInterface
    {
        return $this->invoke(
            fn (): ResponseInterface => $this->controller->saveCountry(
                $this->request('PUT', '/admin/countries/' . $id, $payload),
                (new ResponseFactory())->createResponse(),
                ['id' => $id]
            )
        );
    }

    /** @param array<string, mixed> $payload */
    private function renameIngredient(string $id, array $payload): ResponseInterface
    {
        return $this->invoke(
            fn (): ResponseInterface => $this->controller->renameIngredient(
                $this->request('PUT', '/admin/ingredients/' . $id, $payload),
                (new ResponseFactory())->createResponse(),
                ['id' => $id]
            )
        );
    }

    private function deleteIngredient(string $id): ResponseInterface
    {
        return $this->invoke(
            fn (): ResponseInterface => $this->controller->deleteIngredient(
                $this->request('DELETE', '/admin/ingredients/' . $id),
                (new ResponseFactory())->createResponse(),
                ['id' => $id]
            )
        );
    }

    private function deleteRecipe(string $id): ResponseInterface
    {
        return $this->invoke(
            fn (): ResponseInterface => $this->controller->deleteRecipe(
                $this->request('DELETE', '/admin/recipes/' . $id),
                (new ResponseFactory())->createResponse(),
                ['id' => $id]
            )
        );
    }

    /**
     * @param array<string, mixed> $overrides
     * @return array<string, mixed>
     */
    private function validRecipePayload(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Receta de prueba',
            'country_id' => 1,
        ], $overrides);
    }

    private function insertIngredient(string $name): int
    {
        $pdo = TestDb_pdo();
        $pdo->prepare('INSERT INTO ingredients (name) VALUES (?)')->execute([$name]);
        return (int) $pdo->lastInsertId();
    }

    /** @return array<string, mixed>|null */
    private function recipeRow(int $id): ?array
    {
        $st = TestDb_pdo()->prepare('SELECT * FROM recipes WHERE id = ?');
        $st->execute([$id]);
        $row = $st->fetch();
        return $row === false ? null : $row;
    }

    // ------------------------------------------------------------------
    // TODO 13 - saveRecipe validation matrix
    // ------------------------------------------------------------------

    public function testMissingNameIsRejectedWith422AndFieldError(): void
    {
        $res = $this->saveRecipe($this->validRecipePayload(['name' => '   ']));

        $this->assertSame(422, $res->getStatusCode());
        $data = $this->body($res);
        $this->assertFalse($data['ok']);
        $this->assertSame('El nombre es obligatorio.', $data['errors']['name'] ?? null);
    }

    public function testNameLongerThan200IsRejectedWith422(): void
    {
        $res = $this->saveRecipe($this->validRecipePayload(['name' => str_repeat('a', 201)]));

        $this->assertSame(422, $res->getStatusCode());
        $data = $this->body($res);
        $this->assertSame('El nombre no puede superar los 200 caracteres.', $data['errors']['name'] ?? null);
    }

    public function testNonNumericCountryIdIsRejectedWith422(): void
    {
        $res = $this->saveRecipe($this->validRecipePayload(['country_id' => 'abc']));

        $this->assertSame(422, $res->getStatusCode());
        $data = $this->body($res);
        $this->assertSame('País inválido.', $data['errors']['country_id'] ?? null);
    }

    public function testUnknownCountryIdIsRejectedWith422(): void
    {
        $res = $this->saveRecipe($this->validRecipePayload(['country_id' => self::MISSING_COUNTRY_ID]));

        $this->assertSame(422, $res->getStatusCode());
        $data = $this->body($res);
        $this->assertSame('País inválido.', $data['errors']['country_id'] ?? null);
    }

    public function testInvalidDifficultyIsRejectedWith422(): void
    {
        $res = $this->saveRecipe($this->validRecipePayload(['difficulty' => 'impossible']));

        $this->assertSame(422, $res->getStatusCode());
        $data = $this->body($res);
        $this->assertSame('Dificultad inválida.', $data['errors']['difficulty'] ?? null);
    }

    public function testInvalidTimeMinutesValuesAreRejectedWith422(): void
    {
        foreach (['abc', '-5', '30.5', 100001] as $badTime) {
            $label = 'time_minutes=' . var_export($badTime, true);
            $res = $this->saveRecipe($this->validRecipePayload(['time_minutes' => $badTime]));

            $this->assertSame(422, $res->getStatusCode(), $label);
            $data = $this->body($res);
            $this->assertSame('Tiempo inválido.', $data['errors']['time_minutes'] ?? null, $label);
        }
    }

    public function testInvalidYoutubeIdIsRejectedWith422(): void
    {
        // 'short': too short. 'MWo42SO1aOMX': 12 chars.
        // 'MWo42SO1aO M': internal whitespace makes normalized value differ
        // from the trimmed input, which the contract also rejects.
        foreach (['short', 'MWo42SO1aOMX', 'MWo42SO1aO M'] as $badYt) {
            $label = 'youtube_id=' . var_export($badYt, true);
            $res = $this->saveRecipe($this->validRecipePayload(['youtube_id' => $badYt]));

            $this->assertSame(422, $res->getStatusCode(), $label);
            $data = $this->body($res);
            $this->assertSame(
                'ID de YouTube inválido (11 caracteres).',
                $data['errors']['youtube_id'] ?? null,
                $label
            );
        }
    }

    public function testDescriptionOver10000CharsIsRejectedNotTruncated(): void
    {
        $res = $this->saveRecipe($this->validRecipePayload(['description' => str_repeat('x', 10001)]));

        $this->assertSame(422, $res->getStatusCode());
        $data = $this->body($res);
        $this->assertSame(
            'La descripción no puede superar los 10000 caracteres.',
            $data['errors']['description'] ?? null
        );
    }

    public function testTopLevelErrorCarriesFirstFieldMessage(): void
    {
        $res = $this->saveRecipe(['name' => '', 'country_id' => 0, 'difficulty' => 'nope']);

        $this->assertSame(422, $res->getStatusCode());
        $data = $this->body($res);
        $this->assertFalse($data['ok']);
        $this->assertIsArray($data['errors'] ?? null, 'errors map must be present on 422');
        $this->assertNotEmpty($data['errors']);
        $firstField = array_key_first($data['errors']);
        $this->assertSame($data['errors'][$firstField], $data['error']);
    }

    public function testValidMinimalCreatePersistsRow(): void
    {
        $res = $this->saveRecipe($this->validRecipePayload());

        $this->assertSame(200, $res->getStatusCode());
        $data = $this->body($res);
        $this->assertTrue($data['ok']);
        $id = (int) $data['id'];
        $this->assertGreaterThan(0, $id);

        $row = $this->recipeRow($id);
        $this->assertNotNull($row, 'recipe row must exist after create');
        $this->assertSame('Receta de prueba', $row['name']);
        $this->assertSame(1, (int) $row['country_id']);
        $this->assertNull($row['difficulty']);
        $this->assertNull($row['time_minutes']);
        $this->assertNull($row['youtube_id']);
    }

    public function testValidFullCreatePersistsNormalizedFieldsAndIngredients(): void
    {
        $res = $this->saveRecipe($this->validRecipePayload([
            'description' => 'Una descripción válida.',
            'difficulty' => 'medium',
            'time_minutes' => '90',
            'youtube_id' => ' MWo42SO1aOM ',
            'ingredients' => ['Cilantro fresco QA', '', 'Comino QA'],
        ]));

        $this->assertSame(200, $res->getStatusCode());
        $data = $this->body($res);
        $this->assertTrue($data['ok']);
        $id = (int) $data['id'];

        $row = $this->recipeRow($id);
        $this->assertNotNull($row);
        $this->assertSame('Una descripción válida.', $row['description']);
        $this->assertSame('medium', $row['difficulty']);
        $this->assertSame(90, (int) $row['time_minutes']);
        $this->assertSame('MWo42SO1aOM', $row['youtube_id'], 'youtube id must be stored trimmed');

        $st = TestDb_pdo()->prepare(
            'SELECT i.name FROM recipe_ingredient ri JOIN ingredients i ON i.id = ri.ingredient_id
             WHERE ri.recipe_id = ? ORDER BY i.name'
        );
        $st->execute([$id]);
        $names = $st->fetchAll(\PDO::FETCH_COLUMN, 0);
        $this->assertSame(['Cilantro fresco QA', 'Comino QA'], $names);
    }

    public function testValidUpdateChangesExistingRow(): void
    {
        $create = $this->body($this->saveRecipe($this->validRecipePayload()));
        $id = (int) $create['id'];

        $res = $this->saveRecipe([
            'id' => (string) $id,
            'name' => 'Receta editada',
            'country_id' => 2,
            'description' => '',
            'difficulty' => 'hard',
            'time_minutes' => '45',
            'youtube_id' => 'vxscY-dy9IU',
        ]);

        $this->assertSame(200, $res->getStatusCode());
        $this->assertTrue($this->body($res)['ok']);

        $row = $this->recipeRow($id);
        $this->assertNotNull($row);
        $this->assertSame('Receta editada', $row['name']);
        $this->assertSame(2, (int) $row['country_id']);
        $this->assertSame('hard', $row['difficulty']);
        $this->assertSame(45, (int) $row['time_minutes']);
        $this->assertSame('vxscY-dy9IU', $row['youtube_id']);
    }

    // ------------------------------------------------------------------
    // TODO 14 - saveCountry guards
    // ------------------------------------------------------------------

    public function testSaveCountryEmojiOver10CharsIsRejectedWith422(): void
    {
        // 11 regional-indicator characters (each counts as 1 mb char).
        $longEmoji = str_repeat("\u{1F1E6}", 11);
        $res = $this->saveCountry('2', ['emoji' => $longEmoji, 'tagline' => 'ok']);

        $this->assertSame(422, $res->getStatusCode());
        $data = $this->body($res);
        $this->assertSame('El emoji no puede superar los 10 caracteres.', $data['errors']['emoji'] ?? null);
    }

    public function testSaveCountryTaglineOver150CharsIsRejectedWith422(): void
    {
        $flagEmoji = "\u{1F1E6}\u{1F1F7}";
        $res = $this->saveCountry('2', ['emoji' => $flagEmoji, 'tagline' => str_repeat('a', 151)]);

        $this->assertSame(422, $res->getStatusCode());
        $data = $this->body($res);
        $this->assertSame(
            'El tagline no puede superar los 150 caracteres.',
            $data['errors']['tagline'] ?? null
        );
    }

    public function testSaveCountryUnknownIdReturns404(): void
    {
        $res = $this->saveCountry((string) self::MISSING_COUNTRY_ID, ['emoji' => 'x', 'tagline' => 'ok']);

        $this->assertSame(404, $res->getStatusCode());
        $data = $this->body($res);
        $this->assertFalse($data['ok']);
        $this->assertSame('País no encontrado.', $data['error'] ?? null);
    }

    public function testSaveCountryUpdatesRowOnSuccess(): void
    {
        $res = $this->saveCountry('2', ['emoji' => "\u{1F1E6}\u{1F1F7}", 'tagline' => 'Tagline editado QA']);

        $this->assertSame(200, $res->getStatusCode());
        $this->assertTrue($this->body($res)['ok']);

        $st = TestDb_pdo()->prepare('SELECT emoji, tagline FROM countries WHERE id = 2');
        $st->execute();
        $row = $st->fetch();
        $this->assertNotFalse($row);
        $this->assertSame("\u{1F1E6}\u{1F1F7}", $row['emoji']);
        $this->assertSame('Tagline editado QA', $row['tagline']);
    }

    // ------------------------------------------------------------------
    // TODO 14 - renameIngredient guards
    // ------------------------------------------------------------------

    public function testRenameIngredientEmptyNameIsRejectedWith422(): void
    {
        $id = $this->insertIngredient('Ing vacio QA');
        $res = $this->renameIngredient((string) $id, ['name' => '   ']);

        $this->assertSame(422, $res->getStatusCode());
        $data = $this->body($res);
        $this->assertSame('El nombre es obligatorio.', $data['errors']['name'] ?? null);
    }

    public function testRenameIngredientTooLongNameIsRejectedWith422(): void
    {
        $id = $this->insertIngredient('Ing largo QA');
        $res = $this->renameIngredient((string) $id, ['name' => str_repeat('b', 201)]);

        $this->assertSame(422, $res->getStatusCode());
        $data = $this->body($res);
        $this->assertSame('El nombre no puede superar los 200 caracteres.', $data['errors']['name'] ?? null);
    }

    public function testRenameIngredientDuplicateReturns409(): void
    {
        $idA = $this->insertIngredient('Ing duplicado A QA');
        $idB = $this->insertIngredient('Ing duplicado B QA');

        $res = $this->renameIngredient((string) $idB, ['name' => 'Ing duplicado A QA']);

        $this->assertSame(409, $res->getStatusCode());
        $data = $this->body($res);
        $this->assertFalse($data['ok']);
        $this->assertSame('Ese nombre ya existe.', $data['error'] ?? null);
        $this->assertSame($idA, $this->ingredientIdByName('Ing duplicado A QA'));
    }

    public function testRenameIngredientUnknownIdReturns404(): void
    {
        $res = $this->renameIngredient((string) self::MISSING_INGREDIENT_ID, ['name' => 'Nunca existio QA']);

        $this->assertSame(404, $res->getStatusCode());
        $data = $this->body($res);
        $this->assertSame('Ingrediente no encontrado.', $data['error'] ?? null);
    }

    public function testRenameIngredientSuccessPersistsNewName(): void
    {
        $id = $this->insertIngredient('Nombre viejo QA');
        $res = $this->renameIngredient((string) $id, ['name' => 'Nombre nuevo QA']);

        $this->assertSame(200, $res->getStatusCode());
        $this->assertTrue($this->body($res)['ok']);
        $this->assertFalse($this->ingredientExists('Nombre viejo QA'));
        $this->assertTrue($this->ingredientExists('Nombre nuevo QA'));
    }

    // ------------------------------------------------------------------
    // TODO 14 - delete guards
    // ------------------------------------------------------------------

    public function testDeleteIngredientMissingReturns404(): void
    {
        $res = $this->deleteIngredient((string) self::MISSING_INGREDIENT_ID);

        $this->assertSame(404, $res->getStatusCode());
        $data = $this->body($res);
        $this->assertSame('Ingrediente no encontrado.', $data['error'] ?? null);
    }

    public function testDeleteIngredientRemovesRow(): void
    {
        $id = $this->insertIngredient('Ing a borrar QA');
        $res = $this->deleteIngredient((string) $id);

        $this->assertSame(200, $res->getStatusCode());
        $this->assertTrue($this->body($res)['ok']);

        $st = TestDb_pdo()->prepare('SELECT 1 FROM ingredients WHERE id = ?');
        $st->execute([$id]);
        $this->assertFalse($st->fetchColumn(), 'ingredient row must be gone');
    }

    public function testDeleteRecipeMissingReturns404(): void
    {
        $res = $this->deleteRecipe((string) self::MISSING_RECIPE_ID);

        $this->assertSame(404, $res->getStatusCode());
        $data = $this->body($res);
        $this->assertSame('Receta no encontrada.', $data['error'] ?? null);
    }

    public function testDeleteRecipeRemovesRow(): void
    {
        $create = $this->body($this->saveRecipe($this->validRecipePayload()));
        $id = (int) $create['id'];

        $res = $this->deleteRecipe((string) $id);

        $this->assertSame(200, $res->getStatusCode());
        $this->assertTrue($this->body($res)['ok']);
        $this->assertNull($this->recipeRow($id), 'recipe row must be gone');
    }

    private function ingredientExists(string $name): bool
    {
        $st = TestDb_pdo()->prepare('SELECT 1 FROM ingredients WHERE name = ?');
        $st->execute([$name]);
        return $st->fetchColumn() !== false;
    }

    private function ingredientIdByName(string $name): int
    {
        $st = TestDb_pdo()->prepare('SELECT id FROM ingredients WHERE name = ?');
        $st->execute([$name]);
        return (int) $st->fetchColumn();
    }
}
