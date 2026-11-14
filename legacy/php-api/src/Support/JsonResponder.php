<?php
declare(strict_types=1);

namespace App\Support;

use Psr\Http\Message\ResponseInterface as Response;

trait JsonResponder
{
    /** @param array<string, mixed> $data */
    protected function json(Response $response, array $data, int $status = 200): Response
    {
        $json = json_encode($data, JSON_UNESCAPED_UNICODE);

        if ($json === false) {
            throw new \RuntimeException('No se pudo codificar la respuesta JSON.');
        }

        $response->getBody()->write($json);
        return $response->withHeader('Content-Type', 'application/json; charset=utf-8')->withStatus($status);
    }
}
