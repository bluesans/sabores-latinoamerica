import { expect, test } from '@playwright/test';
import { expectNoAxeViolations } from './axe';
import { loginViaApi } from './helpers';

test.describe.configure({ mode: 'serial' });

const REJECTED = JSON.stringify({
  version: '2026-11',
  timestamp: Date.now(),
  categories: { necessary: true, functional: false, thirdParty: false },
});

test.beforeEach(async ({ page, request, context }) => {
  const cookies = await loginViaApi(request);
  await context.addCookies(cookies);
  await page.addInitScript((value) => {
    if (!localStorage.getItem('sdl_consent')) localStorage.setItem('sdl_consent', value);
  }, REJECTED);
});

test('home, axe y responsive 360/768/1440', async ({ page }) => {
  await page.goto('/sabores-latinoamerica/');
  await expect(page.getByRole('heading', { name: /El mapa del sabor/ })).toBeVisible();
  await expect(page.getByText(/Mapa HD/)).toBeVisible();
  await expect(page.getByText(/\d+ países · \d+ recetas/)).toBeVisible();
  await expect(page.locator('.country.has-data').first()).toBeVisible();
  await expectNoAxeViolations(page);

  for (const [width, height] of [
    [360, 800],
    [768, 1024],
    [1440, 900],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto('/sabores-latinoamerica/');
    await expect(page.getByRole('heading', { name: /El mapa del sabor/ })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `overflow horizontal a ${width}px`).toBeLessThanOrEqual(1);
    await expectNoAxeViolations(page);
  }
});

test('teclado, búsqueda, favorito y video consent-gated', async ({ page }) => {
  const youtubeRequests: string[] = [];
  page.on('request', (request) => {
    if (/youtube|ytimg/i.test(request.url())) youtubeRequests.push(request.url());
  });

  await page.goto('/sabores-latinoamerica/');
  const countries = page.locator('.country');
  const beforeZoom = await page.locator('.map-svg > g').getAttribute('transform');
  await page.mouse.move(500, 500);
  await page.mouse.wheel(0, -300);
  await expect
    .poll(() => page.locator('.map-svg > g').getAttribute('transform'))
    .not.toBe(beforeZoom);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  await countries.first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(countries.nth(1)).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(countries.nth(2)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/pais\/\d+/);
  await expect(page.getByRole('complementary', { name: 'Recetas del país' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).not.toHaveURL(/\/pais\//);
  await expect(countries.nth(2)).toBeFocused();

  await page.getByRole('combobox', { name: 'Buscar' }).fill('ta');
  const result = page.getByRole('option', { name: /Tacos al Pastor/ });
  await expect(result).toBeVisible();
  await result.click();
  await expect(page).toHaveURL(/\/pais\/1\?receta=1/);
  const panel = page.getByRole('complementary', { name: 'Recetas del país' });
  await expect(panel.getByRole('heading', { name: 'Tacos al Pastor' })).toBeVisible();
  await panel.getByRole('button', { name: 'Guardar Tacos al Pastor en favoritos' }).click();
  await expect(page.getByRole('link', { name: /1 favoritos/ })).toBeVisible();

  await panel.getByRole('button', { name: 'Achiote' }).click();
  const ingredientDialog = page.getByRole('dialog', { name: 'Recetas con este ingrediente' });
  await expect(ingredientDialog).toBeVisible();
  await expect(ingredientDialog.getByRole('heading', { name: /Achiote/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(ingredientDialog).toBeHidden();
  await expect(panel.getByRole('button', { name: 'Achiote' })).toBeFocused();

  expect(youtubeRequests).toEqual([]);
  await panel.getByRole('button', { name: 'Activar videos' }).first().click();
  await page.getByRole('button', { name: 'Aceptar todas' }).click();
  expect(youtubeRequests).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await page.getByRole('link', { name: /1 favoritos/ }).click();
  await expect(page.getByRole('complementary', { name: 'Mis favoritos' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Tacos al Pastor/ })).toBeVisible();

  await page.goto('/sabores-latinoamerica/pais/1?receta=1');
  await expect(panel.getByRole('heading', { name: 'Tacos al Pastor' })).toBeVisible();
  await panel.getByRole('button', { name: /Reproducir video de Tacos al Pastor/ }).click();
  await expect(panel.locator('iframe[src*="youtube-nocookie.com/embed/"]')).toBeVisible();
});

test('legales, 404, admin restringido y axe por página', async ({ page }) => {
  const legal = [
    ['privacidad', 'Política de privacidad'],
    ['terminos', 'Términos de uso'],
    ['reembolsos', 'Reembolsos'],
    ['cookies', 'Política de cookies'],
    ['contacto', 'Contacto'],
    ['licencias', 'Licencias y créditos'],
  ] as const;
  for (const [route, heading] of legal) {
    await page.goto(`/sabores-latinoamerica/${route}`);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await expect(page.getByText(/Pendiente de revisión profesional/)).toBeVisible();
    await expectNoAxeViolations(page);
  }

  await page.goto('/sabores-latinoamerica/cookies');
  await expect(page.getByRole('table')).toContainText('sdl_refresh');

  await page.goto('/sabores-latinoamerica/ruta-que-no-existe');
  await expect(page.getByRole('heading', { name: /404/ })).toBeVisible();

  await page.goto('/sabores-latinoamerica/admin');
  await expect(page.getByText(/Solo las personas administradoras/)).toBeVisible();
  await expect(page.getByText('ABM de recetas')).toHaveCount(0);
  await expectNoAxeViolations(page);
});
