import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnimatedNumber } from './AnimatedNumber';

describe('motion', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('con reduced-motion escribe el valor sin animación', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
      onchange: null,
    }));
    render(<AnimatedNumber value={57} />);
    expect(screen.getByText('57')).toBeInTheDocument();
  });
});
