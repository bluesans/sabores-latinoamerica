import { expect, test } from '@playwright/test';
import { expectNoAxeViolations } from './axe';

test.use({ storageState: { cookies: [], origins: [] } });

const password = 'Prueba12345';
const username = `e2e_ui_${Date.now().toString(36)}`;

test.afterAll(async ({ request }) => {
  const login = await request.post('/sabores-latinoamerica/api/auth/login', {
    data: { username, password },
  });
  if (!login.ok()) return;
  const body = (await login.json()) as { access?: string };
  if (!body.access) return;
  await request.delete('/sabores-latinoamerica/api/auth/account', {
    data: { password },
    headers: { Authorization: `Bearer ${body.access}` },
  });
});

test('registro: sin consentimientos no envía y con ellos entra al mapa', async ({ page }) => {
  let registerRequests = 0;
  page.on('request', (request) => {
    if (request.url().includes('/auth/register')) registerRequests += 1;
  });

  await page.goto('/sabores-latinoamerica/');
  await expectNoAxeViolations(page);
  await page.getByRole('tab', { name: 'Crear cuenta' }).click();
  await page.getByLabel('Usuario').fill(username);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByLabel('Repetí la contraseña').fill(password);
  await page.getByRole('button', { name: 'Crear cuenta y entrar' }).click();
  await expect(page.getByText(/tenés que aceptar los términos/)).toBeVisible();
  expect(registerRequests).toBe(0);

  const checks = page.getByRole('checkbox');
  await expect(checks).toHaveCount(3);
  for (let index = 0; index < 3; index += 1) await checks.nth(index).check();
  await page.getByRole('button', { name: 'Crear cuenta y entrar' }).click();
  await expect(page.getByRole('heading', { name: /El mapa del sabor/ })).toBeVisible();
  expect(registerRequests).toBe(1);
});

test('login incorrecto muestra el error del servidor', async ({ page }) => {
  await page.goto('/sabores-latinoamerica/');
  await page.getByLabel('Usuario').fill(username);
  await page.getByLabel('Contraseña', { exact: true }).fill('clave-incorrecta');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('Usuario o contraseña incorrectos.')).toBeVisible();
});
