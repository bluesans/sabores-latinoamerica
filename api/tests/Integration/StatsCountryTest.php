<?php
declare(strict_types=1);

namespace Tests\Integration;

use App\Controllers\CountryController;
use App\Controllers\StatsController;
use PDO;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\Psr7\Factory\RequestFactory;
use Slim\Psr7\Factory\ResponseFactory;

use function TestDb_credentials;
use function TestDb_dsn;
use function TestDb_pdo;
use function TestDb_reloadSchema;

use const TEST_DB;

/**
 * Todo-17 contract: /stats must not depend on the v_estadisticas view and
 * /countries must survive ONLY_FULL_GROUP_BY. Both controllers accept an
 * optional injected PDO handle so the tests pin the scratch TEST_DB instead
 * of whatever Database::connection() points at.
 *
 * Seed ground truth (db/migrations/000_install.sql): 19 countries with
 * recipes, 57 recipes, 185 distinct ingredients, 57 recipes with video.
 */
final class StatsCountryTest extends TestCase
{
    public function testStatsWithoutView(): void
    {
        TestDb_reloadSchema();
        $pdo = TestDb_pdo();
        $pdo->exec('DROP VIEW IF EXISTS v_estadisticas');

        try {
            // Mutate the scratch DB so its numbers diverge from any other
            // database (e.g. the dev DB) that still holds pristine seed data:
            // one recipe loses its video, one extra recipe is added.
            $pdo->exec("UPDATE recipes SET youtube_id = '' WHERE id = 57");
            $pdo->exec(
                "INSERT INTO recipes (country_id, name, difficulty, time_minutes, youtube_id)
                 VALUES (8, 'TEST stats probe', 'easy', 10, NULL)"
            );

            $response = (new StatsController())->index($this->request(), $this->response(), $pdo);

            $this->assertSame(200, $response->getStatusCode());
            $body = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
            $this->assertTrue($body['ok']);
            $this->assertSame(
                [
                    'paises_con_recetas' => 19,
                    'total_recetas' => 58,
                    'ingredientes_distintos' => 185,
                    'recetas_con_video' => 56,
                ],
                $body['stats'],
                'stats must be computed from the injected handle without the view'
            );
            $this->assertNotEmpty($body['top_ingredients']);
        } finally {
            // stale_state guard: reloadSchema restores the dropped view and
            // the mutated rows for later tests in this process.
            TestDb_reloadSchema();
        }
    }

    public function testCountriesStrictMode(): void
    {
        [$user, $pass] = TestDb_credentials();
        $pdo = new PDO(
            TestDb_dsn(TEST_DB),
            $user,
            $pass,
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]
        );
        $pdo->exec("SET SESSION sql_mode = 'ONLY_FULL_GROUP_BY'");
        $stMode = $pdo->query('SELECT @@SESSION.sql_mode');
        \assert($stMode !== false);
        $mode = (string) $stMode->fetchColumn();
        $this->assertStringContainsString('ONLY_FULL_GROUP_BY', $mode, 'server must honor the strict session mode');

        $response = (new CountryController())->index($this->request(), $this->response(), $pdo);

        $this->assertSame(200, $response->getStatusCode());
        $body = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
        $this->assertTrue($body['ok']);
        $this->assertCount(22, $body['countries'], 'seed ships exactly 22 countries');
        foreach ($body['countries'] as $country) {
            $this->assertIsInt($country['recipe_count'], 'recipe_count must be cast to int');
        }
    }

    private function request(): ServerRequestInterface
    {
        $request = (new RequestFactory())->createRequest('GET', 'http://localhost/stats');
        // Slim's factory always builds full server requests; the PSR-17 return
        // type is just the narrower RequestInterface contract.
        \assert($request instanceof ServerRequestInterface);
        return $request;
    }

    private function response(): ResponseInterface
    {
        return (new ResponseFactory())->createResponse();
    }
}
