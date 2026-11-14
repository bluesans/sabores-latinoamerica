import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { request } from '@playwright/test';

export default async function globalTeardown() {
  const apiBase = process.env.E2E_API_BASE ?? 'http://localhost/sabores-latinoamerica/api';
  const api = await request.newContext({ baseURL: apiBase });
  try {
    const user = JSON.parse(readFileSync('.e2e-user.json', 'utf8')) as {
      username: string;
      password: string;
    };
    const login = await api.post(`${apiBase}/auth/login`, {
      data: { username: user.username, password: user.password },
    });
    if (login.ok()) {
      const body = (await login.json()) as { access?: string };
      if (body.access) {
        const deleted = await api.delete(`${apiBase}/auth/account`, {
          data: { password: user.password },
          headers: { Authorization: `Bearer ${body.access}` },
        });
        if (!deleted.ok()) {
          console.warn(`Cleanup e2e: no se pudo borrar ${user.username}: ${deleted.status()}`);
        }
      }
    }
  } catch (error) {
    console.warn('Cleanup e2e:', error instanceof Error ? error.message : error);
  } finally {
    await api.dispose();
    // La suite registra 3 usuarios por corrida; sin purgar los intentos, la
    // segunda corrida dentro de 15 min choca con el rate limit (5/15).
    try {
      const mysql = process.env.MYSQL_BIN ?? 'C:\\xampp\\mysql\\bin\\mysql.exe';
      const db = process.env.E2E_DB ?? 'sabores_latinoamerica';
      const args = ['-u', process.env.DB_USER ?? 'root'];
      if (process.env.DB_PASS) args.push(`-p${process.env.DB_PASS}`);
      args.push(db, '-e', "DELETE FROM login_attempts WHERE username LIKE 'e2e%' OR username = ''");
      execFileSync(mysql, args, { stdio: 'ignore' });
    } catch (error) {
      console.warn('Cleanup e2e rate-limit:', error instanceof Error ? error.message : error);
    }
    rmSync('.e2e-state.json', { force: true });
    rmSync('.e2e-user.json', { force: true });
  }
}
