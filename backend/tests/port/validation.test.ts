/**
 * Port 1:1 de `api/tests/Unit/ValidationTest.php`.
 *
 * Los 13 casos dependen del módulo de validación que implementa el todo 13
 * (Validation::username/passwordError/difficulty/positiveInt/youtubeId/text).
 */
import { describe, it } from 'vitest';

const PENDING: ReadonlyArray<readonly [string, string]> = [
    ['testValidUsername', 'todo 13'],
    ['testInvalidUsername', 'todo 13'],
    ['testPasswordError', 'todo 13'],
    ['testPasswordMinimumIsEightChars', 'todo 13'],
    ['testDifficulty', 'todo 13'],
    ['testPositiveInt', 'todo 13'],
    ['testYoutubeId', 'todo 13'],
    ['testText', 'todo 13'],
    ['testUsernameUnicodeEdges', 'todo 13'],
    ['testPasswordErrorBoundaries', 'todo 13'],
    ['testDifficultyIsCaseSensitive', 'todo 13'],
    ['testYoutubeIdVectors', 'todo 13'],
    ['testTextAndTruncateAreMultibyteSafe', 'todo 13']
];

describe('ValidationTest (PHP) -> pendiente', () => {
    for (const [name, closing] of PENDING) {
        it.todo(`${name} — lo cierra el ${closing}`);
    }
});
