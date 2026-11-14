import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { ConsentProvider } from '../consent/ConsentContext';
import { VideoGate } from './VideoGate';

describe('video consent-gated', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('sin consentimiento no renderiza iframe y ofrece activar', () => {
    render(
      <MemoryRouter>
        <ConsentProvider>
          <VideoGate youtubeId="MWo42SO1aOM" name="Tacos" />
        </ConsentProvider>
      </MemoryRouter>,
    );
    expect(screen.queryByTitle(/Video de la receta/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Activar videos' })).toBeInTheDocument();
  });

  it('con consentimiento carga youtube-nocookie solo al hacer clic', async () => {
    localStorage.setItem(
      'sdl_consent',
      JSON.stringify({
        version: '2026-11',
        timestamp: Date.now(),
        categories: { necessary: true, functional: true, thirdParty: true },
      }),
    );
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ConsentProvider>
          <VideoGate youtubeId="MWo42SO1aOM" name="Tacos" />
        </ConsentProvider>
      </MemoryRouter>,
    );
    expect(screen.queryByTitle(/Video de la receta/)).toBeNull();
    await user.click(screen.getByRole('button', { name: /Reproducir video de Tacos/ }));
    const iframe = screen.getByTitle('Video de la receta Tacos');
    expect(iframe).toHaveAttribute(
      'src',
      expect.stringContaining('youtube-nocookie.com/embed/MWo42SO1aOM'),
    );
  });

  it('un ID inválido no renderiza video', () => {
    render(
      <MemoryRouter>
        <ConsentProvider>
          <VideoGate youtubeId="javascript:alert(1)" name="Malicioso" />
        </ConsentProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText(/El video de esta receta llega pronto/)).toBeInTheDocument();
  });
});
