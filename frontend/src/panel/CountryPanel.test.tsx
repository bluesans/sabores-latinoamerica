import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsentProvider } from '../consent/ConsentContext';
import { ToastProvider } from '../ui/ToastProvider';
import { CountryPanel } from './CountryPanel';
import { IngredientModalProvider } from './IngredientModal';

const mocks = vi.hoisted(() => ({
  countryRecipes: vi.fn(),
  favorites: vi.fn(),
  toggleFavorite: vi.fn(),
}));

vi.mock('../api/client', () => ({ api: mocks }));

describe('panel de país', () => {
  beforeEach(() => {
    mocks.countryRecipes.mockResolvedValue({
      country: { id: 1, name: 'México', emoji: '🇲🇽', tagline: 'Cocina mestiza' },
      recipes: [
        {
          id: 1,
          name: 'Tacos al Pastor',
          description: 'Tacos',
          difficulty: 'medium',
          time_minutes: 120,
          youtube_id: null,
          ingredients: [{ id: 6, name: 'Cebolla' }],
        },
      ],
      pagination: { page: 1, per_page: 12, total: 1, total_pages: 1 },
    });
    mocks.favorites.mockResolvedValue({ favorites: [] });
    mocks.toggleFavorite.mockResolvedValue({ ok: true });
  });

  function renderPanel(onClose = vi.fn()) {
    const opener = document.createElement('button');
    opener.textContent = 'abridor';
    document.body.appendChild(opener);
    opener.focus();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const view = render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <ConsentProvider>
            <ToastProvider>
              <IngredientModalProvider>
                <CountryPanel
                  countryId={1}
                  focusRecipeId={null}
                  opener={opener}
                  onClose={onClose}
                />
              </IngredientModalProvider>
            </ToastProvider>
          </ConsentProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    return { ...view, opener, onClose };
  }

  it('carga el país, enfoca el cierre y Escape cierra', async () => {
    const user = userEvent.setup();
    const { onClose } = renderPanel();
    expect(await screen.findByRole('heading', { name: 'México' })).toBeInTheDocument();
    expect(screen.getByText('Tacos al Pastor')).toBeInTheDocument();
    const panel = screen.getByRole('complementary', { name: 'Recetas del país' });
    const close = within(panel).getByRole('button', { name: 'Cerrar panel' });
    await waitFor(() => expect(close).toHaveFocus());
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('al desmontarse devuelve el foco al abridor', async () => {
    const { unmount, opener } = renderPanel();
    await screen.findByRole('heading', { name: 'México' });
    unmount();
    expect(opener).toHaveFocus();
  });

  it('togglea favorito contra la API', async () => {
    const user = userEvent.setup();
    renderPanel();
    const favorite = await screen.findByRole('button', {
      name: 'Guardar Tacos al Pastor en favoritos',
    });
    await user.click(favorite);
    expect(mocks.toggleFavorite).toHaveBeenCalledWith(1, true);
  });
});
