-- 002_attempt_refresh_action: allow action='refresh' in login_attempts so
-- failed/unknown-token refresh attempts can be throttled per IP.
-- Forward-only (see db/migrations/README.md): never edit after applying.
ALTER TABLE login_attempts MODIFY action ENUM('login','register','refresh') NOT NULL DEFAULT 'login';
