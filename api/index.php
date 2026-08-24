<?php
declare(strict_types=1);

use App\Middleware\CorsMiddleware;
use App\Middleware\JsonErrorHandler;
use App\Support\Env;
use Slim\Factory\AppFactory;

require __DIR__ . '/vendor/autoload.php';

if (file_exists(__DIR__ . '/.env')) {
    Dotenv\Dotenv::createImmutable(__DIR__)->load();
}

// No divulgar la version de PHP aunque el hosting no aplique el .htaccess.
header_remove('X-Powered-By');

$app = AppFactory::create();

// Deja el proyecto funcionar sea cual sea la subcarpeta donde lo sirvas.
$app->setBasePath(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'])));

$app->addBodyParsingMiddleware();
$app->addRoutingMiddleware();

// Errores convertidos a JSON.
$errorMiddleware = $app->addErrorMiddleware(
    Env::get('APP_DEBUG', '0') === '1',
    true,
    true
);

$errorMiddleware->setDefaultErrorHandler(new JsonErrorHandler());

// CORS configurable desde .env.
$app->add(CorsMiddleware::class);

// Responder preflight CORS antes de que el ruteo exija coincidencia exacta.
$app->options('/{routes:.+}', function ($request, $response) {
    return $response;
});

(require __DIR__ . '/routes.php')($app);

$app->run();
