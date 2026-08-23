USE `sabores_latinoamerica`;

-- --------------------------------------------------
-- sessions.revoked_at
-- Necesario para detectar reuso de refresh tokens.
-- --------------------------------------------------
SET @col_exists = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'sessions'
      AND COLUMN_NAME = 'revoked_at'
);

SET @ddl = IF(
    @col_exists = 0,
    'ALTER TABLE sessions ADD COLUMN revoked_at DATETIME NULL DEFAULT NULL AFTER expires_at',
    'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- --------------------------------------------------
-- login_attempts.action
-- Necesario para separar intentos de login y registro.
-- --------------------------------------------------
SET @col_exists = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'login_attempts'
      AND COLUMN_NAME = 'action'
);

SET @ddl = IF(
    @col_exists = 0,
    'ALTER TABLE login_attempts ADD COLUMN action ENUM(''login'', ''register'') NOT NULL DEFAULT ''login'' AFTER username',
    'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- --------------------------------------------------
-- Índice para rate limiting.
-- --------------------------------------------------
SET @idx_exists = (
    SELECT COUNT(*)
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'login_attempts'
      AND INDEX_NAME = 'idx_login_attempts_action_ip_time'
);

SET @ddl = IF(
    @idx_exists = 0,
    'ALTER TABLE login_attempts ADD INDEX idx_login_attempts_action_ip_time (action, ip, attempted_at)',
    'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- --------------------------------------------------
-- Índice para sesiones por usuario y estado.
-- --------------------------------------------------
SET @idx_exists = (
    SELECT COUNT(*)
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'sessions'
      AND INDEX_NAME = 'idx_sessions_user_revoked'
);

SET @ddl = IF(
    @idx_exists = 0,
    'ALTER TABLE sessions ADD INDEX idx_sessions_user_revoked (user_id, revoked_at)',
    'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- --------------------------------------------------
-- Índice útil para recetas por país y nombre.
-- --------------------------------------------------
SET @idx_exists = (
    SELECT COUNT(*)
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'recipes'
      AND INDEX_NAME = 'idx_recipes_country_name'
);

SET @ddl = IF(
    @idx_exists = 0,
    'ALTER TABLE recipes ADD INDEX idx_recipes_country_name (country_id, name)',
    'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;