/**
 * Port 1:1 de `api/tests/Unit/ValidationTest.php` (todo 13).
 */
import { describe, expect, it } from 'vitest';
import { difficulty, passwordError, positiveInt, text, truncate, username, youtubeId } from '../../src/auth/validation.js';

describe('ValidationTest (PHP)', () => {
    it('testValidUsername', () => {
        expect(username('admin')).toBe(true);
        expect(username('usuario_1')).toBe(true);
        expect(username('Tomás')).toBe(true);
    });

    it('testInvalidUsername', () => {
        expect(username('a')).toBe(false);
        expect(username('con espacio')).toBe(false);
        expect(username('')).toBe(false);
        expect(username('a'.repeat(31))).toBe(false);
    });

    it('testPasswordError', () => {
        expect(passwordError('secreto123')).toBeNull();
        expect(passwordError('12345')).not.toBeNull();
        expect(passwordError('a'.repeat(73))).not.toBeNull();
    });

    it('testPasswordMinimumIsEightChars', () => {
        expect(passwordError('Ab1')).toContain('8');
        expect(passwordError('Abcdef')).not.toBeNull();
        expect(passwordError('Abcdefg')).not.toBeNull();
        expect(passwordError('Abcdefg1')).toBeNull();
        expect(passwordError('a'.repeat(72))).toBeNull();
    });

    it('testDifficulty', () => {
        expect(difficulty('easy')).toBe(true);
        expect(difficulty('medium')).toBe(true);
        expect(difficulty('hard')).toBe(true);
        expect(difficulty('facil')).toBe(false);
        expect(difficulty('')).toBe(false);
    });

    it('testPositiveInt', () => {
        expect(positiveInt('5')).toBe(5);
        expect(positiveInt(1)).toBe(1);
        expect(positiveInt('0')).toBeNull();
        expect(positiveInt('-1')).toBeNull();
        expect(positiveInt('abc')).toBeNull();
    });

    it('testYoutubeId', () => {
        expect(youtubeId('abc123_-xyz')).toBe('abc123_-xyz');
        expect(youtubeId(' abc123_- xyz ')).toBe('abc123_-xyz');
        expect(youtubeId('short')).toBe('');
        expect(youtubeId('')).toBe('');
    });

    it('testText', () => {
        expect(text('  hola  ', 10)).toBe('hola');
        expect(text('hola', 2)).toBe('ho');
        expect(text(null, 10)).toBe('');
    });

    it('testUsernameUnicodeEdges', () => {
        expect(username('José_1')).toBe(true);
        expect(username('user😀')).toBe(false);
        expect(username('😀😀')).toBe(false);
        expect(username('ab')).toBe(false);
        expect(username('a'.repeat(31))).toBe(false);
        expect(username('a'.repeat(30))).toBe(true);
    });

    it('testPasswordErrorBoundaries', () => {
        expect(passwordError('Abcdefg')).toContain('8');
        expect(passwordError('Abcdefg1')).toBeNull();
        expect(passwordError('a'.repeat(72))).toBeNull();
        expect(passwordError('a'.repeat(73))).toContain('72');
    });

    it('testDifficultyIsCaseSensitive', () => {
        expect(difficulty('easy')).toBe(true);
        expect(difficulty('medium')).toBe(true);
        expect(difficulty('hard')).toBe(true);
        expect(difficulty('Easy')).toBe(false);
        expect(difficulty('EASY')).toBe(false);
        expect(difficulty('')).toBe(false);
    });

    it('testYoutubeIdVectors', () => {
        expect(youtubeId('MWo42SO1aOM')).toBe('MWo42SO1aOM');
        expect(youtubeId('short')).toBe('');
        expect(youtubeId(' MWo42SO1aOM ')).toBe('MWo42SO1aOM');
        expect(youtubeId('javascript:al!')).toBe('');
        expect(youtubeId('MWo42SO1áOM')).toBe('');
    });

    it('testTextAndTruncateAreMultibyteSafe', () => {
        expect(text('  áéíóú  ', 10)).toBe('áéíóú');
        expect(truncate('áccents', 3)).toBe('ácc');
        expect(truncate('áéíóú', 2)).toBe('áé');
        expect(truncate('hello', 0)).toBe('');
        expect(truncate('hello', -3)).toBe('');
    });
});
