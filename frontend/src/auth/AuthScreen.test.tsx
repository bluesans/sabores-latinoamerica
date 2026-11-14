import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import { AuthProvider } from '../auth/AuthContext';
import { AuthScreen } from '../auth/AuthScreen';
import { ToastProvider } from '../ui/ToastProvider';

function response(body: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    json: async () => body,
  } as Response;
}

describe('pantalla de auth', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    api.setAccess(null);
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) {
        return response({ ok: false, error: 'La sesión expiró.' }, 401);
      }
      if (url.endsWith('/auth/register')) {
        return response({
          ok: true,
          username: 'nueva_persona',
          role: 'user',
          access: 'a'.repeat(64),
        });
      }
      if (url.endsWith('/auth/login')) {
        return response({
          ok: true,
          username: 'nueva_persona',
          role: 'user',
          access: 'a'.repeat(64),
        });
      }
      return response({ ok: false, error: 'no mockeado' }, 500);
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function renderScreen() {
    return render(
      <MemoryRouter>
        <AuthProvider>
          <ToastProvider>
            <AuthScreen />
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>,
    );
  }

  it('no envía el registro si faltan los consentimientos', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByRole('tab', { name: 'Crear cuenta' }));
    await user.type(screen.getByLabelText('Usuario'), 'nueva_persona');
    await user.type(screen.getByLabelText('Contraseña'), 'Prueba12345');
    await user.type(screen.getByLabelText('Repetí la contraseña'), 'Prueba12345');
    await user.click(screen.getByRole('button', { name: 'Crear cuenta y entrar' }));

    expect(
      screen.getByText(/Para crear la cuenta tenés que aceptar los términos/),
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/auth/register'))).toBe(
      false,
    );
  });

  it('con los tres checks envía consentimientos true y entra', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByRole('tab', { name: 'Crear cuenta' }));
    await user.type(screen.getByLabelText('Usuario'), 'nueva_persona');
    await user.type(screen.getByLabelText('Contraseña'), 'Prueba12345');
    await user.type(screen.getByLabelText('Repetí la contraseña'), 'Prueba12345');
    const checks = screen.getAllByRole('checkbox');
    expect(checks).toHaveLength(3);
    for (const check of checks) await user.click(check);
    await user.click(screen.getByRole('button', { name: 'Crear cuenta y entrar' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/auth/register'));
      expect(call).toBeTruthy();
      const body = JSON.parse(String((call?.[1] as RequestInit | undefined)?.body));
      expect(body).toMatchObject({
        username: 'nueva_persona',
        accept_terms: true,
        accept_privacy: true,
        age_confirmed: true,
      });
    });
  });

  it('muestra el error de credenciales del servidor', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) return response({ ok: false }, 401);
      if (url.endsWith('/auth/login')) {
        return response({ ok: false, error: 'Usuario o contraseña incorrectos.' }, 401);
      }
      return response({ ok: false }, 500);
    });
    const user = userEvent.setup();
    renderScreen();
    await user.type(screen.getByLabelText('Usuario'), 'nueva_persona');
    await user.type(screen.getByLabelText('Contraseña'), 'Prueba12345');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText('Usuario o contraseña incorrectos.')).toBeInTheDocument();
  });
});
