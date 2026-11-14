import { expect, test } from '@playwright/test';
import { loginViaApi } from './helpers';

test.beforeEach(async ({ request, context }) => {
  const cookies = await loginViaApi(request);
  await context.addCookies(cookies);
});

test('banner: rechazo persiste y a los 6 meses vuelve a preguntar', async ({ page }) => {
  await page.goto('/sabores-latinoamerica/');
  const banner = page.getByRole('region', { name: 'Preferencias de cookies' });
  await expect(banner).toBeVisible();
  const reject = banner.getByRole('button', { name: 'Rechazar' });
  const accept = banner.getByRole('button', { name: 'Aceptar todas' });
  await expect(reject).toHaveClass(/cookie-btn/);
  await expect(accept).toHaveClass(/cookie-btn/);

  await reject.click();
  await expect(banner).toBeHidden();
  await page.reload();
  await expect(banner).toBeHidden();

  await page.evaluate(() => {
    const raw = localStorage.getItem('sdl_consent');
    if (!raw) return;
    const record = JSON.parse(raw) as { timestamp: number };
    record.timestamp = Date.now() - 1000 * 60 * 60 * 24 * 200;
    localStorage.setItem('sdl_consent', JSON.stringify(record));
  });
  await page.reload();
  await expect(banner).toBeVisible();
  await accept.click();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('sdl_consent') ?? '{}'));
  expect(stored.categories.thirdParty).toBe(true);
});
