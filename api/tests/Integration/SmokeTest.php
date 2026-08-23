<?php
declare(strict_types=1);

namespace Tests\Integration;

use PHPUnit\Framework\TestCase;

use function TestDb_pdo;

/**
 * Pins the todo-3 schema contract (db/migrations/000_install.sql) against the
 * real MySQL server: exact table set, the statistics view, and the columns the
 * auth rework depends on.
 */
final class SmokeTest extends TestCase
{
    /** @var string[] canonical base tables from 000_install.sql */
    private const EXPECTED_TABLES = [
        'countries',
        'favorites',
        'ingredients',
        'login_attempts',
        'recipe_ingredient',
        'recipes',
        'sessions',
        'users',
    ];

    public function testSchemaBoots(): void
    {
        $pdo = TestDb_pdo();

        $stTables = $pdo->query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
        \assert($stTables !== false);
        $tables = $stTables->fetchAll(\PDO::FETCH_COLUMN, 0);
        sort($tables);
        $expected = self::EXPECTED_TABLES;
        sort($expected);
        $this->assertSame($expected, $tables, 'SHOW TABLES must match the 000_install.sql table set exactly');

        $stViews = $pdo->query("SHOW FULL TABLES WHERE Table_type = 'VIEW'");
        \assert($stViews !== false);
        $views = $stViews->fetchAll(\PDO::FETCH_COLUMN, 0);
        $this->assertContains('v_estadisticas', $views, 'statistics view v_estadisticas must exist');

        $stUserColumns = $pdo->query('SHOW COLUMNS FROM `users`');
        \assert($stUserColumns !== false);
        $userColumns = $stUserColumns->fetchAll(\PDO::FETCH_COLUMN, 0);
        $this->assertContains('role', $userColumns, 'users.role column is part of the auth contract');

        $stSessionColumns = $pdo->query('SHOW COLUMNS FROM `sessions`');
        \assert($stSessionColumns !== false);
        $sessionColumns = $stSessionColumns->fetchAll(\PDO::FETCH_COLUMN, 0);
        $this->assertContains('revoked_at', $sessionColumns, 'sessions.revoked_at column is part of the auth contract');
    }
}
