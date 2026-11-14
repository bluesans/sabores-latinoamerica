import { expect, test } from '@playwright/test';
import { expectNoAxeViolations } from './axe';

const adminUser = process.env.E2E_ADMIN_USER;
const adminPass = process.env.E2E_ADMIN_PASS;

test.skip(
  !adminUser || !adminPass,
  'Requiere E2E_ADMIN_USER y E2E_ADMIN_PASS sembrados por el operador.',
);

test('admin: 4 solapas, guardado sin reload y dirty-guard', async ({ page }) => {
  await page.goto('/sabores-latinoamerica/');
  await page.getByLabel('Usuario').fill(adminUser ?? '');
  await page.getByLabel('Contraseña', { exact: true }).fill(adminPass ?? '');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: /El mapa del sabor/ })).toBeVisible();
  await page.goto('/sabores-latinoamerica/admin');
  await expect(page.getByRole('heading', { name: 'Administración' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Recetas' })).toBeVisible();
  await expectNoAxeViolations(page);

  await page.getByRole('tab', { name: 'Recetas' }).click();
  await page.getByRole('button', { name: '＋ Nueva receta' }).click();
  await page.getByLabel('Nombre').fill('Receta QA Playwright');
  await page.getByLabel('Descripción').fill('Temporal, se elimina al final.');
  await page.getByLabel('Minutos').fill('15');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Receta QA Playwright')).toBeVisible();

  await page.locator('.adm-row', { hasText: 'Receta QA Playwright' }).getByTitle('Editar').click();
  await page.getByLabel('Nombre').fill('Receta QA editada');
  await page.getByRole('link', { name: '← Volver al mapa' }).click();
  await expect(page.getByRole('dialog', { name: 'Cambios sin guardar' })).toBeVisible();
  await page.getByRole('button', { name: 'Seguir editando' }).click();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Receta QA editada')).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('.adm-row', { hasText: 'Receta QA editada' }).getByTitle('Eliminar').click();
  await expect(page.getByText('Receta QA editada')).toHaveCount(0);
});
