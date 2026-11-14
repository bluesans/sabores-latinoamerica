import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { CookieBanner } from '../components/CookieBanner';
import { CONSENT_VERSION, ConsentProvider, readConsent } from './ConsentContext';

function record(overrides: Record<string, unknown> = {}) {
  return {
    version: CONSENT_VERSION,
    timestamp: Date.now(),
    categories: { necessary: true, functional: false, thirdParty: false },
    ...overrides,
  };
}

describe('consentimiento de cookies', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('lee un consentimiento válido y descarta versión vieja o vencida', () => {
    localStorage.setItem('sdl_consent', JSON.stringify(record()));
    expect(readConsent()?.categories.necessary).toBe(true);

    localStorage.setItem('sdl_consent', JSON.stringify(record({ version: '2020-01' })));
    expect(readConsent()).toBeNull();

    localStorage.setItem(
      'sdl_consent',
      JSON.stringify(record({ timestamp: Date.now() - 1000 * 60 * 60 * 24 * 200 })),
    );
    expect(readConsent()).toBeNull();

    localStorage.setItem('sdl_consent', '{roto');
    expect(readConsent()).toBeNull();
  });

  it('rechazar persiste la decisión y quita el banner', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ConsentProvider>
          <CookieBanner />
        </ConsentProvider>
      </MemoryRouter>,
    );

    const banner = screen.getByRole('region', { name: 'Preferencias de cookies' });
    expect(banner).toBeInTheDocument();
    const reject = screen.getByRole('button', { name: 'Rechazar' });
    const accept = screen.getByRole('button', { name: 'Aceptar todas' });
    expect(reject.className).toBe(accept.className);

    await user.click(reject);
    expect(screen.queryByRole('region', { name: 'Preferencias de cookies' })).toBeNull();
    const stored = readConsent();
    expect(stored?.categories.thirdParty).toBe(false);
    expect(stored?.categories.functional).toBe(false);
  });

  it('aceptar habilita terceros y persiste timestamp', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ConsentProvider>
          <CookieBanner />
        </ConsentProvider>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: 'Aceptar todas' }));
    const stored = readConsent();
    expect(stored?.categories.thirdParty).toBe(true);
    expect(stored?.timestamp).toBeGreaterThan(Date.now() - 5000);
  });
});
