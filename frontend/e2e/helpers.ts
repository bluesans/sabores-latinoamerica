import { readFileSync } from 'node:fs';
import { type APIRequestContext, expect } from '@playwright/test';

export const API_BASE = process.env.E2E_API_BASE ?? 'http://localhost/sabores-latinoamerica/api';

export const E2E_USER = JSON.parse(readFileSync('.e2e-user.json', 'utf8')) as {
  username: string;
  password: string;
};

export async function loginViaApi(
  request: APIRequestContext,
): Promise<Awaited<ReturnType<APIRequestContext['storageState']>>['cookies']> {
  const response = await request.post(`${API_BASE}/auth/login`, {
    data: { username: E2E_USER.username, password: E2E_USER.password },
  });
  expect(response.ok(), `login e2e ${response.status()}: ${await response.text()}`).toBeTruthy();
  const state = await request.storageState();
  return state.cookies;
}
