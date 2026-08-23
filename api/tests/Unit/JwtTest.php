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
}