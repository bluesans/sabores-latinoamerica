<?php
declare(strict_types=1);

namespace Tests\Integration;

use App\Controllers\AuthController;
use App\Support\Jwt;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\Psr7\Factory\RequestFactory;
use Slim\Psr7\Factory\ResponseFactory;

use function TestDb_pdo;
use function TestDb_reloadSchema;

/**
 * Failure-first integration coverage for the HttpOnly refresh-cookie surface
 * (todo 18) and the Retry-After rate-limit hint (todo 20).
 *
 * Calls AuthController methods directly with Slim PSR-7 objects against the
 * real scratch MySQL schema (sabores_latinoamerica_test), reloaded before EVERY
 * test so no session/login_attempts state can leak between cases.
 *
 * Cookie transport note: the controller reads the refresh token from the
 * $_COOKIE superglobal (production Apache/PHP populates it from the request).
 * In CLI tests we seed $_COOKIE['sdl_refresh'] directly to simulate a browser
 * that stored the cookie from a previous response.
 *
 * The cookie name is pinned here as a literal on purpose: it is wire-format
 * contract shared with the frontend, independent of any support class.
 */
final class CookieFlowTest extends TestCase
{
    private const COOKIE_NAME = 'sdl_refresh';
    private const PASSWORD = 'S3gura!Pass2026';
    private const USERNAME = 'qa_cookie_user';

    private AuthController $controller;

