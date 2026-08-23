<?php
declare(strict_types=1);

/*
 * Integration-suite bootstrap: boots a pristine scratch MySQL schema from
 * db/migrations/000_install.sql before any test runs.
 *
 * Included by tests/bootstrap.php (phpunit.xml has a single global bootstrap),
 * which calls TestDb_reloadSchema() once per PHPUnit process. Every run therefore
 * starts from a deterministic DROP/CREATE/import cycle - no state can leak
 * between runs or suites.
 *
 * Import strategy:
 *   1. Preferred: single PDO ->exec() of the whole SQL file with
 *      PDO::MYSQL_ATTR_MULTI_STATEMENTS => true.
 *   2. Fallback (documented): pipe the file into
 *      C:\xampp\mysql\bin\mysql.exe --default-character-set=utf8mb4 <db>
 *      via proc_open stdin (no shell redirection involved - Windows-safe).
 * Either path must end with SHOW TABLES reporting >= 8 objects, else the
 * bootstrap fails loudly.
 */

use App\Support\Env;

const TEST_DB = 'sabores_latinoamerica_test';

function TestDb_dsn(?string $dbname = null): string
{
    return 'mysql:host=' . Env::get('DB_HOST', '127.0.0.1')
        . ($dbname !== null ? ';dbname=' . $dbname : '')
        . ';charset=utf8mb4';
}

/**
 * @return array{0: string|null, 1: string|null} [user, pass] as resolved by Env
 */
function TestDb_credentials(): array
{
    return [Env::get('DB_USER', 'root'), Env::get('DB_PASS', '')];
}

function TestDb_pdo(): PDO
{
    [$user, $pass] = TestDb_credentials();
    return new PDO(
        TestDb_dsn(TEST_DB),
        $user,
        $pass,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]
    );
}

function TestDb_migrationPath(): string
{
    // api/tests/Integration -> repo root -> db/migrations
    return dirname(__DIR__, 3) . DIRECTORY_SEPARATOR . 'db' . DIRECTORY_SEPARATOR . 'migrations' . DIRECTORY_SEPARATOR . '000_install.sql';
}

function TestDb_tableCount(): int
{
    $st = TestDb_pdo()->query('SHOW TABLES');
    \assert($st !== false);
    return count($st->fetchAll(PDO::FETCH_COLUMN, 0));
}

function TestDb_assertSchemaBooted(string $via): void
{
    $count = TestDb_tableCount();
    if ($count < 8) {
        throw new RuntimeException(
            "Schema import via {$via} left only {$count} tables in " . TEST_DB . ' (expected >= 8).'
        );
    }
}

function TestDb_importViaMysqlCli(string $sql): void
{
    $mysql = 'C:\\xampp\\mysql\\bin\\mysql.exe';
    if (!is_file($mysql)) {
        throw new RuntimeException("mysql.exe not found at {$mysql} for fallback import.");
    }

    [$user, $pass] = TestDb_credentials();
    $cmd = array_values(array_filter([
        $mysql,
        '--default-character-set=utf8mb4',
        '-h',
        Env::get('DB_HOST', '127.0.0.1'),
        '-u',
        $user,
        $pass !== '' ? '-p' . $pass : null,
        TEST_DB,
    ]));

    $proc = proc_open(
        $cmd,
        [['pipe', 'r'], ['pipe', 'w'], ['pipe', 'w']],
        $pipes,
        null,
        null,
        ['bypass_shell' => true]
    );
    if (!is_resource($proc)) {
        throw new RuntimeException('proc_open could not start mysql.exe fallback import.');
    }

    fwrite($pipes[0], $sql);
    fclose($pipes[0]);

    stream_set_blocking($pipes[1], false);
    stream_set_blocking($pipes[2], false);
    $stdout = '';
    $stderr = '';
    $deadline = microtime(true) + 30.0;
    while (microtime(true) < $deadline && is_resource($proc)) {
        $stdout .= (string) fread($pipes[1], 8192);
        $stderr .= (string) fread($pipes[2], 8192);
        usleep(50_000);
    }
    fclose($pipes[1]);
    fclose($pipes[2]);

    $status = proc_get_status($proc);
    if ($status['running']) {
        proc_terminate($proc);
        proc_close($proc);
        throw new RuntimeException('mysql.exe fallback import exceeded 30s and was killed.');
    }
    $exit = proc_close($proc);

    if ($exit !== 0) {
        throw new RuntimeException("mysql.exe fallback import failed (exit {$exit}): " . trim($stderr));
    }
}

function TestDb_reloadSchema(): void
{
    $sql = file_get_contents(TestDb_migrationPath());
    if ($sql === false || $sql === '') {
        throw new RuntimeException('Could not read db/migrations/000_install.sql.');
    }

    [$user, $pass] = TestDb_credentials();

    try {
        // 1) Recreate the scratch database from scratch.
        $admin = new PDO(
            TestDb_dsn(),
            $user,
            $pass,
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::MYSQL_ATTR_MULTI_STATEMENTS => true,
            ]
        );
        $admin->exec(
            'DROP DATABASE IF EXISTS `' . TEST_DB . '`;'
            . ' CREATE DATABASE `' . TEST_DB . '`'
            . ' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;'
        );
        $admin = null;

        // 2) Import the whole baseline migration in ONE exec call.
        $target = new PDO(
            TestDb_dsn(TEST_DB),
            $user,
            $pass,
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::MYSQL_ATTR_MULTI_STATEMENTS => true,
            ]
        );
        $target->exec($sql);
        $target = null;

        TestDb_assertSchemaBooted('PDO MULTI_STATEMENTS');
    } catch (PDOException|RuntimeException $e) {
        // 3) Documented fallback: real mysql.exe client over stdin.
        trigger_error(
            'PDO multi-statement import failed (' . $e->getMessage() . '); falling back to mysql.exe.',
            E_USER_NOTICE
        );
        TestDb_importViaMysqlCli($sql);
        TestDb_assertSchemaBooted('mysql.exe fallback');
    }
}

TestDb_reloadSchema();
