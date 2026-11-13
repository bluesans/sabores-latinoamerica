-- 003_consents.sql — consentimiento y edad (aditiva, retrocompatible)
--
-- Agrega columnas NULL a users (las filas existentes quedan NULL) y extiende
-- el enum de login_attempts para el throttle de DELETE /auth/account.
-- Forward-only: no editar 000/001/002 ni re-aplicar este archivo.
-- Si una aplicación quedó a mitad de camino (el primer ALTER commitea y el
-- segundo falla), recuperar con:
--   ALTER TABLE users DROP COLUMN consent_version, DROP COLUMN consented_at,
--     DROP COLUMN age_confirmed;
-- y volver a aplicar.

ALTER TABLE `users`
  ADD COLUMN `consent_version` VARCHAR(20) NULL AFTER `role`,
  ADD COLUMN `consented_at` DATETIME NULL AFTER `consent_version`,
  ADD COLUMN `age_confirmed` TINYINT(1) NULL AFTER `consented_at`;

ALTER TABLE `login_attempts`
  MODIFY COLUMN `action` ENUM('login','register','refresh','delete') NOT NULL DEFAULT 'login';
