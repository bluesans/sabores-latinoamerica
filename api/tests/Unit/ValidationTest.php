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
}