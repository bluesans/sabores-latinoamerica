<?php
declare(strict_types=1);

namespace Tests\Integration;

use App\Controllers\FavoriteController;
use App\Controllers\HealthController;
use App\Controllers\IngredientController;
use App\Controllers\RecipeController;
use App\Support\Database;
use App\Support\Env;
use PDO;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use RuntimeException;
use Slim\Psr7\Factory\RequestFactory;
use Slim\Psr7\Factory\ResponseFactory;

use function TestDb_credentials;
use function TestDb_pdo;
use function TestDb_reloadSchema;

use const TEST_DB;

/**
 * Integration gap-fill for the remaining controller surface (todo 33):
 * FavoriteController toggle/index, RecipeController::byCountry,
 * IngredientController::show, HealthController DB-injection contract and the
 * bin/create-admin.php CLI lifecycle.
 *
 * Controllers are invoked directly with Slim PSR-7 objects against the real
 * scratch MySQL schema (sabores_latinoamerica_test), reloaded before EVERY
 * test so no favorites/users state can leak between cases.
 *
 * Auth note: FavoriteController reads the `auth_user` request attribute that
 * AuthMiddleware populates in production; tests seed that attribute directly
 * (same contract, no HTTP layer involved).
 *
 * CLI note: create-admin.php is spawned with proc_open and an explicit
 * environment. DB_NAME=sabores_latinoamerica_test wins over api/.env because
 * Dotenv::createImmutable never overrides variables that already exist in the
 * process environment ($_SERVER carries env vars in CLI SAPIs).
 */
final class RemainingFlowTest extends TestCase
{
    private const USERNAME = 'qa_flow_user';
    private const PASSWORD = 'S3gura!Pass2026';
    private const CLI_PASS_A = 'Qa!Cli-2026-Pass';
    private const CLI_PASS_B = 'Qa!Cli-2026-Rotated';

    private FavoriteController $favorites;
    private RecipeController $recipes;
    private IngredientController $ingredients;
    private HealthController $health;

    private int $userId = 0;

    /** Previous $_ENV['DB_NAME'] value, restored in tearDown(). */
    private ?string $savedDbName = null;

    protected function setUp(): void
    {
        // Fresh pristine schema per test: users/favorites start from seed only.
        TestDb_reloadSchema();

        // Favorite/Recipe/Ingredient controllers have no PDO injection param
        // (unlike Auth/Stats) and go through the Database::connection()
        // singleton, which would bind to the LIVE schema from api/.env. Point
        // the singleton at the scratch schema for the duration of each test.
        $this->savedDbName = isset($_ENV['DB_NAME']) ? (string) $_ENV['DB_NAME'] : null;
        $_ENV['DB_NAME'] = TEST_DB;
        self::resetDatabaseSingleton();

        // Same handle for insert + lastInsertId(): TestDb_pdo() opens a fresh
        // connection per call, and lastInsertId() is per-connection state.
        $pdo = TestDb_pdo();
        $st = $pdo->prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)');
        $st->execute([self::USERNAME, password_hash(self::PASSWORD, PASSWORD_DEFAULT), 'user']);
        $this->userId = (int) $pdo->lastInsertId();

