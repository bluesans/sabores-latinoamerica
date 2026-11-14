import { expect, test } from '@playwright/test';
import { API_BASE } from './helpers';

const password = 'Prueba12345';
const username = `e2e_del_${Date.now().toString(36)}`;

test.beforeEach(async ({ request, context }) => {
  const registered = await request.post(`${API_BASE}/auth/register`, {
    data: {
      username,
      password,
      accept_terms: true,
      accept_privacy: true,
      age_confirmed: true,
    },
  });
  expect(registered.ok(), `register: ${registered.status()}`).toBeTruthy();
  const state = await request.storageState();
  await context.addCookies(state.cookies);
});

test('borrado de cuenta: password incorrecta y luego baja real', async ({ page }) => {
  await page.goto('/sabores-latinoamerica/');
  await page.getByRole('button', { name: 'Mi cuenta' }).click();
  const dialog = page.getByRole('dialog', { name: 'Eliminar cuenta' });
  await dialog.getByLabel('Contraseña actual').fill('clave-incorrecta');
  await dialog.getByRole('button', { name: 'Eliminar cuenta' }).click();
  await expect(dialog.getByText('Contraseña incorrecta.')).toBeVisible();

  await dialog.getByLabel('Contraseña actual').fill(password);
  await dialog.getByRole('button', { name: 'Eliminar cuenta' }).click();
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  await page.goto('/sabores-latinoamerica/');
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
});
