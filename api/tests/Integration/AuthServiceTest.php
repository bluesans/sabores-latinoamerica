<?php
declare(strict_types=1);

namespace Tests\Integration;

use App\Services\AuthService;
use PDO;
use PHPUnit\Framework\TestCase;

use function TestDb_pdo;
use function TestDb_reloadSchema;

/**
 * Todo-15 contract for AuthService::register:
 *
 *  a) Web registration ALWAYS creates role='user' — even on an empty users
 *     table. Admin bootstrap belongs exclusively to bin/create-admin.php.
 *  b) Duplicate usernames are rejected atomically via the UNIQUE uq_username
 *     index (SQLSTATE 23000 / driver code 1062 → HTTP 409), not by a
 *     check-then-insert pre-SELECT (TOCTOU).
 *  c) The registered credentials round-trip through login() (password_verify).
 *  d) Register rate limiting still fires: REGISTER_MAX_ATTEMPTS=5 per IP per
 *     window, so the 6th rapid register returns 429.
 *
 * Each test reloads the pristine scratch schema (TestDb_reloadSchema) so no
 * state leaks between tests.
 */
final class AuthServiceTest extends TestCase
{
    private const IP = '203.0.113.50';
    private const PASSWORD = 'S3gura!Pass2026';

    protected function setUp(): void
    {
        TestDb_reloadSchema();
    }

    public function testRegisterOnEmptyUsersTableCreatesPlainUser(): void
    {
        $pdo = TestDb_pdo();
        $count = (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
        $this->assertSame(0, $count, 'precondition: users table must be empty');

        $service = new AuthService($pdo);
        $result = $service->register('qa_reg_a', self::PASSWORD, self::IP);

        $this->assertTrue($result['ok'], 'register must succeed on an empty users table');
        $this->assertSame(200, $result['status']);
        $this->assertSame('user', $result['data']['role'], 'web registration must never mint an admin');

        $st = $pdo->prepare('SELECT username, role FROM users WHERE username = ?');
        $st->execute(['qa_reg_a']);
        $row = $st->fetch(PDO::FETCH_ASSOC);

        $this->assertNotFalse($row, 'user row must exist after successful register');
        $this->assertSame('qa_reg_a', $row['username']);
        $this->assertSame('user', $row['role'], 'persisted role must be user');
    }

    public function testDuplicateUsernameReturns409WithSpanishMessage(): void
    {
        $service = new AuthService(TestDb_pdo());

        $first = $service->register('qa_dup_user', self::PASSWORD, self::IP);
        $this->assertTrue($first['ok'], 'first register must succeed');

        $second = $service->register('qa_dup_user', 'Otra!Clave2026', self::IP);

        $this->assertFalse($second['ok'], 'duplicate username must fail');
        $this->assertSame(409, $second['status']);
        $this->assertSame('Ese usuario ya existe. Probá con otro.', $second['data']['error']);

        // Exactly one row survived the duplicate attempt.
        $count = (int) TestDb_pdo()
            ->query("SELECT COUNT(*) FROM users WHERE username = 'qa_dup_user'")
            ->fetchColumn();
        $this->assertSame(1, $count);
    }

    public function testLoginAfterRegistrationVerifiesPasswordRoundtrip(): void
    {
        $service = new AuthService(TestDb_pdo());

        $reg = $service->register('qa_login_user', self::PASSWORD, self::IP);
        $this->assertTrue($reg['ok'], 'registration precondition');

        $login = $service->login('qa_login_user', self::PASSWORD, self::IP);

        $this->assertTrue($login['ok'], 'login with just-registered credentials must succeed');
        $this->assertSame(200, $login['status']);
        $this->assertSame('qa_login_user', $login['data']['username']);
        $this->assertSame('user', $login['data']['role']);
        $this->assertNotSame('', $login['data']['access'] ?? '', 'access token must be issued');

        $bad = $service->login('qa_login_user', 'Incorrecta1', self::IP);
        $this->assertFalse($bad['ok'], 'wrong password must be rejected');
        $this->assertSame(401, $bad['status']);
    }

    public function testSixthRapidRegisterFromSameIpHitsRateLimit(): void
    {
        $service = new AuthService(TestDb_pdo());
        $statuses = [];

        for ($i = 1; $i <= 6; $i++) {
            $result = $service->register(sprintf('qa_rl_%d', $i), self::PASSWORD, self::IP);
            $statuses[] = $result['status'];
        }

        $this->assertSame(
            [200, 200, 200, 200, 200, 429],
            $statuses,
            'REGISTER_MAX_ATTEMPTS=5: the 6th rapid register from one IP must return 429'
        );
    }
}
