import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { canonicalOpenApi } from './openapi.js';

const target = fileURLToPath(new URL('../openapi.json', import.meta.url));

writeFileSync(target, canonicalOpenApi(), 'utf8');
process.stdout.write(`OpenAPI exportado en ${target}\n`);
