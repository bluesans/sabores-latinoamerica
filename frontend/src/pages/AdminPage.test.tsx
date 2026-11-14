import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../ui/ToastProvider';
import { AdminPage } from './AdminPage';

const mocks = vi.hoisted(() => ({
  adminData: vi.fn(),
  adminSessions: vi.fn(),
  adminSaveRecipe: vi.fn(),
  adminDeleteRecipe: vi.fn(),
  adminSaveCountry: vi.fn(),
  adminRenameIngredient: vi.fn(),
  adminDeleteIngredient: vi.fn(),
  adminRevokeSession: vi.fn(),
}));

vi.mock('../api/client', () => ({ api: mocks }));
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { username: 'admin', role: 'admin' } }),
}));

const data = {
  recipes: [
    {
      id: 1,
      country_id: 1,
      country_name: 'México',
      name: 'Tacos al Pastor',
      description: 'Tacos',
      difficulty: 'medium',
      time_minutes: 120,
      youtube_id: null,
      ingredients: ['Cebolla'],
    },
  ],
  countries: [{ id: 1, name: 'México', emoji: '🇲🇽', tagline: 'Cocina mestiza' }],
  ingredients: [{ id: 6, name: 'Cebolla', uses: 1 }],
};

describe('admin', () => {
  beforeEach(() => {
    mocks.adminData.mockResolvedValue(data);
    mocks.adminSessions.mockResolvedValue({ sessions: [] });
  });

  it('dirty-guard: navegar con cambios pide confirmación in-app', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        { path: '/admin', element: <AdminPage /> },
        { path: '/', element: <div>Mapa</div> },
      ],
      { initialEntries: ['/admin'] },
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Administración' })).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: '＋ Nueva receta' }));
    await user.type(screen.getByLabelText('Nombre'), 'Receta sin guardar');
    await user.click(screen.getByRole('link', { name: '← Volver al mapa' }));

    const dialog = await screen.findByRole('dialog', { name: 'Cambios sin guardar' });
    expect(dialog).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(screen.getByRole('heading', { name: 'Administración' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: '← Volver al mapa' }));
    await user.click(await screen.findByRole('button', { name: 'Descartar y salir' }));
    expect(await screen.findByText('Mapa')).toBeInTheDocument();
  });
});
