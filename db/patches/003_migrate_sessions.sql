USE `sabores_latinoamerica`;

-- Ahora los refresh tokens se guardan hasheados.
-- Las sesiones viejas en texto plano ya no sirven.
DELETE FROM `sessions`;

-- Limpio intentos viejos de login.
DELETE FROM `login_attempts`;