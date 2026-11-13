/**
 * Port 1:1 de `api/tests/Integration/AdminValidationTest.php`.
 *
 * Los 25 casos dependen de las rutas de administración (todo 19).
 */
import { describe, it } from 'vitest';

const PENDING: ReadonlyArray<readonly [string, string]> = [
    ['testMissingNameIsRejectedWith422AndFieldError', 'todo 19'],
    ['testNameLongerThan200IsRejectedWith422', 'todo 19'],
    ['testNonNumericCountryIdIsRejectedWith422', 'todo 19'],
    ['testUnknownCountryIdIsRejectedWith422', 'todo 19'],
    ['testInvalidDifficultyIsRejectedWith422', 'todo 19'],
    ['testInvalidTimeMinutesValuesAreRejectedWith422', 'todo 19'],
    ['testInvalidYoutubeIdIsRejectedWith422', 'todo 19'],
    ['testDescriptionOver10000CharsIsRejectedNotTruncated', 'todo 19'],
    ['testTopLevelErrorCarriesFirstFieldMessage', 'todo 19'],
    ['testValidMinimalCreatePersistsRow', 'todo 19'],
    ['testValidFullCreatePersistsNormalizedFieldsAndIngredients', 'todo 19'],
    ['testValidUpdateChangesExistingRow', 'todo 19'],
    ['testSaveCountryEmojiOver10CharsIsRejectedWith422', 'todo 19'],
    ['testSaveCountryTaglineOver150CharsIsRejectedWith422', 'todo 19'],
    ['testSaveCountryUnknownIdReturns404', 'todo 19'],
    ['testSaveCountryUpdatesRowOnSuccess', 'todo 19'],
    ['testRenameIngredientEmptyNameIsRejectedWith422', 'todo 19'],
    ['testRenameIngredientTooLongNameIsRejectedWith422', 'todo 19'],
    ['testRenameIngredientDuplicateReturns409', 'todo 19'],
    ['testRenameIngredientUnknownIdReturns404', 'todo 19'],
    ['testRenameIngredientSuccessPersistsNewName', 'todo 19'],
    ['testDeleteIngredientMissingReturns404', 'todo 19'],
    ['testDeleteIngredientRemovesRow', 'todo 19'],
    ['testDeleteRecipeMissingReturns404', 'todo 19'],
    ['testDeleteRecipeRemovesRow', 'todo 19']
];

describe('AdminValidationTest (PHP) -> pendiente', () => {
    for (const [name, closing] of PENDING) {
        it.todo(`${name} — lo cierra el ${closing}`);
    }
});
