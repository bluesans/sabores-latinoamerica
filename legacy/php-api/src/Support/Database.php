<?php
declare(strict_types=1);

namespace App\Support;

use PDO;
use PDOException;
use RuntimeException;

final class Database
{
    private static ?PDO $pdo = null;

    public static function connection(): PDO
    {
        if (self::$pdo === null) {
            try {
                self::$pdo = new PDO(
                    'mysql:host=' . Env::get('DB_HOST', '127.0.0.1')
                        . ';dbname=' . Env::get('DB_NAME', 'sabores_latinoamerica')
                        . ';charset=utf8mb4',
                    Env::get('DB_USER', 'root'),
                    Env::get('DB_PASS', ''),
                    [
                        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    ]
                );
            } catch (PDOException $e) {
                throw new RuntimeException('No se pudo conectar a la base de datos.', 0, $e);
            }
        }
        return self::$pdo;
    }
}
