# Parity report — F1 gate (todo 22)

**Fecha**: 2026-11-13
**Backend**: Node/Fastify en `http://127.0.0.1:3001/sabores-latinoamerica/api`
**Matriz**: `backend/tests/fixtures/diff.mjs --diff` (50 fixtures doradas)
**Resultado**: **50/50 idénticas, exit 0**

## Alcance

| Área | Casos |
|---|---|
| Auth | register, login, logout, refresh, reuse detection, check, delete account, rate limits |
| Recursos | countries, recipes paginadas/fuera de rango, stats, ingredients, search (q corta/larga/wildcards) |
| Favoritos | GET, toggle on/off, doble toggle |
| Admin | data, recipe create/update/delete, country update, ingredient rename/delete, sessions/revoke, guards 401/403 |
| HTTP | CORS, OPTIONS, 404/405 sin Allow, envelope global, content-type/charset, cookies |

## Excepciones permitidas

Solo headers volátiles normalizados por el harness: `Server`, `X-Powered-By` y `Date`.
No se excluyeron bodies, campos ni endpoints. Las fixtures no se editaron.

## Entorno

La viva tenía una sesión real del usuario `hola` (creada durante QA manual) que hacía
que `admin_sessions_ok` esperara 4 filas y recibiera 5. Para no borrar datos reales,
el gate se corrió contra un clon `sabores_parity` de la base viva (mismo esquema y seed,
sin ese usuario preexistente), con `backend/.env` y `api/.env` apuntando al clon durante
la corrida. Al terminar se restauraron ambos `.env`, se detuvo Node y se dropeó el clon.

## Suite

```
npm test        -> 291 passed | 0 todo | 0 failed (27 archivos)
grep it.todo    -> 0
```

## Reproducción

```powershell
# servidor Node contra la DB de paridad
cd backend
node --import tsx src/server.ts
npm run test:fixtures -- --diff
```
