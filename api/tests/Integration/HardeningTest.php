<?php
declare(strict_types=1);

namespace Tests\Integration;

use App\Controllers\FavoriteController;
use App\Controllers\HealthController;
use App\Controllers\IngredientController;
use App\Controllers\RecipeController;
use App\Controllers\SearchController;
use App\Middleware\AuthMiddleware;
use App\Middleware\CorsMiddleware;
use App\Support\Database;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\Psr7\Factory\RequestFactory;
use Slim\Psr7\Factory\ResponseFactory;

use function TestDb_pdo;
use function TestDb_reloadSchema;

use const TEST_DB;

/**
 * Hardening coverage: numeric route constraints, 400-on-garbage id/page
 * validation, backward-compatible byCountry pagination, CORS Vary/Max-Age,
 * Auth 401 WWW-Authenticate and UTC health timestamps.
 *
 * Controllers are invoked directly with Slim PSR-7 objects against the real
 * scratch MySQL schema, reloaded before EVERY test so no state leaks.
 */
final class HardeningTest extends TestCase
{
    private const USERNAME = 'qa_hardening_user';
    private const PASSWORD = 'S3gura!Pass2026';

    private RecipeController $recipes;
    private IngredientController $ingredients;
    private FavoriteController $favorites;
    private SearchController $search;
    private HealthController $health;

    private int $userId = 0;

    /** Previous $_ENV values, restored in tearDown(). */
    /** @var array<string, string|null> */
    private array $savedEnv = [];

    protected function setUp(): void
    {
        TestDb_reloadSchema();

        $this->savedEnv['DB_NAME'] = isset($_ENV['DB_NAME']) ? (string) $_ENV['DB_NAME'] : null;
        $_ENV['DB_NAME'] = TEST_DB;
        self::resetDatabaseSingleton();

        $pdo = TestDb_pdo();
        $st = $pdo->prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)');
        $st->execute([self::USERNAME, password_hash(self::PASSWORD, PASSWORD_DEFAULT), 'user']);
        $this->userId = (int) $pdo->lastInsertId();

