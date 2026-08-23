<?php
declare(strict_types=1);

namespace Tests\Integration;

use App\Middleware\JsonErrorHandler;
use PHPUnit\Framework\TestCase;
use RuntimeException;
use Slim\Psr7\Factory\ServerRequestFactory;

/**
 * Pins todo-21: every error response carries a short structured id, and the
 * full exception detail (including the raw message) is always written to the
 * server log tagged with that same id — while the JSON payload keeps debug
 * fields gated behind displayErrorDetails.
 */
final class ErrorIdTest extends TestCase
{
    public function testProductionModeHidesDetailButLogsSecretWithId(): void
    {
        $logFile = tempnam(sys_get_temp_dir(), 'api-error-log-');
        $this->assertNotFalse($logFile);
        $previousLog = ini_set('error_log', $logFile);

        try {
            $handler = new JsonErrorHandler();
            $request = (new ServerRequestFactory())->createServerRequest('GET', '/boom');

            $response = $handler($request, new RuntimeException('boom-secret'), false);

            $body = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
        } finally {
            ini_restore('error_log');
        }

        $this->assertFalse($body['ok']);
        $this->assertArrayHasKey('id', $body, 'error id must be present even with debug off');
        $this->assertMatchesRegularExpression('/^[0-9a-f]{8}$/', $body['id']);

        $this->assertArrayNotHasKey('message', $body, 'raw message must not leak when debug is off');
        $this->assertArrayNotHasKey('file', $body, 'file path must not leak when debug is off');
        $this->assertArrayNotHasKey('line', $body);
        $this->assertArrayNotHasKey('exception', $body);

        $log = (string) file_get_contents($logFile);
        unlink($logFile);

        $this->assertStringContainsString('[api-error ' . $body['id'] . ']', $log, 'log line must carry the same id as the payload');
        $this->assertStringContainsString('boom-secret', $log, 'full detail goes to the log even when hidden from the client');
    }

    public function testDebugModeKeepsIdAndAddsDetail(): void
    {
        $handler = new JsonErrorHandler();
        $request = (new ServerRequestFactory())->createServerRequest('GET', '/boom');

        $response = $handler($request, new RuntimeException('debug-boom'), true);

        $body = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);

        $this->assertFalse($body['ok']);
        $this->assertMatchesRegularExpression('/^[0-9a-f]{8}$/', $body['id']);
        $this->assertSame(RuntimeException::class, $body['exception']);
        $this->assertSame('debug-boom', $body['message']);
        $this->assertArrayHasKey('file', $body);
        $this->assertArrayHasKey('line', $body);
    }
}
