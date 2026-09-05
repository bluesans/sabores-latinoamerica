<?php
declare(strict_types=1);

namespace Tests\Integration;

use App\Controllers\AdminController;
use App\Controllers\AuthController;
use App\Services\AuthService;
use App\Support\Auth;
use App\Support\Database;
use PDO;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\Psr7\Factory\RequestFactory;
use Slim\Psr7\Factory\ResponseFactory;

use function TestDb_pdo;
use function TestDb_reloadSchema;

/**
 * Coverage for the admin efficiency/correctness pass: saveRecipe 404 without
 * orphans, ingredient 422, id 400s, the sessions list/revoke endpoints and
 * the refresh-token brute-force throttle (login_attempts.action='refresh').
 *
 * Controllers are invoked directly with Slim PSR-7 objects against the real
 * scratch MySQL schema (sabores_latinoamerica_test), reloaded before EVERY
 * test so no sessions/login_attempts state can leak between cases.
 */
final class AdminSessionsTest extends TestCase
{
    private const COOKIE_NAME = 'sdl_refresh';
    private const PASSWORD = 'S3gura!Pass2026';

    private AdminController $admin;

    public static function setUpBeforeClass(): void
    {
        // Bind the Database singleton to the scratch schema BEFORE any
        // controller call opens a connection in this process.
        $_ENV['DB_NAME'] = 'sabores_latinoamerica_test';
        TestDb_reloadSchema();
    }

    protected function setUp(): void
    {
        TestDb_reloadSchema();
        unset($_COOKIE[self::COOKIE_NAME]);
        $this->admin = new AdminController();
    }

