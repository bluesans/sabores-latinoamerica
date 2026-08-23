USE `sabores_latinoamerica`;

-- --------------------------------------------------
-- Agregar users.role si todavía no existe.
-- --------------------------------------------------
SET @role_exists = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND COLUMN_NAME = 'role'
);

SET @ddl = IF(
    @role_exists = 0,
    'ALTER TABLE users ADD COLUMN role ENUM(''user'', ''admin'') NOT NULL DEFAULT ''user'' AFTER password',
    'SELECT ''users.role ya existe'' AS info'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- --------------------------------------------------
-- Tabla login_attempts, usada por Auth::checkLoginRate
-- y Auth::recordFailedLogin.
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS `login_attempts` (
    `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `ip`           VARCHAR(45) NOT NULL,
    `username`     VARCHAR(30) NOT NULL DEFAULT '',
    `attempted_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_login_attempts_ip_time` (`ip`, `attempted_at`),
    KEY `idx_login_attempts_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------
-- Tabla favorites, usada por FavoriteController.
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS `favorites` (
    `user_id`    INT NOT NULL,
    `recipe_id`  INT NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`user_id`, `recipe_id`),
    KEY `idx_favorites_recipe` (`recipe_id`),
    CONSTRAINT `fk_favorites_user`
        FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`)
        ON DELETE CASCADE,
    CONSTRAINT `fk_favorites_recipe`
        FOREIGN KEY (`recipe_id`)
        REFERENCES `recipes` (`id`)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;