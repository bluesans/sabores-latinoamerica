/**
 * Port 1:1 de `api/tests/Integration/CookieFlowTest.php`.
 *
 * Ya cubiertos en la capa de repositorio (todo 10):
 * - testRefreshViaCookieRotatesSessionAndStripsBody -> tests/sessions.test.ts
 * - testReusingRotatedAwayTokenTriggersReuseDetection -> tests/sessions.test.ts
 * - testEleventhRapidFailedLoginGets429WithRetryAfterHint -> tests/rate-limit.test.ts
 *
 * Los 4 restantes necesitan las rutas HTTP de auth (todo 14).
 */
import { describe, it } from 'vitest';

const PENDING: ReadonlyArray<readonly [string, string]> = [
    ['testRegisterSetsCookieAndStripsBody', 'todo 14'],
    ['testLoginSetsCookieAndStripsBodyAndAccessWorks', 'todo 14'],
    ['testLogoutExpiresCookieAndRevokesSession', 'todo 14'],
    ['testTamperedCookieValueGets401AndClearCookie', 'todo 14']
];

describe('CookieFlowTest (PHP) -> pendiente', () => {
    for (const [name, closing] of PENDING) {
        it.todo(`${name} — lo cierra el ${closing}`);
    }
});
