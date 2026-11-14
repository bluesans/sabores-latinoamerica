<?php
declare(strict_types=1);

namespace Tests\Unit;

use App\Support\Jwt;
use PHPUnit\Framework\TestCase;

final class JwtTest extends TestCase
{
    /** @return array{id: int, username: string, role: string} */
    private function sampleUser(): array
    {
        return [
            'id' => 7,
            'username' => 'tester',
            'role' => 'admin',
        ];
    }

    public function testIssueAccessAndDecode(): void
    {
        $token = Jwt::issueAccess($this->sampleUser());

        $payload = Jwt::decode($token);

        $this->assertIsArray($payload);
        $this->assertSame(7, (int) $payload['sub']);
        $this->assertSame('tester', $payload['name']);
        $this->assertSame('admin', $payload['role']);
        $this->assertSame('access', $payload['token_type']);
    }

    public function testExpiredTokenIsRejected(): void
    {
        $token = Jwt::encode([
            'sub' => 1,
            'name' => 'tester',
            'role' => 'user',
            'token_type' => 'access',
            'iat' => time() - 1000,
            'exp' => time() - 100,
        ]);

        $this->assertNull(Jwt::decode($token));
    }

    public function testInvalidSignatureIsRejected(): void
    {
        $token = Jwt::issueAccess($this->sampleUser());

        $parts = explode('.', $token);
        $this->assertCount(3, $parts);

        [$h, $p, $s] = $parts;

        $tamperedSignature = substr($s, 0, -1) . (substr($s, -1) === 'A' ? 'B' : 'A');
        $tamperedToken = "$h.$p.$tamperedSignature";

        $this->assertNull(Jwt::decode($tamperedToken));
    }

    public function testNonAccessTokenIsRejected(): void
    {
        $token = Jwt::encode([
            'sub' => 1,
            'name' => 'tester',
            'role' => 'user',
            'token_type' => 'refresh',
            'iat' => time(),
            'exp' => time() + 300,
        ]);

        $this->assertNull(Jwt::decode($token));
    }

    public function testFutureIatBeyondLeewayIsRejected(): void
    {
        // Leeway is 10s: an iat a full minute in the future must be rejected.
        $token = Jwt::encode([
            'sub' => 1,
            'name' => 'tester',
            'role' => 'user',
            'token_type' => 'access',
            'iat' => time() + 60,
            'exp' => time() + 900,
        ]);

        $this->assertNull(Jwt::decode($token));
    }

    public function testAlgNoneHeaderIsRejected(): void
    {
        // Hand-craft an alg=none token (encode() always writes HS256).
        $header = json_encode(['alg' => 'none', 'typ' => 'JWT']);
        $body = json_encode([
            'sub' => 1,
            'name' => 'tester',
            'role' => 'user',
            'token_type' => 'access',
            'iat' => time(),
            'exp' => time() + 300,
        ]);

        if ($header === false || $body === false) {
            self::fail('json_encode unexpectedly failed while building the test token.');
        }

        $h = self::b64u($header);
        $p = self::b64u($body);
        // Even a correctly-signed-looking signature must not save alg=none.
        $s = self::b64u(hash_hmac('sha256', "$h.$p", 'test-secret', true));

        $this->assertNull(Jwt::decode("$h.$p.$s"));
    }

    public function testTamperedPayloadIsRejected(): void
    {
        $token = Jwt::issueAccess($this->sampleUser());

        $parts = explode('.', $token);
        $this->assertCount(3, $parts);

        [$h, $p, $s] = $parts;
        $this->assertNotSame('', $p);

        // Flip the first payload character, keep the original signature.
        $flippedFirst = $p[0] === 'A' ? 'B' : 'A';
        $tamperedToken = "$h.$flippedFirst" . substr($p, 1) . ".$s";

        $this->assertNull(Jwt::decode($tamperedToken));
    }

    public function testPlaceholderSecretIsRejected(): void
    {
        $original = $_ENV['JWT_SECRET'] ?? null;
        $_ENV['JWT_SECRET'] = 'cambiame_por_una_clave_larga_y_aleatoria';

        try {
            $this->expectException(\RuntimeException::class);
            Jwt::issueAccess($this->sampleUser());
        } finally {
            if ($original === null) {
                unset($_ENV['JWT_SECRET']);
            } else {
                $_ENV['JWT_SECRET'] = $original;
            }
        }
    }

    private static function b64u(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }
}