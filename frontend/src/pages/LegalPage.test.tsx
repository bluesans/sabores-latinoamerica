import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { OWNER } from '../content/legal/pages';
import { LegalIndexPage, LegalPage } from './LegalPage';

describe('páginas legales', () => {
  it('privacidad muestra datos, retención y aviso de revisión', () => {
    render(
      <MemoryRouter>
        <LegalPage slug="privacidad" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Política de privacidad' })).toBeInTheDocument();
    expect(screen.getByText(/Pendiente de revisión profesional/)).toBeInTheDocument();
    expect(screen.getByText(/hash bcrypt/)).toBeInTheDocument();
    expect(screen.getAllByText(OWNER.name).length).toBeGreaterThan(0);
    expect(screen.getAllByText(OWNER.email).length).toBeGreaterThan(0);
    expect(screen.getAllByText(OWNER.jurisdiction).length).toBeGreaterThan(0);
    expect(screen.getAllByText(OWNER.address).length).toBeGreaterThan(0);
  });

  it('cookies enumera las categorías reales y no promete analítica', () => {
    render(
      <MemoryRouter>
        <LegalPage slug="cookies" />
      </MemoryRouter>,
    );
    expect(screen.getByText('sdl_refresh')).toBeInTheDocument();
    expect(screen.getByText('sdl_consent')).toBeInTheDocument();
    expect(screen.getByText(/No usamos cookies publicitarias/)).toBeInTheDocument();
  });

  it('el índice enlaza los seis documentos', () => {
    render(
      <MemoryRouter>
        <LegalIndexPage />
      </MemoryRouter>,
    );
    for (const name of [
      'Privacidad',
      'Términos',
      'Cookies',
      'Reembolsos',
      'Licencias',
      'Contacto',
    ]) {
      expect(screen.getByRole('link', { name: new RegExp(name) })).toBeInTheDocument();
    }
  });

  it('un slug desconocido cae en 404', () => {
    render(
      <MemoryRouter>
        <LegalPage slug="no-existe" />
      </MemoryRouter>,
    );
    expect(screen.getByText(/404 — Esta receta no existe/)).toBeInTheDocument();
  });
});
