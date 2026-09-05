-- 001_sessions_ip_ua: session metadata for the admin sessions panel.
-- Forward-only (see db/migrations/README.md): never edit after applying.
ALTER TABLE sessions ADD COLUMN ip VARCHAR(45) NULL, ADD COLUMN user_agent VARCHAR(255) NULL;
