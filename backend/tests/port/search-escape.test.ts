/**
 * Port 1:1 de `api/tests/Integration/SearchEscapeTest.php`.
 *
 * Requiere el endpoint /search y el escapado de LIKE del PHP (todo 17).
 */
import { describe, it } from 'vitest';

const PENDING: ReadonlyArray<readonly [string, string]> = [
    ['testPercentWildcardIsLiteral', 'todo 17'],
    ['testUnderscoreWildcardIsLiteral', 'todo 17'],
    ['testNoMatchYieldsEmptyResultSets', 'todo 17'],
    ['testOversizedQueryIsCappedSilently', 'todo 17']
];

describe('SearchEscapeTest (PHP) -> pendiente', () => {
    for (const [name, closing] of PENDING) {
        it.todo(`${name} — lo cierra el ${closing}`);
    }
});
