<?php
declare(strict_types=1);

/**
 * Puente CLI PHP<->Node para los gates de paridad del todo 9.
 *
 * Uso: `php php-verify-token.php` con un JSON por STDIN:
 *   {"action":"issue-token","user":{"id":7,"username":"tester","role":"admin"}}
 *   {"action":"verify-token","token":"<jwt>"}
 *   {"action":"hash","password":"<texto>"}
 *   {"action":"verify-hash","password":"<texto>","hash":"<bcrypt>"}
 *
 * Responde SIEMPRE JSON UTF-8 por STDOUT: {"ok":true,"result":...} o
 * {"ok":false,"error":"..."}. Carga `legacy/php-api/.env` (mismo JWT_SECRET que backend)
 * y usa las clases REALES del v1 (`App\Support\Jwt`), no una reimplementación.
 */
use App\Support\Jwt;

$root = dirname(__DIR__, 3);

require $root . '/legacy/php-api/vendor/autoload.php';

if (file_exists($root . '/legacy/php-api/.env')) {
    Dotenv\Dotenv::createImmutable($root . '/legacy/php-api')->load();
}

try {
    $raw = stream_get_contents(STDIN);
    $input = json_decode((string) $raw, true, 512, JSON_THROW_ON_ERROR);

    if (!is_array($input)) {
        throw new RuntimeException('Se esperaba un objeto JSON por STDIN.');
    }

    $action = (string) ($input['action'] ?? '');
    $result = null;

    switch ($action) {
        case 'issue-token':
            $user = $input['user'] ?? [];
            if (!is_array($user)) {
                throw new RuntimeException('user debe ser un objeto.');
            }
            $result = Jwt::issueAccess($user);
            break;
        case 'verify-token':
            $result = Jwt::decode((string) ($input['token'] ?? ''));
            break;
        case 'hash':
            $result = password_hash((string) ($input['password'] ?? ''), PASSWORD_DEFAULT);
            break;
        case 'verify-hash':
            $result = password_verify(
                (string) ($input['password'] ?? ''),
                (string) ($input['hash'] ?? '')
            );
            break;
        default:
            throw new RuntimeException("action desconocida: {$action}");
    }

    echo json_encode(['ok' => true, 'result' => $result], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
} catch (Throwable $e) {
    echo json_encode(['ok' => false, 'error' => $e->getMessage()], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
}
