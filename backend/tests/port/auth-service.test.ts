/**
 * Port 1:1 de `api/tests/Integration/AuthServiceTest.php`.
 *
 * `testSixthRapidRegisterFromSameIpHitsRateLimit` ya está cubierto en
 * `tests/rate-limit.test.ts` (simulación del orden check -> record -> INSERT).
 * Los 3 casos restantes dependen del AuthService (todo 13).
 */
import { describe, it } from 'vitest';

const PENDING: ReadonlyArray<readonly [string, string]> = [
    ['testRegisterOnEmptyUsersTableCreatesPlainUser', 'todo 13'],
    ['testDuplicateUsernameReturns409WithSpanishMessage', 'todo 13'],
    ['testLoginAfterRegistrationVerifiesPasswordRoundtrip', 'todo 14']
];

describe('AuthServiceTest (PHP) -> pendiente', () => {
    for (const [name, closing] of PENDING) {
        it.todo(`${name} — lo cierra el ${closing}`);
    }
});
