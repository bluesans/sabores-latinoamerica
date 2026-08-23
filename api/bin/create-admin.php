<?php
declare(strict_types=1);

use App\Support\Env;
use App\Support\Validation;

// Bootstrap de administrador inicial (solo CLI).
// Uso: php api/bin/create-admin.php [--force]
// Requiere ADMIN_USER y ADMIN_PASS en el entorno o en api/.env.

if (PHP_SAPI !== 'cli') {
    echo "Este script solo puede ejecutarse desde la linea de comandos.\n";
    exit(1);
}

$apiDir = dirname(__DIR__);

require $apiDir . '/vendor/autoload.php';

if (file_exists($apiDir . '/.env')) {
    Dotenv\Dotenv::createImmutable($apiDir)->load();
}

$username = Env::get('ADMIN_USER');
$password = Env::get('ADMIN_PASS');

$errors = [];

if ($username === null) {
    $errors[] = 'ADMIN_USER no esta definido en el entorno.';
} elseif (!Validation::username($username)) {
    $errors[] = 'ADMIN_USER invalido: debe tener entre 3 y 30 caracteres (letras, numeros o guion bajo).';
}

if ($password === null) {
    $errors[] = 'ADMIN_PASS no esta definido en el entorno.';
} else {
    $passwordError = Validation::passwordError($password);
    if ($passwordError !== null) {
        $errors[] = 'ADMIN_PASS invalido: ' . $passwordError;
    }
}

if ($errors !== []) {
    foreach ($errors as $error) {
        fwrite(STDERR, $error . "\n");
    }
    exit(1);
}

try {
    $pdo = new PDO(
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
} catch (PDOException) {
    fwrite(STDERR, "No se pudo conectar a la base de datos.\n");
    exit(1);
}

$statement = $pdo->prepare('SELECT role FROM users WHERE username = ?');
$statement->execute([$username]);
$existing = $statement->fetch();

$force = in_array('--force', $argv, true);

if ($existing === false) {
    $insert = $pdo->prepare(
        "INSERT INTO users (username, password, role) VALUES (?, ?, 'admin')"
    );
    $insert->execute([$username, password_hash($password, PASSWORD_DEFAULT)]);
    echo "Admin creado.\n";
    exit(0);
}

if ($existing['role'] === 'user') {
    fwrite(
        STDERR,
        "El usuario '{$username}' ya existe con rol 'user'; este script no promueve cuentas existentes."
            . " Promuevelo manualmente con SQL:"
            . " UPDATE users SET role = 'admin' WHERE username = '{$username}';"
            . " y luego reejecuta este script para fijar su contrasena.\n"
    );
    exit(1);
}

if (!$force) {
    echo "El admin ya existe.\n";
    exit(0);
}

$update = $pdo->prepare('UPDATE users SET password = ? WHERE username = ?');
$update->execute([password_hash($password, PASSWORD_DEFAULT), $username]);
echo "Contraseña del admin actualizada.\n";
exit(0);
