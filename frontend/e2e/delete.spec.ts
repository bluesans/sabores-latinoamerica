import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { loginViaApi } from './helpers';

const user = JSON.parse(readFileSync('.e2e-user.json', 'utf8')) as { password: string };

test.beforeEach(async ({ request, context }) => {
  const cookies = await loginViaApi(request);
  await context.addCookies(cookies);
});

test('borrado de cuenta: password incorrecta y luego baja real', async ({ page }) => {
  await page.goto('/sabores-latinoamerica/');
  await page.getByRole('button', { name: 'Mi cuenta' }).click();
  const dialog = page.getByRole('dialog', { name: 'Eliminar cuenta' });
  await dialog.getByLabel('Contraseña actual').fill('clave-incorrecta');
  await dialog.getByRole('button', { name: 'Eliminar cuenta' }).click();
  await expect(dialog.getByText('Contraseña incorrecta.')).toBeVisible();

  await dialog.getByLabel('Contraseña actual').fill(user.password);
  await dialog.getByRole('button', { name: 'Eliminar cuenta' }).click();
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  await page.goto('/sabores-latinoamerica/');
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
});
