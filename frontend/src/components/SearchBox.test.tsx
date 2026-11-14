import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IngredientModalProvider } from '../panel/IngredientModal';
import { SearchBox } from './SearchBox';

function response(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

describe('buscador', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
      response({ ok: true, countries: [], recipes: [], ingredients: [] }),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('no hace request con menos de 2 caracteres y sí con 2', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <IngredientModalProvider>
          <SearchBox />
        </IngredientModalProvider>
      </MemoryRouter>,
    );
    const input = screen.getByRole('combobox', { name: 'Buscar' });
    await user.type(input, 'a');
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(fetchMock).not.toHaveBeenCalled();

    await user.type(input, 'r');
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/search?q=ar');
    expect(await screen.findByText('Sin resultados 🤷')).toBeInTheDocument();
  });
});
