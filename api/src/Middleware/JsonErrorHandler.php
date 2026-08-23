<?php
declare(strict_types=1);

namespace App\Middleware;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Exception\HttpMethodNotAllowedException;
use Slim\Exception\HttpNotFoundException;
use Slim\Psr7\Response as SlimResponse;
use Throwable;

final class JsonErrorHandler
{
    public function __invoke(
        Request $request,
        Throwable $exception,
        bool $displayErrorDetails
    ): Response {
        $status = 500;
        $error = 'Error interno del servidor.';

        if ($exception instanceof HttpNotFoundException) {
            $status = 404;
            $error = 'Ruta no encontrada.';
        } elseif ($exception instanceof HttpMethodNotAllowedException) {
            $status = 405;
            $error = 'Método HTTP no permitido.';
        } elseif (method_exists($exception, 'getStatusCode')) {
            $exceptionStatus = (int) $exception->getStatusCode();

            if ($exceptionStatus >= 400) {
                $status = $exceptionStatus;
                $error = $displayErrorDetails
                    ? $exception->getMessage()
                    : 'Error en la solicitud.';
            }
        }

        $id = substr(bin2hex(random_bytes(8)), 0, 8);

        error_log(sprintf(
            '[api-error %s] %s: %s in %s:%d',
            $id,
            get_class($exception),
            $exception->getMessage(),
            $exception->getFile(),
            $exception->getLine()
        ));

        $payload = [
            'ok' => false,
            'error' => $error,
            'id' => $id,
        ];

        if ($displayErrorDetails) {
            $payload['exception'] = get_class($exception);
            $payload['message'] = $exception->getMessage();
            $payload['file'] = $exception->getFile();
            $payload['line'] = $exception->getLine();
        }

        $response = new SlimResponse($status);

        $response->getBody()->write(
            json_encode($payload, JSON_UNESCAPED_UNICODE)
        );

        return $response->withHeader('Content-Type', 'application/json; charset=utf-8');
    }
}