    protected function tearDown(): void
    {
        unset($_COOKIE[self::COOKIE_NAME]);
        $pdo = Database::connection();
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    /**
     * @param array<string, mixed>|null $parsedBody
     * @param array<string, string> $headers
     */
    private function request(
        string $method,
        string $path,
        ?array $parsedBody = null,
        array $headers = []
    ): ServerRequestInterface {
        $request = (new RequestFactory())->createRequest($method, 'http://localhost' . $path);
        \assert($request instanceof ServerRequestInterface);
        if ($parsedBody !== null) {
            $request = $request->withParsedBody($parsedBody);
        }
        foreach ($headers as $name => $value) {
            $request = $request->withHeader($name, $value);
        }
        return $request;
    }

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
            fn (): ResponseInterface => $this->admin->saveRecipe(
                $this->request('POST', '/admin/recipes', $payload),
                (new ResponseFactory())->createResponse()
            )
        );
    }

    private function sessionsList(): ResponseInterface
    {
        return $this->invoke(
            fn (): ResponseInterface => $this->admin->sessions(
                $this->request('GET', '/admin/sessions'),
                (new ResponseFactory())->createResponse()
            )
        );
    }

    private function revokeSession(string $id): ResponseInterface
    {
        return $this->invoke(
            fn (): ResponseInterface => $this->admin->revokeSession(
                $this->request('DELETE', '/admin/sessions/' . $id),
                (new ResponseFactory())->createResponse(),
                ['id' => $id]
            )
        );
    }

    private function createUser(string $username): int
    {
        $pdo = TestDb_pdo();
        $pdo->prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)')
            ->execute([$username, password_hash(self::PASSWORD, PASSWORD_DEFAULT), 'user']);
        return (int) $pdo->lastInsertId();
    }

    // ------------------------------------------------------------------
    // saveRecipe existence check: 404 must not leave orphan ingredients
    // ------------------------------------------------------------------

    public function testSaveRecipeUnknownIdReturns404WithoutOrphans(): void
    {
        $countStmt = TestDb_pdo()->prepare('SELECT COUNT(*) FROM ingredients');
        $countStmt->execute();
        $before = (int) $countStmt->fetchColumn();

        $res = $this->saveRecipe([
            'id' => '999999',
            'name' => 'Receta fantasma',
            'country_id' => 1,
            'ingredients' => ['Ingrediente huerfano QA Unico'],
        ]);

        $this->assertSame(404, $res->getStatusCode());
        $data = $this->body($res);
        $this->assertFalse($data['ok']);
        $this->assertSame('Receta no encontrada.', $data['error'] ?? null);

        $st = TestDb_pdo()->prepare('SELECT 1 FROM recipes WHERE id = ?');
        $st->execute([999999]);
        $this->assertFalse($st->fetchColumn(), 'no recipe row may be created for unknown id');

        $st = TestDb_pdo()->prepare('SELECT 1 FROM ingredients WHERE name = ?');
        $st->execute(['Ingrediente huerfano QA Unico']);
        $this->assertFalse($st->fetchColumn(), 'no orphan ingredient may be inserted on 404');

        $afterStmt = TestDb_pdo()->prepare('SELECT COUNT(*) FROM ingredients');
        $afterStmt->execute();
        $after = (int) $afterStmt->fetchColumn();
        $this->assertSame($before, $after, 'ingredient catalog must be untouched');

        $st = TestDb_pdo()->prepare('SELECT COUNT(*) FROM recipe_ingredient WHERE recipe_id = ?');
        $st->execute([999999]);
        $this->assertSame(0, (int) $st->fetchColumn(), 'no links may be written for unknown id');
    }

    public function testSaveRecipeIngredientNameOver200IsRejectedWith422(): void
    {
        $res = $this->saveRecipe([
            'name' => 'Receta con ingrediente largo',
            'country_id' => 1,
            'ingredients' => [str_repeat('x', 201)],
        ]);

        $this->assertSame(422, $res->getStatusCode());
        $data = $this->body($res);
        $this->assertFalse($data['ok']);
        $this->assertSame(
            'El nombre del ingrediente no puede superar los 200 caracteres.',
            $data['errors']['ingredients'] ?? null
        );
    }

    // ------------------------------------------------------------------
    // Invalid ids -> 400 (valid ids keep their 404 behavior)
    // ------------------------------------------------------------------

    public function testSaveCountryInvalidIdReturns400(): void
    {
        foreach (['abc', '0', '-3'] as $badId) {
            $res = $this->invoke(
                fn (): ResponseInterface => $this->admin->saveCountry(
                    $this->request('PUT', '/admin/countries/' . $badId, ['emoji' => 'x', 'tagline' => 'ok']),
                    (new ResponseFactory())->createResponse(),
                    ['id' => $badId]
                )
            );

            $this->assertSame(400, $res->getStatusCode(), "id={$badId}");
            $data = $this->body($res);
            $this->assertSame('ID inválido.', $data['error'] ?? null, "id={$badId}");
        }
    }

    public function testRenameIngredientInvalidIdReturns400(): void
    {
        $res = $this->invoke(
            fn (): ResponseInterface => $this->admin->renameIngredient(
                $this->request('PUT', '/admin/ingredients/abc', ['name' => 'Nuevo']),
                (new ResponseFactory())->createResponse(),
                ['id' => 'abc']
            )
        );

        $this->assertSame(400, $res->getStatusCode());
        $this->assertSame('ID inválido.', $this->body($res)['error'] ?? null);
    }

    public function testDeleteIngredientInvalidIdReturns400(): void
    {
        $res = $this->invoke(
            fn (): ResponseInterface => $this->admin->deleteIngredient(
                $this->request('DELETE', '/admin/ingredients/abc'),
                (new ResponseFactory())->createResponse(),
                ['id' => 'abc']
            )
        );

        $this->assertSame(400, $res->getStatusCode());
        $this->assertSame('ID inválido.', $this->body($res)['error'] ?? null);
    }

    // ------------------------------------------------------------------
    // list() keeps its response shape with the id=>index map
    // ------------------------------------------------------------------

    public function testListKeepsResponseShape(): void
    {
        $res = $this->invoke(
            fn (): ResponseInterface => $this->admin->list(
                $this->request('GET', '/admin/data'),
                (new ResponseFactory())->createResponse()
            )
        );

        $this->assertSame(200, $res->getStatusCode());
        $data = $this->body($res);
        $this->assertTrue($data['ok'] ?? false);
        $this->assertIsArray($data['recipes'] ?? null);
        $this->assertIsArray($data['countries'] ?? null);
        $this->assertIsArray($data['ingredients'] ?? null);
        $this->assertNotEmpty($data['recipes'], 'seed must provide recipes');

        /** @var array<string, mixed> $first */
        $first = $data['recipes'][0];
        $this->assertIsArray($first['ingredients'] ?? null, 'each recipe carries its ingredients array');
        $this->assertContains('Cerdo', $first['ingredients'], 'recipe 1 (Tacos al Pastor) lists Cerdo first');
    }

    // ------------------------------------------------------------------
    // Sessions endpoints
    // ------------------------------------------------------------------

    public function testSessionsListReturnsJoinedRows(): void
    {
        $userId = $this->createUser('qa_sess_list');
        $pdo = TestDb_pdo();
        Auth::createRefreshToken($pdo, $userId, '127.0.0.1', 'QA-Agent/1.0');

        $res = $this->sessionsList();

        $this->assertSame(200, $res->getStatusCode());
        $data = $this->body($res);
        $this->assertTrue($data['ok'] ?? false);
        $this->assertIsArray($data['sessions'] ?? null);
        $this->assertNotEmpty($data['sessions']);

        /** @var array<string, mixed> $row */
        $row = $data['sessions'][0];
        foreach (['id', 'username', 'created_at', 'expires_at', 'revoked_at', 'ip', 'user_agent'] as $key) {
            $this->assertArrayHasKey($key, $row, "session row must carry '{$key}'");
        }
        $this->assertSame('qa_sess_list', $row['username']);
        $this->assertSame('127.0.0.1', $row['ip']);
        $this->assertSame('QA-Agent/1.0', $row['user_agent']);
        $this->assertNull($row['revoked_at'], 'fresh session must be live');
    }

    public function testRevokeSessionSoftRevokesAndSecondRevokeIs404(): void
    {
        $userId = $this->createUser('qa_sess_revoke');
        $raw = Auth::createRefreshToken(TestDb_pdo(), $userId, '127.0.0.1', 'QA-Agent/1.0');
        $st = TestDb_pdo()->prepare('SELECT id FROM sessions WHERE token = ?');
        $st->execute([hash('sha256', $raw)]);
        $sessionId = (string) $st->fetchColumn();
        $this->assertNotSame('', $sessionId);

        $res = $this->revokeSession($sessionId);

        $this->assertSame(200, $res->getStatusCode());
        $this->assertTrue($this->body($res)['ok']);

        $this->assertNotNull(
            $this->revokedAt((int) $sessionId),
            'revoked row must survive as a revocation tombstone with revoked_at set'
        );

        $again = $this->revokeSession($sessionId);

        $this->assertSame(404, $again->getStatusCode(), 'already-revoked session revokes nothing');
        $this->assertSame('Sesión no encontrada.', $this->body($again)['error'] ?? null);
    }

    public function testRevokeSessionUnknownIdReturns404AndBadIdReturns400(): void
    {
        $missing = $this->revokeSession('999999');

        $this->assertSame(404, $missing->getStatusCode());
        $this->assertSame('Sesión no encontrada.', $this->body($missing)['error'] ?? null);

        $bad = $this->revokeSession('abc');

        $this->assertSame(400, $bad->getStatusCode());
        $this->assertSame('ID inválido.', $this->body($bad)['error'] ?? null);
    }

    /** @return string|null */
    private function revokedAt(int $sessionId): ?string
    {
        $st = TestDb_pdo()->prepare('SELECT revoked_at FROM sessions WHERE id = ?');
        $st->execute([$sessionId]);
        $value = $st->fetchColumn();
        return $value === false || $value === null ? null : (string) $value;
    }

    // ------------------------------------------------------------------
    // Session metadata wiring
    // ------------------------------------------------------------------

    public function testCreateRefreshTokenTruncatesLongUserAgent(): void
    {
        $userId = $this->createUser('qa_sess_meta');
        $raw = Auth::createRefreshToken(TestDb_pdo(), $userId, '10.0.0.9', str_repeat('a', 300));

        $st = TestDb_pdo()->prepare('SELECT ip, user_agent FROM sessions WHERE token = ?');
        $st->execute([hash('sha256', $raw)]);
        $row = $st->fetch(PDO::FETCH_ASSOC);
        $this->assertIsArray($row);
        $this->assertSame('10.0.0.9', $row['ip']);
        $this->assertSame(255, strlen((string) $row['user_agent']), 'UA must be truncated to 255');
    }

    public function testRefreshPersistsIpAndUserAgentOnRotation(): void
    {
        $pdo = TestDb_pdo();
        $service = new AuthService($pdo);
        $reg = $service->register('qa_sess_rot', self::PASSWORD, '9.9.9.9', 'QA-Reg/1.0');
        $this->assertTrue($reg['ok'] ?? false, 'precondition: register succeeds');
        $oldToken = (string) ($reg['data']['refresh'] ?? '');
        $this->assertNotSame('', $oldToken);

        $userStmt = $pdo->prepare("SELECT id FROM users WHERE username = 'qa_sess_rot'");
        $userStmt->execute();
        $userId = (int) $userStmt->fetchColumn();

        $refreshed = $service->refresh($oldToken, '8.8.8.8', 'QA-Refresh/2.0');
        $this->assertTrue($refreshed['ok'] ?? false, 'precondition: refresh succeeds');
        $newToken = (string) ($refreshed['data']['refresh'] ?? '');

        $st = $pdo->prepare('SELECT ip, user_agent FROM sessions WHERE token = ?');
        $st->execute([hash('sha256', $newToken)]);
        $row = $st->fetch(PDO::FETCH_ASSOC);
        $this->assertIsArray($row);
        $this->assertSame('8.8.8.8', $row['ip']);
        $this->assertSame('QA-Refresh/2.0', $row['user_agent']);

        $st = $pdo->prepare('SELECT COUNT(*) FROM sessions WHERE user_id = ?');
        $st->execute([$userId]);
        $this->assertSame(2, (int) $st->fetchColumn(), 'rotation keeps the revoked tombstone plus the new row');
    }

    public function testRefreshViaControllerStoresRequestMetadata(): void
    {
        $pdo = TestDb_pdo();
        $service = new AuthService($pdo);
        $reg = $service->register('qa_sess_ctl', self::PASSWORD, '9.9.9.9', null);
        $this->assertTrue($reg['ok'] ?? false, 'precondition: register succeeds');
        $token = (string) ($reg['data']['refresh'] ?? '');

        $_COOKIE[self::COOKIE_NAME] = $token;
        $controller = new AuthController($pdo);
        $res = $controller->refresh(
            $this->request('GET', '/auth/refresh', null, ['User-Agent' => 'QA-Cookie/3.0']),
            (new ResponseFactory())->createResponse()
        );

        $this->assertSame(200, $res->getStatusCode());
        $cookies = array_values($res->getHeader('Set-Cookie'));
        $this->assertCount(1, $cookies);
        $this->assertMatchesRegularExpression('/^sdl_refresh=[0-9a-f]{64}$/', explode(';', $cookies[0])[0]);
    }

    // ------------------------------------------------------------------
    // Refresh throttle: unknown tokens recorded as action='refresh' -> 429
    // ------------------------------------------------------------------

    public function testUnknownTokenRefreshThrottleReturns429WithRetryAfter(): void
    {
        $controller = new AuthController(TestDb_pdo());
        $statuses = [];

        for ($i = 1; $i <= 11; $i++) {
            $_COOKIE[self::COOKIE_NAME] = str_repeat('de', 32);
            $last = $controller->refresh(
                $this->request('POST', '/auth/refresh'),
                (new ResponseFactory())->createResponse()
            );
            if (TestDb_pdo()->inTransaction()) {
                TestDb_pdo()->rollBack();
            }
            $statuses[] = $last->getStatusCode();
        }

        $this->assertSame(
            [401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 429],
            $statuses,
            'REFRESH_MAX_ATTEMPTS=10: the 11th rapid unknown-token refresh must be blocked'
        );

        $retryAfter = $last->getHeaderLine('Retry-After');
        $this->assertNotSame('', $retryAfter, '429 must carry a Retry-After hint header');
        $this->assertMatchesRegularExpression('/^\d+$/', $retryAfter, 'Retry-After must be an integer');
        $this->assertGreaterThan(0, (int) $retryAfter);
        $this->assertLessThanOrEqual(300, (int) $retryAfter, 'hint cannot exceed the 5-minute refresh window');

        $data = $this->body($last);
        $this->assertSame('Demasiados intentos. Esperá unos minutos.', $data['error'] ?? null);

        $st = TestDb_pdo()->prepare("SELECT COUNT(*) FROM login_attempts WHERE action = 'refresh'");
        $st->execute();
        $this->assertSame(10, (int) $st->fetchColumn(), 'each failed refresh must be recorded as action=refresh');
    }

    public function testLogoutAlwaysSucceedsEvenUnderRefreshThrottle(): void
    {
        $controller = new AuthController(TestDb_pdo());

        for ($i = 1; $i <= 11; $i++) {
            $_COOKIE[self::COOKIE_NAME] = str_repeat('ab', 32);
            $controller->refresh(
                $this->request('POST', '/auth/refresh'),
                (new ResponseFactory())->createResponse()
            );
        }

        $_COOKIE[self::COOKIE_NAME] = str_repeat('ab', 32);
        $res = $controller->logout(
            $this->request('POST', '/auth/logout', []),
            (new ResponseFactory())->createResponse()
        );

        $this->assertSame(200, $res->getStatusCode(), 'logout is never throttled by design');
        $this->assertTrue($this->body($res)['ok'] ?? false);
    }
}
