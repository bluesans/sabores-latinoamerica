CREATE TABLE `countries` (
	`id` int NOT NULL,
	`iso_code` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`emoji` varchar(10),
	`tagline` varchar(150),
	CONSTRAINT `countries_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_iso_code` UNIQUE(`iso_code`)
);
--> statement-breakpoint
CREATE TABLE `favorites` (
	`user_id` int NOT NULL,
	`recipe_id` int NOT NULL,
	`created_at` datetime NOT NULL DEFAULT current_timestamp(),
	CONSTRAINT `favorites_user_id_recipe_id_pk` PRIMARY KEY(`user_id`,`recipe_id`)
);
--> statement-breakpoint
CREATE TABLE `ingredients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	CONSTRAINT `ingredients_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_ing_name` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`ip` varchar(45) NOT NULL,
	`username` varchar(30) NOT NULL DEFAULT '',
	`action` enum('login','register','refresh') NOT NULL DEFAULT 'login',
	`attempted_at` datetime NOT NULL DEFAULT current_timestamp(),
	CONSTRAINT `login_attempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `recipe_ingredient` (
	`recipe_id` int NOT NULL,
	`ingredient_id` int NOT NULL,
	CONSTRAINT `recipe_ingredient_recipe_id_ingredient_id_pk` PRIMARY KEY(`recipe_id`,`ingredient_id`)
);
--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`country_id` int NOT NULL,
	`name` varchar(200) NOT NULL,
	`description` text,
	`difficulty` enum('easy','medium','hard'),
	`time_minutes` int,
	`youtube_id` varchar(30),
	CONSTRAINT `recipes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`token` char(64) NOT NULL,
	`created_at` datetime NOT NULL DEFAULT current_timestamp(),
	`expires_at` datetime NOT NULL,
	`revoked_at` datetime,
	`ip` varchar(45),
	`user_agent` varchar(255),
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_token` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(30) NOT NULL,
	`password` varchar(255) NOT NULL,
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`created_at` datetime NOT NULL DEFAULT current_timestamp(),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_username` UNIQUE(`username`)
);
--> statement-breakpoint
ALTER TABLE `favorites` ADD CONSTRAINT `favorites_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `favorites` ADD CONSTRAINT `favorites_recipe_id_recipes_id_fk` FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `recipe_ingredient` ADD CONSTRAINT `recipe_ingredient_recipe_id_recipes_id_fk` FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `recipe_ingredient` ADD CONSTRAINT `recipe_ingredient_ingredient_id_ingredients_id_fk` FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `recipes` ADD CONSTRAINT `recipes_country_id_countries_id_fk` FOREIGN KEY (`country_id`) REFERENCES `countries`(`id`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX `idx_favorites_recipe` ON `favorites` (`recipe_id`);--> statement-breakpoint
CREATE INDEX `idx_login_attempts_ip_time` ON `login_attempts` (`ip`,`attempted_at`);--> statement-breakpoint
CREATE INDEX `idx_login_attempts_username` ON `login_attempts` (`username`);--> statement-breakpoint
CREATE INDEX `idx_login_attempts_action_ip_time` ON `login_attempts` (`action`,`ip`,`attempted_at`);--> statement-breakpoint
CREATE INDEX `idx_recipes_country_name` ON `recipes` (`country_id`,`name`);--> statement-breakpoint
CREATE INDEX `idx_sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_sessions_user_revoked` ON `sessions` (`user_id`,`revoked_at`);