/**
 * OpenAPI determinista y chequeo de drift (todo 21).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { canonicalOpenApi, sortDeep } from '../scripts/openapi.js';

const OPENAPI_PATH = fileURLToPath(new URL('../openapi.json', import.meta.url));

type Operation = { tags?: string[]; responses?: Record<string, unknown> };

function readDocument(): { paths: Record<string, Record<string, Operation>> } {
    return JSON.parse(readFileSync(OPENAPI_PATH, 'utf8')) as { paths: Record<string, Record<string, Operation>> };
}

describe('openapi', () => {
    it('openapi.json está al día (export determinista)', () => {
        expect(readFileSync(OPENAPI_PATH, 'utf8')).toBe(canonicalOpenApi());
    });

    it('cubre las 20 rutas / 22 operaciones reales', () => {
        const document = readDocument();
        const paths = Object.keys(document.paths);
        const operations = paths.flatMap(path => Object.keys(document.paths[path] ?? {}).filter(key => key !== 'parameters'));

        expect(paths).toHaveLength(20);
        expect(operations).toHaveLength(22);
        expect(new Set(paths).size).toBe(20);
    });

    it('todas las operaciones documentan tags y responses', () => {
        const document = readDocument();

        for (const [path, item] of Object.entries(document.paths)) {
            for (const [method, operation] of Object.entries(item)) {
                if (method === 'parameters') {
                    continue;
                }

                expect(operation.tags, `${method.toUpperCase()} ${path}`).toBeTruthy();
                expect(operation.responses, `${method.toUpperCase()} ${path}`).toBeTruthy();
            }
        }
    });

    it('el comparador detecta drift simulado', () => {
        const document = readDocument();
        const drifted = sortDeep({ ...document, info: { title: 'drift', version: '9.9.9' } });
        const canonical = sortDeep(JSON.parse(canonicalOpenApi()));

        expect(JSON.stringify(drifted)).not.toBe(JSON.stringify(canonical));
    });
});