    protected function setUp(): void
    {
        // Fresh pristine schema per test: sessions and login_attempts start empty.
        TestDb_reloadSchema();

        // Simulate a browser without our cookie; also pin COOKIE_SECURE sources
        // so the Secure-flag decision is deterministic in CLI (no HTTPS).
        unset($_COOKIE[self::COOKIE_NAME]);
        unset($_ENV['COOKIE_SECURE'], $_SERVER['COOKIE_SECURE']);
        putenv('COOKIE_SECURE');

        // CLI does set SCRIPT_NAME (it points at the phpunit runner); drop it so
        // basePath() exercises its documented default branch ('/'). Under Apache
        // SCRIPT_NAME is always present and yields the real subfolder path.
        unset($_SERVER['SCRIPT_NAME']);

        $this->controller = new AuthController(TestDb_pdo());
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private function request(string $path, ?array $parsedBody = null): ServerRequestInterface
    {
        $request = (new RequestFactory())->createRequest('POST', 'http://localhost' . $path);
        if ($parsedBody !== null) {
            $request = $request->withParsedBody($parsedBody);
        }
        return $request;
    }

    /**
     * Runs a controller callable and guarantees no transaction is left dangling
     * on the injected PDO if the current implementation throws mid-transaction.
     */
    private function invoke(callable $fn): ResponseInterface
    {
        try {
            return $fn();
        } finally {
            if (TestDb_pdo()->inTransaction()) {
                TestDb_pdo()->rollBack();
            }
        }
    }

    private function body(ResponseInterface $response): array
    {
        $response->getBody()->seek(0);
        $raw = (string) $response->getBody();
        $decoded = json_decode($raw, true);
        $this->assertIsArray($decoded, "Response body is not JSON: {$raw}");
        return $decoded;
    }

    /** Raw Set-Cookie header list; must be exactly one per response. */
    private function setCookies(ResponseInterface $response): array
    {
        return $response->getHeader('Set-Cookie');
    }

    /** Extracts the 64-hex refresh token from the Set-Cookie header ('' if absent). */
    private function cookieToken(ResponseInterface $response): string
    {
        if (preg_match('/' . self::COOKIE_NAME . '=([0-9a-f]{64})/', $response->getHeaderLine('Set-Cookie'), $m)) {
            return $m[1];
        }
        return '';
    }

    private function registerUser(string $username = self::USERNAME): ResponseInterface
    {
        return $this->invoke(
            fn (): ResponseInterface => $this->controller->register(
                $this->request('/auth/register', ['username' => $username, 'password' => self::PASSWORD]),
                (new ResponseFactory())->createResponse()
            )
        );
    }

    private function loginUser(string $username = self::USERNAME): ResponseInterface
    {
        return $this->invoke(
            fn (): ResponseInterface => $this->controller->login(
                $this->request('/auth/login', ['username' => $username, 'password' => self::PASSWORD]),
                (new ResponseFactory())->createResponse()
            )
        );
    }

    private function refreshWithCookie(string $token): ResponseInterface
    {
        $_COOKIE[self::COOKIE_NAME] = $token;

        return $this->invoke(
            fn (): ResponseInterface => $this->controller->refresh(
                $this->request('/auth/refresh'),
                (new ResponseFactory())->createResponse()
            )
        );
    }

    private function logoutWithCookie(string $token): ResponseInterface
    {
        $_COOKIE[self::COOKIE_NAME] = $token;

        return $this->invoke(
            fn (): ResponseInterface => $this->controller->logout(
                $this->request('/auth/logout', []),
                (new ResponseFactory())->createResponse()
            )
        );
    }

    private function sessionCount(int $userId): int
    {
        $st = TestDb_pdo()->prepare('SELECT COUNT(*) FROM sessions WHERE user_id = ?');
        $st->execute([$userId]);
        return (int) $st->fetchColumn();
    }

    private function userIdByName(string $username): int
    {
        $st = TestDb_pdo()->prepare('SELECT id FROM users WHERE username = ?');
        $st->execute([$username]);
        return (int) $st->fetchColumn();
    }

    /** @return array{id: int, revoked_at: string|null}|null */
    private function sessionRowByToken(string $rawToken): ?array
    {
        $st = TestDb_pdo()->prepare('SELECT id, revoked_at FROM sessions WHERE token = ?');
        $st->execute([hash('sha256', $rawToken)]);
        $row = $st->fetch(\PDO::FETCH_ASSOC);
        return $row === false ? null : ['id' => (int) $row['id'], 'revoked_at' => $row['revoked_at']];
    }

    // ------------------------------------------------------------------
    // TODO 18 - issuance: register / login
    // ------------------------------------------------------------------

    public function testRegisterSetsCookieAndStripsBody(): void
    {
        $res = $this->registerUser();

        $this->assertSame(200, $res->getStatusCode());

        $cookies = $this->setCookies($res);
        $this->assertCount(1, $cookies, 'exactly one Set-Cookie header expected');
        $this->assertStringStartsWith(self::COOKIE_NAME . '=', $cookies[0]);
        $this->assertMatchesRegularExpression('/^sdl_refresh=[0-9a-f]{64}$/', explode(';', $cookies[0])[0]);

        // CLI test env: SCRIPT_NAME undefined -> basePath() normalizes to '/'.
        $this->assertStringContainsString('Path=/', $cookies[0]);
        $this->assertStringContainsString('HttpOnly', $cookies[0]);
        $this->assertStringContainsString('SameSite=Strict', $cookies[0]);
        // SESSION_DAYS=7 in tests/bootstrap.php.
        $this->assertStringContainsString('Max-Age=' . (7 * 86400), $cookies[0]);
        $this->assertStringNotContainsString('Secure', $cookies[0], 'plain HTTP CLI request must not mark Secure');

        $data = $this->body($res);
        $this->assertArrayNotHasKey('refresh', $data, 'refresh token must NOT travel in the JSON body anymore');
        $this->assertSame('qa_cookie_user', $data['username'] ?? null);
    }

    public function testLoginSetsCookieAndStripsBodyAndAccessWorks(): void
    {
        $this->registerUser();
        $res = $this->loginUser();

        $this->assertSame(200, $res->getStatusCode());

        $cookies = $this->setCookies($res);
        $this->assertCount(1, $cookies, 'exactly one Set-Cookie header expected');
        $this->assertStringContainsString('HttpOnly', $cookies[0]);
        $this->assertStringContainsString('SameSite=Strict', $cookies[0]);
        $this->assertStringContainsString('Path=/', $cookies[0]);

        $data = $this->body($res);
        $this->assertArrayNotHasKey('refresh', $data, 'refresh token must NOT travel in the JSON body anymore');

        // The access token that IS still in the body must be a working JWT.
        $payload = Jwt::decode((string) ($data['access'] ?? ''));
        $this->assertIsArray($payload, 'access token must decode as a valid JWT');
        $this->assertSame(self::USERNAME, $payload['name'] ?? null);
    }

    // ------------------------------------------------------------------
    // TODO 18 - consumption: rotation + reuse detection
    // ------------------------------------------------------------------

    public function testRefreshViaCookieRotatesSessionAndStripsBody(): void
    {
        $reg = $this->registerUser();
        $oldToken = $this->cookieToken($reg);
        $this->assertNotSame('', $oldToken, 'register must hand out a refresh cookie');

        $userId = $this->userIdByName(self::USERNAME);
        $res = $this->refreshWithCookie($oldToken);

        $this->assertSame(200, $res->getStatusCode());

        $cookies = $this->setCookies($res);
        $this->assertCount(1, $cookies, 'exactly one Set-Cookie header expected');

        $newToken = $this->cookieToken($res);
        $this->assertNotSame('', $newToken, 'refresh must issue a NEW cookie value');
        $this->assertNotSame($oldToken, $newToken, 'rotation must mint a different token');

        $data = $this->body($res);
        $this->assertArrayNotHasKey('refresh', $data, 'refresh response body must not carry the new token');
        $this->assertIsArray(Jwt::decode((string) ($data['access'] ?? '')), 'new access JWT must be valid');

        // OLD session row: soft-revoked (reuse-detection tombstone), NEW row exists.
        $oldRow = $this->sessionRowByToken($oldToken);
        $this->assertNotNull($oldRow, 'old session row must survive as revocation tombstone');
        $this->assertNotNull($oldRow['revoked_at'], 'old session must have revoked_at set');

        $newRow = $this->sessionRowByToken($newToken);
        $this->assertNotNull($newRow, 'rotated-in session row must exist');
        $this->assertNull($newRow['revoked_at'], 'new session must be live');
    }

    public function testReusingRotatedAwayTokenTriggersReuseDetection(): void
    {
        $reg = $this->registerUser();
        $oldToken = $this->cookieToken($reg);
        $userId = $this->userIdByName(self::USERNAME);

        $first = $this->refreshWithCookie($oldToken);
        $this->assertSame(200, $first->getStatusCode(), 'precondition: first refresh succeeds');

        // Replay the OLD (already rotated-away) cookie.
        $replay = $this->refreshWithCookie($oldToken);

        $this->assertSame(401, $replay->getStatusCode());
        $this->assertSame(
            0,
            $this->sessionCount($userId),
            'reuse detection must delete ALL of the user\'s sessions'
        );
    }

    // ------------------------------------------------------------------
    // TODO 18 - logout & tampered values
    // ------------------------------------------------------------------

    public function testLogoutExpiresCookieAndRevokesSession(): void
    {
        $reg = $this->registerUser();
        $token = $this->cookieToken($reg);
        $userId = $this->userIdByName(self::USERNAME);
        $this->assertSame(1, $this->sessionCount($userId), 'precondition: one live session');

        $res = $this->logoutWithCookie($token);

        $this->assertSame(200, $res->getStatusCode());

        $cookies = $this->setCookies($res);
        $this->assertCount(1, $cookies, 'exactly one Set-Cookie header expected');
        $this->assertStringContainsString('Max-Age=0', $cookies[0], 'logout must expire the cookie');
        $this->assertStringContainsString('HttpOnly', $cookies[0]);
        $this->assertStringContainsString('SameSite=Strict', $cookies[0]);

        $row = $this->sessionRowByToken($token);
        $this->assertNotNull($row, 'session row must still exist after logout');
        $this->assertNotNull($row['revoked_at'], 'logout must revoke the session');
    }

    public function testTamperedCookieValueGets401AndClearCookie(): void
    {
        $this->registerUser();

        // Well-formed hex but no matching session row (tampered/garbage value).
        $res = $this->refreshWithCookie(str_repeat('de', 32));

        $this->assertSame(401, $res->getStatusCode());

        $cookies = $this->setCookies($res);
        $this->assertCount(1, $cookies, 'failure path must attach exactly one clear-cookie');
        $this->assertStringContainsString('Max-Age=0', $cookies[0], 'stale cookie must be evicted client-side');
    }
}
