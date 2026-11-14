<?php
declare(strict_types=1);

namespace Tests\Integration;

use App\Controllers\SearchController;
use App\Support\Database;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\Psr7\Factory\RequestFactory;
use Slim\Psr7\Factory\ResponseFactory;

use function TestDb_pdo;
use function TestDb_reloadSchema;

/**
 * Failure-first coverage for todo 16: search must treat user input as a
 * LITERAL, never as a LIKE pattern. MySQL wildcards (% _) typed by the user
 * must be escaped before wrapping with %...%, and oversized queries must be
 * silently capped instead of erroring.
 *
 * Calls SearchController::index directly with Slim PSR-7 objects against the
 * real scratch MySQL schema. The canonical seed already contains the
 * ingredients 'Ajo' and 'Ajonjolí', which act as natural decoys: an unescaped
 * pattern '%Ajo_%' would wrongly match 'Ajonjolí'.
 */
final class SearchEscapeTest extends TestCase
{
    private SearchController $controller;

    public static function setUpBeforeClass(): void
    {
        // Bind the Database singleton to the scratch schema BEFORE any
        // controller call opens a connection in this process.
        $_ENV['DB_NAME'] = 'sabores_latinoamerica_test';
        TestDb_reloadSchema();

        // Exact-match fixtures plus wildcard decoys.
        $pdo = TestDb_pdo();
        $insert = $pdo->prepare('INSERT INTO ingredients (name) VALUES (?)');
        foreach (['Aji 100%', 'Ajo_', 'Sal 100 gramos', 'AjoLomo'] as $name) {
            $insert->execute([$name]);
        }
    }

    protected function setUp(): void
    {
        $this->controller = new SearchController();
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private function search(string $q): ResponseInterface
    {
        $request = (new RequestFactory())->createRequest('GET', 'http://localhost/api/search');
        // Slim's factory always builds full server requests; the PSR-17 return
        // type is just the narrower RequestInterface contract.
        \assert($request instanceof ServerRequestInterface);
        $request = $request->withQueryParams(['q' => $q]);

        return $this->controller->index($request, (new ResponseFactory())->createResponse());
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

    /** @return string[] ingredient names returned for a query */
    private function ingredientNames(string $q): array
    {
        $data = $this->body($this->search($q));
        $this->assertTrue($data['ok'] ?? false, "search q={$q} must answer ok:true");
        return array_map(
            static fn (array $row): string => (string) $row['name'],
            $data['ingredients']
        );
    }

    // ------------------------------------------------------------------
    // Wildcard payloads are treated literally
    // ------------------------------------------------------------------

    public function testPercentWildcardIsLiteral(): void
    {
        $names = $this->ingredientNames('100%');

        $this->assertContains('Aji 100%', $names, 'exact fixture must be found by its own name');
        $this->assertEquals(['Aji 100%'], $names, "'%' must not widen the match to 'Sal 100 gramos'");
    }

    public function testUnderscoreWildcardIsLiteral(): void
    {
        $names = $this->ingredientNames('Ajo_');

        $this->assertContains('Ajo_', $names, 'exact fixture must be found by its own name');
        $this->assertEquals(
            ['Ajo_'],
            $names,
            "'_' must match exactly one literal char, not 'Ajonjolí'/'AjoLomo'"
        );
    }

    public function testNoMatchYieldsEmptyResultSets(): void
    {
        $data = $this->body($this->search('zzz'));

        $this->assertTrue($data['ok']);
        $this->assertSame([], $data['countries']);
        $this->assertSame([], $data['recipes']);
        $this->assertSame([], $data['ingredients']);
    }

    public function testOversizedQueryIsCappedSilently(): void
    {
        // 150 chars: must be capped (<= 100) and answered normally, no 500.
        $q = str_repeat('a', 150);

        $response = $this->search($q);
        $this->assertSame(200, $response->getStatusCode());

        $data = $this->body($response);
        $this->assertTrue($data['ok']);
        $this->assertArrayHasKey('countries', $data);
        $this->assertArrayHasKey('recipes', $data);
        $this->assertArrayHasKey('ingredients', $data);
    }
}
