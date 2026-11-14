import { describe, expect, it } from 'vitest';
import { formatTime, safeYoutubeId, USERNAME_PATTERN } from './format';

describe('formato', () => {
  it('formatea minutos como el v1', () => {
    expect(formatTime(45)).toBe('45 min');
    expect(formatTime(60)).toBe('1 h');
    expect(formatTime(90)).toBe('1 h 30 min');
    expect(formatTime(0)).toBe('0 min');
    expect(formatTime(null as unknown as number)).toBe('—');
    expect(formatTime(Number.NaN)).toBe('—');
  });

  it('solo acepta IDs de YouTube de 11 caracteres seguros', () => {
    expect(safeYoutubeId('MWo42SO1aOM')).toBe('MWo42SO1aOM');
    expect(safeYoutubeId(' MWo42SO1aOM ')).toBe('MWo42SO1aOM');
    expect(safeYoutubeId('javascript:alert(1)')).toBe('');
    expect(safeYoutubeId('corto')).toBe('');
    expect(safeYoutubeId(null)).toBe('');
  });

  it('valida usuarios con el mismo patrón que el backend', () => {
    expect(USERNAME_PATTERN.test('chef_querubin')).toBe(true);
    expect(USERNAME_PATTERN.test('ñoño_123')).toBe(true);
    expect(USERNAME_PATTERN.test('ab')).toBe(false);
    expect(USERNAME_PATTERN.test('con espacio')).toBe(false);
    expect(USERNAME_PATTERN.test('a'.repeat(31))).toBe(false);
  });
});
