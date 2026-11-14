import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IngredientModalProvider, useIngredientModal } from './IngredientModal';

const mocks = vi.hoisted(() => ({ ingredient: vi.fn() }));

vi.mock('../api/client', () => ({ api: mocks }));

function Trigger() {
  const { openIngredient } = useIngredientModal();
  return (
    <button type="button" onClick={() => openIngredient(6)}>
      Abrir ingrediente
    </button>
  );
}

describe('modal de ingrediente', () => {
  beforeEach(() => {
    mocks.ingredient.mockResolvedValue({
      ingredient: { id: 6, name: 'Cebolla' },
      recipes: [
        {
          recipe_id: 1,
          recipe_name: 'Tacos al Pastor',
          difficulty: 'medium',
          country_id: 1,
          country_name: 'México',
          emoji: '🇲🇽',
        },
      ],
    });
  });

  it('abre, atrapa el foco, Escape cierra y vuelve al disparador', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <IngredientModalProvider>
          <Trigger />
        </IngredientModalProvider>
      </MemoryRouter>,
    );
    const trigger = screen.getByRole('button', { name: 'Abrir ingrediente' });
    await user.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Recetas con este ingrediente' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '🧺 Cebolla' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveFocus());

    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: /Tacos al Pastor/ })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger).toHaveFocus();
  });
});