        $this->recipes = new RecipeController();
        $this->ingredients = new IngredientController();
        $this->favorites = new FavoriteController();
        $this->search = new SearchController();
        $this->health = new HealthController();
    }

    protected function tearDown(): void
    {
        foreach (['DB_NAME', 'CORS_ORIGIN'] as $key) {
            if (!array_key_exists($key, $this->savedEnv)) {
                continue;
            }
            $value = $this->savedEnv[$key];
            if ($value === null) {
                unset($_ENV[$key]);
            } else {
                $_ENV[$key] = $value;
            }
        }
        // CORS_ORIGIN may have been created fresh by a test without a saved slot.
        if (!array_key_exists('CORS_ORIGIN', $this->savedEnv)) {
            unset($_ENV['CORS_ORIGIN']);
        }
        self::resetDatabaseSingleton();
    }

    private static function resetDatabaseSingleton(): void
    {
        $prop = new \ReflectionProperty(Database::class, 'pdo');
        $prop->setAccessible(true);
        $prop->setValue(null, null);
    }

    private function getRequest(string $path): ServerRequestInterface
    {
        $request = (new RequestFactory())->createRequest('GET', 'http://localhost' . $path);
        \assert($request instanceof ServerRequestInterface);
        return $request;
    }

    /** @param array<string, string> $query */
    private function pagedRequest(string $path, array $query): ServerRequestInterface
    {
        return $this->getRequest($path)->withQueryParams($query);
    }

    /**
     * @param array<string, mixed>|null $parsedBody
     */
    private function favRequest(string $method, ?array $parsedBody = null): ServerRequestInterface
    {
        $request = (new RequestFactory())->createRequest($method, 'http://localhost/favorites');
        \assert($request instanceof ServerRequestInterface);
        $request = $request->withAttribute('auth_user', [
            'user_id' => $this->userId,
            'username' => self::USERNAME,
            'role' => 'user',
        ]);
        if ($parsedBody !== null) {
            $request = $request->withParsedBody($parsedBody);
        }
        return $request;
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

    // ------------------------------------------------------------------
    // 400 on non-numeric ids
    // ------------------------------------------------------------------

    /** @return list<array{0: string}> */
    public static function badIds(): array
    {
        return [['abc'], ['12abc'], ['0'], ['-3'], ['1.5'], ['']];
    }

    /**
     * @dataProvider badIds
     */
    public function testByCountryNonNumericIdReturns400(string $badId): void
    {
        $res = $this->recipes->byCountry(
            $this->getRequest('/countries/' . $badId . '/recipes'),
            (new ResponseFactory())->createResponse(),
            ['id' => $badId]
        );

        $this->assertSame(400, $res->getStatusCode(), "id={$badId} must be rejected");
        $data = $this->body($res);
        $this->assertFalse($data['ok'] ?? true);
        $this->assertArrayHasKey('error', $data);
    }

    /**
     * @dataProvider badIds
     */
    public function testIngredientNonNumericIdReturns400(string $badId): void
    {
        $res = $this->ingredients->show(
            $this->getRequest('/ingredients/' . $badId),
            (new ResponseFactory())->createResponse(),
            ['id' => $badId]
        );

        $this->assertSame(400, $res->getStatusCode(), "id={$badId} must be rejected");
        $data = $this->body($res);
        $this->assertFalse($data['ok'] ?? true);
        $this->assertArrayHasKey('error', $data);
    }

    public function testByCountryWellFormedMissingIdStill404(): void
    {
        $res = $this->recipes->byCountry(
            $this->getRequest('/countries/9999/recipes'),
            (new ResponseFactory())->createResponse(),
            ['id' => '9999']
        );

        $this->assertSame(404, $res->getStatusCode());
        $this->assertSame('País no encontrado.', $this->body($res)['error'] ?? null);
    }

    public function testFavoriteToggleBadRecipeIdReturns400(): void
    {
        foreach (['abc', '0', '-2', '7.5', ''] as $bad) {
            $res = $this->favorites->toggle(
                $this->favRequest('POST', ['recipe_id' => $bad, 'add' => 1]),
                (new ResponseFactory())->createResponse()
            );

            $this->assertSame(400, $res->getStatusCode(), 'recipe_id=' . var_export($bad, true) . ' must be rejected');
            $this->assertFalse($this->body($res)['ok'] ?? true);
        }

        $missing = $this->favorites->toggle(
            $this->favRequest('POST', []),
            (new ResponseFactory())->createResponse()
        );
        $this->assertSame(400, $missing->getStatusCode(), 'missing recipe_id must be rejected');
    }

    public function testFavoriteToggleWellFormedMissingStill404(): void
    {
        $res = $this->favorites->toggle(
            $this->favRequest('POST', ['recipe_id' => 424242, 'add' => 1]),
            (new ResponseFactory())->createResponse()
        );

        $this->assertSame(404, $res->getStatusCode());
        $this->assertSame('Receta inexistente.', $this->body($res)['error'] ?? null);
    }

    // ------------------------------------------------------------------
    // 400 on bad page/per_page
    // ------------------------------------------------------------------

    public function testByCountryBadPaginationParamsReturn400(): void
    {
        $cases = [
            ['page' => 'abc'],
            ['page' => '0'],
            ['page' => '-1'],
            ['page' => '2.5'],
            ['per_page' => 'abc'],
            ['per_page' => '0'],
            ['per_page' => '-2'],
            ['per_page' => '101'],
            ['per_page' => '1.5'],
            ['page' => '1', 'per_page' => '1000'],
        ];

        foreach ($cases as $query) {
            $res = $this->recipes->byCountry(
                $this->pagedRequest('/countries/4/recipes', $query),
                (new ResponseFactory())->createResponse(),
                ['id' => '4']
            );

            $this->assertSame(400, $res->getStatusCode(), 'query=' . json_encode($query) . ' must be rejected');
            $this->assertFalse($this->body($res)['ok'] ?? true);
        }
    }

    // ------------------------------------------------------------------
    // Pagination meta correctness (backward compatible defaults)
    // ------------------------------------------------------------------

    public function testByCountryWithoutParamsReturnsAllWithPaginationMeta(): void
    {
        $res = $this->recipes->byCountry(
            $this->getRequest('/countries/4/recipes'),
            (new ResponseFactory())->createResponse(),
            ['id' => '4']
        );

        $this->assertSame(200, $res->getStatusCode());
        $data = $this->body($res);
        $this->assertTrue($data['ok'] ?? false);

        // Seed: Perú (id 4) holds exactly recipes 10..12.
        $this->assertCount(3, $data['recipes']);
        $ids = array_map(static fn (array $row): int => (int) $row['id'], $data['recipes']);
        $this->assertSame([10, 11, 12], $ids, 'ORDER BY id stays in the no-params case');

        $pagination = $data['pagination'] ?? null;
        $this->assertIsArray($pagination);
        $this->assertSame(1, $pagination['page']);
        $this->assertSame(3, $pagination['per_page'], 'no-params per_page must equal total');
        $this->assertSame(3, $pagination['total']);
        $this->assertSame(1, $pagination['total_pages']);
    }

    public function testByCountryPageTwoDiffersFromPageOne(): void
    {
        $page1 = $this->body($this->recipes->byCountry(
            $this->pagedRequest('/countries/4/recipes', ['page' => '1', 'per_page' => '2']),
            (new ResponseFactory())->createResponse(),
            ['id' => '4']
        ));
        $page2 = $this->body($this->recipes->byCountry(
            $this->pagedRequest('/countries/4/recipes', ['page' => '2', 'per_page' => '2']),
            (new ResponseFactory())->createResponse(),
            ['id' => '4']
        ));

        $this->assertTrue($page1['ok'] ?? false);
        $this->assertTrue($page2['ok'] ?? false);

        $ids1 = array_map(static fn (array $row): int => (int) $row['id'], $page1['recipes']);
        $ids2 = array_map(static fn (array $row): int => (int) $row['id'], $page2['recipes']);
        $this->assertSame([10, 11], $ids1);
        $this->assertSame([12], $ids2, 'page 2 must hold the remaining recipe only');
        $this->assertSame([], array_intersect($ids1, $ids2), 'pages must not overlap');

        foreach (['page1' => $page1, 'page2' => $page2] as $label => $data) {
            $pagination = $data['pagination'] ?? null;
            $this->assertIsArray($pagination, $label);
            $this->assertSame(3, $pagination['total'], $label);
            $this->assertSame(2, $pagination['per_page'], $label);
            $this->assertSame(2, $pagination['total_pages'], $label);
        }
        $this->assertSame(1, $page1['pagination']['page']);
        $this->assertSame(2, $page2['pagination']['page']);

        // The page-2 recipe must carry its own ingredients from the DB.
        $st = TestDb_pdo()->prepare(
            'SELECT i.id FROM recipe_ingredient ri JOIN ingredients i ON i.id = ri.ingredient_id
             WHERE ri.recipe_id = ? ORDER BY i.name'
        );
        $st->execute([12]);
        /** @var list<string> $expected */
        $expected = $st->fetchAll(\PDO::FETCH_COLUMN, 0);
        $actual = array_map(
            static fn (array $row): int => (int) $row['id'],
            $page2['recipes'][0]['ingredients']
        );
        $this->assertSame(array_map('intval', $expected), $actual, 'page join must cover only the page recipes');
    }

    // ------------------------------------------------------------------
    // Route numeric constraints (admin group untouched)
    // ------------------------------------------------------------------

    public function testRoutesConstrainPublicIdsButNotAdminGroup(): void
    {
        $routesFile = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'routes.php';
        $this->assertFileExists($routesFile);
        $src = (string) file_get_contents($routesFile);

        $this->assertStringContainsString('/countries/{id:[0-9]+}/recipes', $src);
        $this->assertStringContainsString('/ingredients/{id:[0-9]+}', $src);

        $adminPos = strpos($src, "group('/admin'");
        $this->assertNotFalse($adminPos, 'admin group must still exist');
        $adminBlock = substr($src, $adminPos);
        // Session routes (added by orchestrator integration) live here with constraints.
        $this->assertStringContainsString("get('/sessions'", $adminBlock);
        $this->assertStringContainsString("/sessions/{id:[0-9]+}", $adminBlock);
    }

    // ------------------------------------------------------------------
    // CORS / Auth / Health headers
    // ------------------------------------------------------------------

    public function testCorsEmitsVaryAndMaxAgeWhenOriginConfigured(): void
    {
        $this->savedEnv['CORS_ORIGIN'] = isset($_ENV['CORS_ORIGIN']) ? (string) $_ENV['CORS_ORIGIN'] : null;
        $_ENV['CORS_ORIGIN'] = 'https://example.com';

        $request = $this->getRequest('/health');
        $handler = new class () implements RequestHandlerInterface {
            public function handle(ServerRequestInterface $request): ResponseInterface
            {
                return (new ResponseFactory())->createResponse();
            }
        };

        $res = (new CorsMiddleware())($request, $handler);

        $this->assertSame('https://example.com', $res->getHeaderLine('Access-Control-Allow-Origin'));
        $this->assertSame('Origin', $res->getHeaderLine('Vary'));
        $this->assertSame('600', $res->getHeaderLine('Access-Control-Max-Age'));
    }

    public function testCorsStaysSilentWhenOriginEmpty(): void
    {
        $this->savedEnv['CORS_ORIGIN'] = isset($_ENV['CORS_ORIGIN']) ? (string) $_ENV['CORS_ORIGIN'] : null;
        unset($_ENV['CORS_ORIGIN']);

        $request = $this->getRequest('/health');
        $handler = new class () implements RequestHandlerInterface {
            public function handle(ServerRequestInterface $request): ResponseInterface
            {
                return (new ResponseFactory())->createResponse();
            }
        };

        $res = (new CorsMiddleware())($request, $handler);

        $this->assertSame('', $res->getHeaderLine('Access-Control-Allow-Origin'));
        $this->assertSame('', $res->getHeaderLine('Vary'));
    }

    public function testAuthMiddleware401CarriesWwwAuthenticate(): void
    {
        $request = $this->getRequest('/countries');
        $handler = new class () implements RequestHandlerInterface {
            public function handle(ServerRequestInterface $request): ResponseInterface
            {
                return (new ResponseFactory())->createResponse();
            }
        };

        $res = (new AuthMiddleware())($request, $handler);

        $this->assertSame(401, $res->getStatusCode());
        $this->assertSame('Bearer', $res->getHeaderLine('WWW-Authenticate'));
        $this->assertFalse($this->body($res)['ok'] ?? true);
    }

    public function testHealthTimeIsExplicitUtc(): void
    {
        $res = $this->health->index(
            $this->getRequest('/health'),
            (new ResponseFactory())->createResponse(),
            TestDb_pdo()
        );

        $this->assertSame(200, $res->getStatusCode());
        $data = $this->body($res);
        $this->assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T/', (string) ($data['time'] ?? ''));
        $this->assertStringEndsWith('+00:00', (string) ($data['time'] ?? ''), 'health time must carry an explicit UTC offset');
    }

    // ------------------------------------------------------------------
    // Search: deterministic order on limited result sets
    // ------------------------------------------------------------------

    public function testSearchLimitedResultsAreDeterministicallyOrdered(): void
    {
        $request = $this->getRequest('/search')->withQueryParams(['q' => 'a']);
        $data = $this->body($this->search->index($request, (new ResponseFactory())->createResponse()));

        $this->assertTrue($data['ok'] ?? false);
        foreach (['countries', 'recipes', 'ingredients'] as $key) {
            $this->assertArrayHasKey($key, $data);
            $this->assertIsArray($data[$key]);
        }

        $recipeIds = array_map(static fn (array $row): int => (int) $row['id'], $data['recipes']);
        $sorted = $recipeIds;
        sort($sorted);
        $this->assertSame($sorted, $recipeIds, 'limited recipe results must be id-ordered');
        $this->assertLessThanOrEqual(6, count($recipeIds));
        $this->assertLessThanOrEqual(4, count($data['countries']));
        $this->assertLessThanOrEqual(4, count($data['ingredients']));
    }
}
