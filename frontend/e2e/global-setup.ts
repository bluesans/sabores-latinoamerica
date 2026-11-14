import { writeFileSync } from 'node:fs';
import { request } from '@playwright/test';

export const E2E_PASSWORD = 'Prueba12345';

export default async function globalSetup() {
  const suffix = Date.now().toString(36);
  const username = `e2e_${suffix}`;
  const api = await request.newContext({
    baseURL: process.env.E2E_API_BASE ?? 'http://localhost/sabores-latinoamerica/api',
  });
  const response = await api.post(
    `${process.env.E2E_API_BASE ?? 'http://localhost/sabores-latinoamerica/api'}/auth/register`,
    {
      data: {
        username,
        password: E2E_PASSWORD,
        accept_terms: true,
        accept_privacy: true,
        age_confirmed: true,
      },
    },
  );
  if (!response.ok()) {
    throw new Error(
      `No se pudo sembrar el usuario e2e: ${response.status()} ${await response.text()}`,
    );
  }
  const state = await api.storageState();
  writeFileSync('.e2e-user.json', JSON.stringify({ username, password: E2E_PASSWORD }, null, 2));
  await api.dispose();
}
