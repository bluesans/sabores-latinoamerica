import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { canonicalOpenApi } from './openapi.js';

const target = fileURLToPath(new URL('../openapi.json', import.meta.url));
const expected = canonicalOpenApi();
let current = '';

try {
    current = readFileSync(target, 'utf8');
} catch {
    process.stderr.write('OpenAPI drift: falta openapi.json. Ejecutá npm run openapi:export.\n');
    process.exit(1);
}

if (current !== expected) {
    process.stderr.write('OpenAPI drift: openapi.json no coincide con los schemas. Ejecutá npm run openapi:export.\n');
    process.exit(1);
}

process.stdout.write('OpenAPI OK: openapi.json está al día.\n');
