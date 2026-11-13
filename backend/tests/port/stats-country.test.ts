/**
 * Port 1:1 de `api/tests/Integration/StatsCountryTest.php`.
 *
 * Requiere los endpoints /stats y /countries con el SQL exacto del PHP.
 * Se implementan en el todo 17.
 */
import { describe, it } from 'vitest';

const PENDING: ReadonlyArray<readonly [string, string]> = [
    ['testStatsWithoutView', 'todo 17'],
    ['testCountriesStrictMode', 'todo 17']
];

describe('StatsCountryTest (PHP) -> pendiente', () => {
    for (const [name, closing] of PENDING) {
        it.todo(`${name} — lo cierra el ${closing}`);
    }
});
