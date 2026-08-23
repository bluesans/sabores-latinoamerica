<?php
declare(strict_types=1);

namespace Tests\Unit;

use App\Support\Validation;
use PHPUnit\Framework\TestCase;

final class ValidationTest extends TestCase
{
    public function testValidUsername(): void
    {
        $this->assertTrue(Validation::username('admin'));
        $this->assertTrue(Validation::username('usuario_1'));
        $this->assertTrue(Validation::username('Tomás'));
    }

    public function testInvalidUsername(): void
    {
        $this->assertFalse(Validation::username('a'));
        $this->assertFalse(Validation::username('con espacio'));
        $this->assertFalse(Validation::username(''));
        $this->assertFalse(Validation::username(str_repeat('a', 31)));
    }

    public function testPasswordError(): void
    {
        $this->assertNull(Validation::passwordError('secreto123'));

        $short = Validation::passwordError('12345');
        $this->assertNotNull($short);

        $long = Validation::passwordError(str_repeat('a', 73));
        $this->assertNotNull($long);
    }

    public function testPasswordMinimumIsEightChars(): void
    {
        // 'Ab1' (3 chars): rejected and the message must state the new minimum.
        $err = Validation::passwordError('Ab1');
        $this->assertNotNull($err);
        $this->assertStringContainsString('8', $err);

        // 6 and 7 chars: still rejected under the stronger policy.
        $this->assertNotNull(Validation::passwordError('Abcdef'), '6 chars must be rejected (old policy allowed it)');
        $this->assertNotNull(Validation::passwordError('Abcdefg'), '7 chars must be rejected');

        // Exactly 8 chars: accepted.
        $this->assertNull(Validation::passwordError('Abcdefg1'));

        // Max-72 boundary unchanged.
        $this->assertNull(Validation::passwordError(str_repeat('a', 72)));
    }

    public function testDifficulty(): void
    {
        $this->assertTrue(Validation::difficulty('easy'));
        $this->assertTrue(Validation::difficulty('medium'));
        $this->assertTrue(Validation::difficulty('hard'));

        $this->assertFalse(Validation::difficulty('facil'));
        $this->assertFalse(Validation::difficulty(''));
    }

    public function testPositiveInt(): void
    {
        $this->assertSame(5, Validation::positiveInt('5'));
        $this->assertSame(1, Validation::positiveInt(1));

        $this->assertNull(Validation::positiveInt('0'));
        $this->assertNull(Validation::positiveInt('-1'));
        $this->assertNull(Validation::positiveInt('abc'));
    }

    public function testYoutubeId(): void
    {
        $valid = 'abc123_-xyz';

        $this->assertSame($valid, Validation::youtubeId($valid));
        $this->assertSame($valid, Validation::youtubeId(' abc123_- xyz '));

        $this->assertSame('', Validation::youtubeId('short'));
        $this->assertSame('', Validation::youtubeId(''));
    }

    public function testText(): void
    {
        $this->assertSame('hola', Validation::text('  hola  ', 10));
        $this->assertSame('ho', Validation::text('hola', 2));
        $this->assertSame('', Validation::text(null, 10));
    }

    public function testUsernameUnicodeEdges(): void
    {
        // Accented letters are \p{L}: accepted.
        $this->assertTrue(Validation::username('José_1'));

        // Emoji are neither letters nor numbers: rejected.
        $this->assertFalse(Validation::username('user😀'));
        $this->assertFalse(Validation::username('😀😀'));

        // Length boundaries (3..30): 2 and 31 chars rejected.
        $this->assertFalse(Validation::username('ab'));
        $this->assertFalse(Validation::username(str_repeat('a', 31)));

        // Sanity: exactly 30 chars is still fine.
        $this->assertTrue(Validation::username(str_repeat('a', 30)));
    }

    public function testPasswordErrorBoundaries(): void
    {
        // 7 chars: rejected, message must state the minimum of 8.
        $seven = Validation::passwordError('Abcdefg');
        $this->assertNotNull($seven);
        $this->assertStringContainsString('8', $seven);

        // Exactly 8 chars: accepted.
        $this->assertNull(Validation::passwordError('Abcdefg1'));

        // Exactly 72 bytes (bcrypt limit): accepted.
        $this->assertNull(Validation::passwordError(str_repeat('a', 72)));

        // 73 bytes: rejected, message must state the max of 72.
        $seventyThree = Validation::passwordError(str_repeat('a', 73));
        $this->assertNotNull($seventyThree);
        $this->assertStringContainsString('72', $seventyThree);
    }

    public function testDifficultyIsCaseSensitive(): void
    {
        $this->assertTrue(Validation::difficulty('easy'));
        $this->assertTrue(Validation::difficulty('medium'));
        $this->assertTrue(Validation::difficulty('hard'));

        // Strict in_array: wrong casing is not silently normalized.
        $this->assertFalse(Validation::difficulty('Easy'));
        $this->assertFalse(Validation::difficulty('EASY'));
        $this->assertFalse(Validation::difficulty(''));
    }

    public function testYoutubeIdVectors(): void
    {
        // Canonical 11-char id passes through untouched.
        $this->assertSame('MWo42SO1aOM', Validation::youtubeId('MWo42SO1aOM'));

        // Too short.
        $this->assertSame('', Validation::youtubeId('short'));

        // Surrounding whitespace is trimmed away, inner whitespace stripped.
        $this->assertSame('MWo42SO1aOM', Validation::youtubeId(' MWo42SO1aOM '));

        // Scheme-like garbage and illegal characters are rejected outright.
        $this->assertSame('', Validation::youtubeId('javascript:al!'));

        // Non-ASCII letters fail the [A-Za-z0-9_-] class even at length 11.
        $this->assertSame('', Validation::youtubeId('MWo42SO1áOM'));
    }

    public function testTextAndTruncateAreMultibyteSafe(): void
    {
        // Accented characters count as one character each via mb_substr.
        $this->assertSame('áéíóú', Validation::text('  áéíóú  ', 10));
        $this->assertSame('ácc', Validation::truncate('áccents', 3));

        // Cutting mid-string never splits a multibyte character in half.
        $this->assertSame('áé', Validation::truncate('áéíóú', 2));

        // Degenerate limits collapse to the empty string.
        $this->assertSame('', Validation::truncate('hello', 0));
        $this->assertSame('', Validation::truncate('hello', -3));
    }
}