        $this->favorites    = new FavoriteController();
        $this->recipes      = new RecipeController();
        $this->ingredients  = new IngredientController();
        $this->health       = new HealthController();
    }

    protected function tearDown(): void
    {
        // Belt-and-braces cleanup for CLI-created accounts (schema reload in
        // setUp already isolates, but never leave qa_cli_* rows behind).
        $this->deleteCliUsers();

        // Restore the environment + singleton exactly as we found them.
        if ($this->savedDbName === null) {
            unset($_ENV['DB_NAME']);
        } else {
            $_ENV['DB_NAME'] = $this->savedDbName;
        }
        self::resetDatabaseSingleton();
    }

    /** Clears Database's cached PDO so the next connection() re-resolves env. */
    private static function resetDatabaseSingleton(): void
    {
        $prop = new \ReflectionProperty(Database::class, 'pdo');
        $prop->setAccessible(true);
        $prop->setValue(null, null);
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

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

    private function getRequest(string $path): ServerRequestInterface
    {
        $request = (new RequestFactory())->createRequest('GET', 'http://localhost' . $path);
        \assert($request instanceof ServerRequestInterface);
        return $request;
    }

    /** @return array<string, string> */
    private function routeArgs(string $id): array
    {
        return ['id' => $id];
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

    /** @return list<array<string, mixed>> */
    private function favoriteRows(int $userId): array
    {
        $st = TestDb_pdo()->prepare(
            'SELECT recipe_id FROM favorites WHERE user_id = ? ORDER BY recipe_id'
        );
        $st->execute([$userId]);
        /** @var list<array<string, mixed>> $rows */
        $rows = $st->fetchAll(PDO::FETCH_ASSOC);
        return $rows;
    }

    /** @return array{id: int, role: string, password: string}|null */
    private function userRowByName(string $username): ?array
    {
        $st = TestDb_pdo()->prepare('SELECT id, role, password FROM users WHERE username = ?');
        $st->execute([$username]);
        $row = $st->fetch(PDO::FETCH_ASSOC);
        if ($row === false) {
            return null;
        }
        return [
            'id' => (int) $row['id'],
            'role' => (string) $row['role'],
            'password' => (string) $row['password'],
        ];
    }

    /**
     * SELECT + DELETE of every account created by the CLI cases in this class.
     * Pasted explicitly so a broken tearDown can never silently orphan rows.
     */
    private function deleteCliUsers(): void
    {
        $pdo = TestDb_pdo();
        $select = $pdo->query("SELECT id FROM users WHERE username LIKE 'qa\\_cli\\_%'");
        \assert($select !== false);
        /** @var list<mixed> $ids */
        $ids = $select->fetchAll(PDO::FETCH_COLUMN, 0);
        foreach ($ids as $id) {
            $del = $pdo->prepare('DELETE FROM users WHERE id = ?');
            $del->execute([(int) $id]);
        }
    }

    /**
     * Spawns bin/create-admin.php with an explicit environment pointing at the
     * scratch schema; captures stdout/stderr and the exit code.
     *
     * @param list<string> $args
     * @return array{exit: int, out: string, err: string}
     */
    private function runCreateAdmin(array $args, string $username, string $password): array
    {
        $script = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'bin' . DIRECTORY_SEPARATOR . 'create-admin.php';
        $this->assertFileExists($script);

        [$dbUser, $dbPass] = TestDb_credentials();

        // Windows child processes need the OS essentials when the environment
        // is replaced wholesale by proc_open; everything else is our override.
        $systemRoot = getenv('SystemRoot');
        $env = [
            'SystemRoot' => $systemRoot === false ? 'C:\\Windows' : $systemRoot,
            'windir' => $systemRoot === false ? 'C:\\Windows' : $systemRoot,
            'SystemDrive' => 'C:',
            'PATH' => (string) (getenv('PATH') ?: ''),
            'TEMP' => (string) (getenv('TEMP') ?: 'C:\\Windows\\Temp'),
            'TMP' => (string) (getenv('TMP') ?: 'C:\\Windows\\Temp'),
            // Scratch schema + case-specific admin credentials. These win over
            // api/.env because dotenv is immutable w.r.t. existing process env.
            'DB_HOST' => Env::get('DB_HOST', '127.0.0.1') ?? '127.0.0.1',
            'DB_NAME' => TEST_DB,
            'DB_USER' => $dbUser ?? 'root',
            'DB_PASS' => $dbPass ?? '',
            'ADMIN_USER' => $username,
            'ADMIN_PASS' => $password,
        ];

        $cmd = array_merge([PHP_BINARY, $script], $args);
        $proc = proc_open(
            $cmd,
            [['pipe', 'r'], ['pipe', 'w'], ['pipe', 'w']],
            $pipes,
            null,
            $env,
            ['bypass_shell' => true]
        );
        if (!is_resource($proc)) {
            throw new RuntimeException('proc_open could not start create-admin.php.');
        }
        fclose($pipes[0]);

        stream_set_blocking($pipes[1], false);
        stream_set_blocking($pipes[2], false);
        $out = '';
        $err = '';
        $deadline = microtime(true) + 30.0;
        while (microtime(true) < $deadline && is_resource($proc)) {
            $out .= (string) fread($pipes[1], 8192);
            $err .= (string) fread($pipes[2], 8192);
            $status = proc_get_status($proc);
            if (!$status['running'] && feof($pipes[1]) && feof($pipes[2])) {
                break;
            }
            usleep(10_000);
        }
        fclose($pipes[1]);
        fclose($pipes[2]);

        $exit = proc_close($proc);

        return ['exit' => $exit, 'out' => $out, 'err' => $err];
    }

    /** @return array{exit: int, out: string, err: string} */
    private function runCreateAdminFor(string $username, string $password, bool $force = false): array
    {
        return $this->runCreateAdmin($force ? ['--force'] : [], $username, $password);
    }

    // ------------------------------------------------------------------
    // FavoriteController: toggle / index / unknown recipe
    // ------------------------------------------------------------------

    public function testFavoriteToggleAddThenIndexShowsJoinedRow(): void
    {
        $res = $this->favorites->toggle(
            $this->favRequest('POST', ['recipe_id' => 1, 'add' => 1]),
            (new ResponseFactory())->createResponse()
        );

        $this->assertSame(200, $res->getStatusCode());
        $this->assertTrue($this->body($res)['ok'] ?? false);
        $this->assertSame([['recipe_id' => 1]], $this->favoriteRows($this->userId));

        $index = $this->favorites->index(
            $this->favRequest('GET'),
            (new ResponseFactory())->createResponse()
        );

        $this->assertSame(200, $index->getStatusCode());
        $data = $this->body($index);
        $this->assertTrue($data['ok'] ?? false);
        $this->assertIsArray($data['favorites'] ?? null);
        $this->assertCount(1, $data['favorites']);

        $fav = $data['favorites'][0];
        $this->assertSame(1, (int) $fav['id'], 'favorite must be recipe 1');
        $this->assertSame('Tacos al Pastor', $fav['name'] ?? null);
        $this->assertSame('medium', $fav['difficulty'] ?? null);
        $this->assertSame(120, (int) $fav['time_minutes']);
        // Country join fields must come along (c.id/name/emoji in the SELECT).
        $this->assertSame(1, (int) $fav['country_id']);
        $this->assertSame('México', $fav['country_name'] ?? null);
        $this->assertNotEmpty($fav['emoji'] ?? '');
    }

    public function testFavoriteToggleOffRemovesRowAndIndexEmpties(): void
    {
        $add = $this->favorites->toggle(
            $this->favRequest('POST', ['recipe_id' => 1, 'add' => 1]),
            (new ResponseFactory())->createResponse()
        );
        $this->assertSame(200, $add->getStatusCode(), 'precondition: add succeeds');

        $off = $this->favorites->toggle(
            $this->favRequest('POST', ['recipe_id' => 1]),
            (new ResponseFactory())->createResponse()
        );

        $this->assertSame(200, $off->getStatusCode());
        $this->assertTrue($this->body($off)['ok'] ?? false);
        $this->assertSame([], $this->favoriteRows($this->userId), 'toggle-off must delete the row');

        $index = $this->favorites->index(
            $this->favRequest('GET'),
            (new ResponseFactory())->createResponse()
        );
        $data = $this->body($index);
        $this->assertSame([], $data['favorites'] ?? null, 'index must report no favorites');
    }

    public function testFavoriteToggleUnknownRecipeReturns404(): void
    {
        $res = $this->favorites->toggle(
            $this->favRequest('POST', ['recipe_id' => 424242, 'add' => 1]),
            (new ResponseFactory())->createResponse()
        );

        $this->assertSame(404, $res->getStatusCode());
        $data = $this->body($res);
        $this->assertFalse($data['ok'] ?? true);
        $this->assertSame('Receta inexistente.', $data['error'] ?? null);
        $this->assertSame([], $this->favoriteRows($this->userId), 'no row may be written for unknown recipes');
    }

    // ------------------------------------------------------------------
    // RecipeController::byCountry
    // ------------------------------------------------------------------

    public function testByCountryReturnsCountryBlockAndRecipesWithIngredients(): void
    {
        $res = $this->recipes->byCountry(
            $this->getRequest('/countries/4/recipes'),
            (new ResponseFactory())->createResponse(),
            $this->routeArgs('4')
        );

        $this->assertSame(200, $res->getStatusCode());
        $data = $this->body($res);
        $this->assertTrue($data['ok'] ?? false);

        $country = $data['country'] ?? null;
        $this->assertIsArray($country);
        $this->assertSame(4, (int) $country['id']);
        $this->assertSame('Perú', $country['name'] ?? null);
        $this->assertNotEmpty($country['emoji'] ?? '');

        $recipes = $data['recipes'] ?? null;
        $this->assertIsArray($recipes);
        $this->assertCount(3, $recipes, 'seed data has exactly 3 Peruvian recipes');

        $ids = [];
        foreach ($recipes as $recipe) {
            $this->assertIsArray($recipe);
            foreach (['id', 'name', 'description', 'difficulty', 'time_minutes', 'youtube_id', 'ingredients'] as $key) {
                $this->assertArrayHasKey($key, $recipe, "recipe row must carry '{$key}'");
            }
            $this->assertIsArray($recipe['ingredients'], 'each recipe needs its ingredients array');
            $this->assertNotEmpty($recipe['ingredients'], 'seeded recipes all have ingredients');
            foreach ($recipe['ingredients'] as $ingredient) {
                $this->assertIsArray($ingredient);
                $this->assertGreaterThan(0, (int) $ingredient['id']);
                $this->assertNotSame('', $ingredient['name'] ?? '');
            }
            $ids[] = (int) $recipe['id'];
        }
        $this->assertSame([10, 11, 12], $ids, 'ORDER BY id over seed recipes 10..12');

        // Concrete join spot-check: Ceviche Peruano lists Corvina o lenguado (56).
        $ceviche = $recipes[0];
        $ingredientIds = array_map(
            static fn (array $row): int => (int) $row['id'],
            $ceviche['ingredients']
        );
        $this->assertContains(56, $ingredientIds);
    }

    public function testByCountryUnknownCountryReturns404(): void
    {
        $res = $this->recipes->byCountry(
            $this->getRequest('/countries/9999/recipes'),
            (new ResponseFactory())->createResponse(),
            $this->routeArgs('9999')
        );

        $this->assertSame(404, $res->getStatusCode());
        $data = $this->body($res);
        $this->assertFalse($data['ok'] ?? true);
        $this->assertSame('País no encontrado.', $data['error'] ?? null);
    }

    // ------------------------------------------------------------------
    // IngredientController::show
    // ------------------------------------------------------------------

    public function testIngredientShowReturnsIngredientAndJoinedRecipes(): void
    {
        $res = $this->ingredients->show(
            $this->getRequest('/ingredients/1'),
            (new ResponseFactory())->createResponse(),
            $this->routeArgs('1')
        );

        $this->assertSame(200, $res->getStatusCode());
        $data = $this->body($res);
        $this->assertTrue($data['ok'] ?? false);

        $ingredient = $data['ingredient'] ?? null;
        $this->assertIsArray($ingredient);
        $this->assertSame(1, (int) $ingredient['id']);
        $this->assertSame('Cerdo', $ingredient['name'] ?? null);

        $recipes = $data['recipes'] ?? null;
        $this->assertIsArray($recipes);
        $this->assertCount(4, $recipes, 'Cerdo joins recipes 1, 26, 44, 51 in seed data');

        $ids = [];
        foreach ($recipes as $row) {
            $this->assertIsArray($row);
            foreach (['recipe_id', 'recipe_name', 'difficulty', 'country_id', 'country_name', 'emoji'] as $key) {
                $this->assertArrayHasKey($key, $row, "joined row must carry '{$key}'");
            }
            $this->assertGreaterThan(0, (int) $row['country_id']);
            $this->assertNotSame('', $row['country_name'] ?? '');
            $ids[] = (int) $row['recipe_id'];
        }
        sort($ids);
        $this->assertSame([1, 26, 44, 51], $ids);
    }

    public function testIngredientShowUnknownIngredientReturns404(): void
    {
        $res = $this->ingredients->show(
            $this->getRequest('/ingredients/99999'),
            (new ResponseFactory())->createResponse(),
            $this->routeArgs('99999')
        );

        $this->assertSame(404, $res->getStatusCode());
        $data = $this->body($res);
        $this->assertFalse($data['ok'] ?? true);
        $this->assertSame('Ingrediente no encontrado.', $data['error'] ?? null);
    }

    // ------------------------------------------------------------------
    // HealthController: optional-PDO injection contract
    // ------------------------------------------------------------------

    public function testHealthControllerAcceptsOptionalPdoInjection(): void
    {
        // Signature contract (same pattern StatsController got): third
        // parameter must exist, accept PDO instances and default to null so
        // Slim's route-args array keeps flowing through untouched.
        $params = (new \ReflectionMethod(HealthController::class, 'index'))->getParameters();
        $this->assertGreaterThanOrEqual(3, count($params), 'index() needs a third parameter for PDO injection');
        $third = $params[2];
        $this->assertTrue($third->allowsNull(), 'injection parameter must be nullable');
        $this->assertStringContainsString('PDO', (string) $third->getType(), 'injection parameter must accept PDO');
        $this->assertTrue($third->isDefaultValueAvailable(), 'injection parameter must be optional');
    }

    public function testHealthOkWithInjectedTestDbPdo(): void
    {
        $res = $this->health->index(
            $this->getRequest('/health'),
            (new ResponseFactory())->createResponse(),
            TestDb_pdo()
        );

        $this->assertSame(200, $res->getStatusCode());
        $data = $this->body($res);
        $this->assertTrue($data['ok'] ?? false);
        $this->assertTrue($data['api'] ?? false);
        $this->assertTrue($data['db'] ?? false);
        $this->assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T/', (string) ($data['time'] ?? ''), 'time must be ISO-8601');
    }

    public function testHealthDbDownViaInjectedDeadPdoReturns503Shape(): void
    {
        // Uninitialized PDO subclass: query() is overridden to always throw,
        // simulating an unreachable database without needing a real socket.
        $dead = new class () extends PDO {
            public function __construct()
            {
                // Intentionally no parent::__construct(): no connection at all.
                // Constructors are exempt from LSP, so the empty signature is
                // valid even though PDO::__construct() requires a DSN.
            }

            public function query(string $query, ?int $fetchMode = null, mixed ...$fetchModeArgs): \PDOStatement|false
            {
                throw new RuntimeException('simulated db outage');
            }
        };

        $res = $this->health->index(
            $this->getRequest('/health'),
            (new ResponseFactory())->createResponse(),
            $dead
        );

        $this->assertSame(503, $res->getStatusCode(), 'db-down must degrade to 503');
        $data = $this->body($res);
        $this->assertFalse($data['ok'] ?? true);
        $this->assertFalse($data['db'] ?? true);
        $this->assertTrue($data['api'] ?? false, 'api liveness stays true even when db is down');
    }

    // ------------------------------------------------------------------
    // bin/create-admin.php lifecycle
    // ------------------------------------------------------------------

    public function testCliCreatesAdminOnFreshSchema(): void
    {
        $username = 'qa_cli_' . bin2hex((string) random_bytes(4));

        $run = $this->runCreateAdminFor($username, self::CLI_PASS_A);

        $this->assertSame(0, $run['exit'], "stdout: {$run['out']} stderr: {$run['err']}");
        $this->assertStringContainsString('Admin creado.', $run['out']);

        $row = $this->userRowByName($username);
        $this->assertNotNull($row, 'CLI must persist the admin account');
        $this->assertSame('admin', $row['role']);
        $this->assertGreaterThanOrEqual(60, strlen($row['password']), 'password column must hold a bcrypt hash');
        $this->assertTrue(password_verify(self::CLI_PASS_A, $row['password']));
    }

    public function testCliSecondRunWithoutForceKeepsHashUntouched(): void
    {
        $username = 'qa_cli_' . bin2hex((string) random_bytes(4));
        $first = $this->runCreateAdminFor($username, self::CLI_PASS_A);
        $this->assertSame(0, $first['exit'], 'precondition: first run creates the admin');
        $before = $this->userRowByName($username);
        $this->assertNotNull($before);

        $second = $this->runCreateAdminFor($username, self::CLI_PASS_A);

        $this->assertSame(0, $second['exit'], 'idempotent rerun must not fail');
        $this->assertStringContainsString('El admin ya existe.', $second['out']);

        $after = $this->userRowByName($username);
        $this->assertNotNull($after);
        $this->assertSame($before['password'], $after['password'], 'hash must be unchanged without --force');
        $this->assertSame('admin', $after['role']);
    }

    public function testCliForceRotatesPasswordHash(): void
    {
        $username = 'qa_cli_' . bin2hex((string) random_bytes(4));
        $first = $this->runCreateAdminFor($username, self::CLI_PASS_A);
        $this->assertSame(0, $first['exit'], 'precondition: first run creates the admin');
        $before = $this->userRowByName($username);
        $this->assertNotNull($before);

        $rotated = $this->runCreateAdminFor($username, self::CLI_PASS_B, true);

        $this->assertSame(0, $rotated['exit'], "stdout: {$rotated['out']} stderr: {$rotated['err']}");
        $this->assertStringContainsString('actualizada', $rotated['out']);

        $after = $this->userRowByName($username);
        $this->assertNotNull($after);
        $this->assertNotSame($before['password'], $after['password'], '--force must rotate the hash');
        $this->assertTrue(password_verify(self::CLI_PASS_B, $after['password']), 'new password must verify after rotation');
        $this->assertFalse(password_verify(self::CLI_PASS_A, $after['password']), 'old password must stop verifying');
    }

    public function testCliRefusesToPromoteExistingUserRoleAccount(): void
    {
        $username = 'qa_cli_' . bin2hex((string) random_bytes(4));
        $st = TestDb_pdo()->prepare("INSERT INTO users (username, password, role) VALUES (?, ?, 'user')");
        $st->execute([$username, password_hash(self::CLI_PASS_A, PASSWORD_DEFAULT)]);
        $before = $this->userRowByName($username);
        $this->assertNotNull($before, 'precondition: user-role account exists');

        $run = $this->runCreateAdminFor($username, self::CLI_PASS_A);

        $this->assertSame(1, $run['exit'], 'refusal must exit non-zero');
        $this->assertStringContainsString("rol 'user'", $run['err'], 'refusal reason goes to stderr');

        $after = $this->userRowByName($username);
        $this->assertNotNull($after);
        $this->assertSame('user', $after['role'], 'role must stay user');
        $this->assertSame($before['password'], $after['password'], 'password must stay untouched on refusal');
    }
}
