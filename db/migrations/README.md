# db/migrations

Forward-only SQL migrations for `sabores_latinoamerica`.

## Convention

- `000_install.sql` is the canonical baseline: full schema + reference seed data.
  It targets an **empty** database and intentionally fails on re-import
  (`ERROR 1050` table-exists) rather than silently mutating an existing install.
- Later changes are **new numbered files** (`001_*.sql`, `002_*.sql`, ...).
  Never edit a migration after it has been applied anywhere; write a new one.
- Apply manually until the project adopts a runner:

```
mysql -u root -p --default-character-set=utf8mb4 sabores_latinoamerica < db/migrations/00X_name.sql
```

- Seed content (countries/recipes/ingredients) lives ONLY in the baseline.
  Migrations must not rewrite seed text.
