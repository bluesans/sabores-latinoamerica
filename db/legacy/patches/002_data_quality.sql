USE `sabores_latinoamerica`;

-- --------------------------------------------------
-- Países
-- --------------------------------------------------
UPDATE `countries`
SET `name` = 'Brasil',
    `emoji` = '🇧🇷'
WHERE `id` = 3;

UPDATE `countries`
SET `name` = 'República Dominicana'
WHERE `id` = 19;

UPDATE `countries`
SET `tagline` = NULL
WHERE TRIM(IFNULL(`tagline`, '')) = '';

UPDATE `countries`
SET `tagline` = TRIM(REPLACE(REPLACE(`tagline`, '   ', ' '), '  ', ' '))
WHERE `tagline` IS NOT NULL;

-- --------------------------------------------------
-- Recetas
-- --------------------------------------------------
UPDATE `recipes`
SET `description` = TRIM(REPLACE(REPLACE(`description`, '   ', ' '), '  ', ' '))
WHERE `description` IS NOT NULL;

UPDATE `recipes`
SET `youtube_id` = NULL
WHERE TRIM(IFNULL(`youtube_id`, '')) = '';

UPDATE `recipes`
SET `youtube_id` = TRIM(REPLACE(`youtube_id`, ' ', ''))
WHERE `youtube_id` IS NOT NULL;

UPDATE `recipes`
SET `difficulty` = 'medium'
WHERE `difficulty` IS NULL
   OR `difficulty` NOT IN ('easy', 'medium', 'hard');

-- --------------------------------------------------
-- Ingredientes
-- --------------------------------------------------
UPDATE `ingredients`
SET `name` = TRIM(REPLACE(REPLACE(`name`, '   ', ' '), '  ', ' '));

UPDATE `ingredients`
SET `name` = 'Chocolate'
WHERE `name` = 'Choc olate';

UPDATE `ingredients`
SET `name` = 'Costilla de cerdo'
WHERE `name` = 'Co stilla de cerdo';

UPDATE `ingredients`
SET `name` = 'Leche condensada'
WHERE `name` = 'Leche condens ada';

UPDATE `ingredients`
SET `name` = 'Pan de molde'
WHERE `name` = 'Pan de mold e';

UPDATE `ingredients`
SET `name` = 'Papa criolla'
WHERE `name` = 'Pap a criolla';

UPDATE `ingredients`
SET `name` = 'Caraotas negras'
WHERE `name` = 'Caraotas negra s';

UPDATE `ingredients`
SET `name` = 'Ají colorado'
WHERE `name` = 'Ají colora do';

UPDATE `ingredients`
SET `name` = 'Culantro coyote'
WHERE `name` = 'Culantro c oyote';

UPDATE `ingredients`
SET `name` = '7 tipos de carne'
WHERE `name` = ' 7 tipos de carne';

UPDATE `ingredients`
SET `name` = 'Pata de res'
WHERE `name` = 'Pata  de res';

UPDATE `ingredients`
SET `name` = 'Filete de ternera'
WHERE `name` = 'Filete de  ternera';

UPDATE `ingredients`
SET `name` = TRIM(`name`);

-- --------------------------------------------------
-- Opcional: si ya tenías usuarios creados y quieres
-- que el primero sea admin, descomenta esto.
-- --------------------------------------------------
-- UPDATE `users` u
-- JOIN (
--     SELECT MIN(id) AS id
--     FROM users
-- ) f ON f.id = u.id
-- SET u.role = 'admin';