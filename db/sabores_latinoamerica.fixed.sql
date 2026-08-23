-- ============================================================
-- Sabores de Latinoamérica · Base de datos v2
-- Ingredientes normalizados + sesiones con token
-- ⚠ El DROP DATABASE borra todo: útil para reimportar limpio
-- ============================================================
SET NAMES utf8mb4;

DROP DATABASE IF EXISTS `sabores_latinoamerica`;
CREATE DATABASE `sabores_latinoamerica`
 CHARACTER SET utf8mb4
 COLLATE utf8mb4_unicode_ci;
USE `sabores_latinoamerica`;

-- ---------- Usuarios ----------
CREATE TABLE `users` (
 `id` INT NOT NULL AUTO_INCREMENT,
 `username` VARCHAR(30) NOT NULL,
 `password` VARCHAR(255) NOT NULL, -- bcrypt (password_hash)
 `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`id`),
 UNIQUE KEY `uq_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Sesiones (tokens revocables) ----------
CREATE TABLE `sessions` (
 `id` BIGINT NOT NULL AUTO_INCREMENT,
 `user_id` INT NOT NULL,
 `token` CHAR(64) NOT NULL,
 `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 `expires_at` DATETIME NOT NULL,
 PRIMARY KEY (`id`),
 UNIQUE KEY `uq_token` (`token`),
 KEY `idx_sessions_user` (`user_id`),
 CONSTRAINT `fk_sessions_user` FOREIGN KEY (`user_id`)
 REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Países ----------
CREATE TABLE `countries` (
 `id` INT NOT NULL,
 `iso_code` INT NOT NULL,
 `name` VARCHAR(100) NOT NULL,
 `emoji` VARCHAR(10) DEFAULT NULL,
 `tagline` VARCHAR(150) DEFAULT NULL,
 PRIMARY KEY (`id`),
 UNIQUE KEY `uq_iso_code` (`iso_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Recetas ----------
CREATE TABLE `recipes` (
 `id` INT NOT NULL AUTO_INCREMENT,
 `country_id` INT NOT NULL,
 `name` VARCHAR(200) NOT NULL,
 `description` TEXT DEFAULT NULL,
 `difficulty` ENUM('easy','medium','hard') DEFAULT NULL,
 `time_minutes` INT DEFAULT NULL,
 `youtube_id` VARCHAR(30) DEFAULT NULL,
 PRIMARY KEY (`id`),
 KEY `fk_recipe_country` (`country_id`),
 CONSTRAINT `fk_recipe_country` FOREIGN KEY (`country_id`) REFERENCES `countries` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Ingredientes: catálogo único ----------
CREATE TABLE `ingredients` (
 `id` INT NOT NULL AUTO_INCREMENT,
 `name` VARCHAR(200) NOT NULL,
 PRIMARY KEY (`id`),
 UNIQUE KEY `uq_ing_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Relación receta ↔ ingrediente ----------
CREATE TABLE `recipe_ingredient` (
 `recipe_id` INT NOT NULL,
 `ingredient_id` INT NOT NULL,
 PRIMARY KEY (`recipe_id`,`ingredient_id`),
 KEY `fk_ri_ingredient` (`ingredient_id`),
 CONSTRAINT `fk_ri_recipe` FOREIGN KEY (`recipe_id`) REFERENCES `recipes` (`id`) ON DELETE CASCADE,
 CONSTRAINT `fk_ri_ingredient` FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- DATOS
-- ============================================================

INSERT INTO `countries` (`id`, `iso_code`, `name`, `emoji`, `tagline`) VALUES
(1, 484, 'México', '🇲🇽', 'Cocina mestiza: maíz, chile y comal'),
(2, 32, 'Argentina', '🇦🇷', 'Brasa, pampa y bodega'),
(3, 76, 'Brasil', '🇧🇷', 'Del sertão a Bahía'),
(4, 604, 'Perú', '🇵🇪', 'La despensa del Pacífico'),
(5, 170, 'Colombia', '🇨🇴', 'De la cordillera al Caribe'),
(6, 152, 'Chile', '🇨🇱', 'Entre la cordillera y el mar'),
(7, 862, 'Venezuela', '🇻🇪', 'Maíz, cacao y tradición'),
(8, 218, 'Ecuador', '🇪🇨', 'Costa, sierra y Amazonía en un solo plato'),
(9, 68, 'Bolivia', '🇧🇴', 'Sabores de altura'),
(10, 600, 'Paraguay', '🇵🇾', 'Tierra guaraní: mandioca y queso'),
(11, 858, 'Uruguay', '🇺🇾', 'Chivitos, mate y rambla'),
(12, 320, 'Guatemala', '🇬🇹', 'Herencia maya en cada recado'),
(13, 192, 'Cuba', '🇨🇺', 'Sofrito, son y fuego lento'),
(14, 222, 'El Salvador', '🇸🇻', 'Pupusas y curtido, orgullo nacional'),
(15, 558, 'Nicaragua', '🇳🇮', 'Maíz, gallo pinto y tradición'),
(16, 188, 'Costa Rica', '🇨🇷', 'Pura vida en la mesa'),
(17, 340, 'Honduras', '🇭🇳', 'Coco, caracol y baleadas'),
(18, 591, 'Panamá', '🇵🇦', 'Puente de mares y sabores'),
(19, 214, 'Rep. Dominicana', '🇩🇴', 'Sazón caribeño con bandera propia'),
(20, 84, 'Belice', '🇧🇿', NULL),
(21, 332, 'Haití', '🇭🇹', NULL),
(22, 630, 'Puerto Rico', '🇵🇷', NULL);

-- ---------- Recetas (57) ----------
INSERT INTO `recipes` (`id`,`country_id`,`name`,`description`,`difficulty`,`time_minutes`,`youtube_id`) VALUES
(1, 1,'Tacos al Pastor','Icónico taco callejero con carne de cerdo marinada en chiles y achiote, cocida en trompo vertical. Se sirve con piña, cilantro y cebolla sobre tortilla de maíz.','medium',120,'MWo42SO1aOM'),
(2, 1,'Mole Poblano','Salsa compleja de más de 20 ingredientes: chiles secos, chocolate amargo, especias y semillas. Orgullo de la gastronomía mexicana, servido sobre pavo o pollo.','hard',240,'YtymYbCZzmM'),
(3, 1,'Chiles en Nogada','Chile poblano relleno de picadillo de carne y frutas, cubierto con nogada (salsa de nuez de Castilla) y granada. Plato patriótico con los tres colores de México.','hard',180,'FKHWvnKQKmk'),
(4, 2,'Asado Argentino','Ritual cultural de cocción de carnes sobre parrilla a las brasas. Costillas, vacío, chorizos, morcillas y achuras cocinados lentamente con sal gruesa.','medium',180,'vxscY-dy9IU'),
(5, 2,'Empanadas Criollas','Masa horneada o frita rellena de carne picada con cebolla, pimentón, aceitunas y huevo duro. Cada provincia argentina tiene su estilo y cierre propio.','medium',90,'lqRFXOyiNr0'),
(6, 2,'Locro Criollo','Guiso espeso y reconfortante de maíz blanco, porotos, calabaza y carnes ahumadas. Plato del invierno y del 25 de Mayo, cocinado a fuego lento por horas.','easy',180,'vX0KYKAkBTU'),
(7, 3,'Feijoada','Plato nacional brasileño: frijoles negros guisados horas con diversas carnes de cerdo ahumadas. Se sirve con arroz, farofa, couve refogada y naranja.','medium',300,'Jsrzj9lGeVY'),
(8, 3,'Pão de Queijo','Panecillos esponjosos de almidón de mandioca y queso minas, crujientes por fuera y suaves por dentro. Icono del desayuno en Minas Gerais.','easy',45,'noDZZXzImv8'),
(9, 3,'Brigadeiro','El dulce favorito de Brasil: bolitas cremosas de leche condensada y cacao, rodadas en granillo de chocolate. Infaltable en toda festa junina e infantil.','easy',30,'T0DipnMrASQ'),
(10, 4,'Ceviche Peruano','Pescado fresco marinado en limón con ají limo, cebolla morada y culantro. Servido con choclo desgranado y camote. Emblema de la gastronomía peruana.','easy',25,'oRw2YNE5kLU'),
(11, 4,'Lomo Saltado','Salteado de tiras de lomo fino con tomate, cebolla roja, ají amarillo y sillao. Fusión criolla-oriental que se sirve con papas fritas y arroz blanco.','medium',30,'3VFCsPuR3Sg'),
(12, 4,'Ají de Gallina','Cremoso guiso de pollo desmenuzado en salsa de ají amarillo, pan remojado en leche, nueces y queso. Plato criollo limeño de origen virreinal.','medium',60,'BYP9aoeWEw4'),
(13, 5,'Bandeja Paisa','El plato mayor del eje cafetero: arroz, frijoles rojos, chicharrón, carne molida, chorizo, morcilla, huevo frito, aguacate y patacón. Un festín completo.','hard',120,'XeTuQ7UdA38'),
(14, 5,'Ajiaco Bogotano','Sopa espesa con tres tipos de papa criolla, pollo desmenuzado, mazorca y guascas. El plato del alma bogotana, servido con crema de leche y alcaparras.','medium',90,'R2DAkW3N_JY'),
(15, 5,'Arepa de Chócolo','Tortilla gruesa de maíz tierno dulce asada en budare. Acompañante universal de la mesa colombiana, rellena de queso derretido y mantequilla.','easy',20,'JLzbNGR8Sh4'),
(16, 6,'Cazuela de Vacuno','Sopa sustanciosa con trozo de carne de vacuno, zapallo, papas, choclo y porotos verdes en caldo aromático. Pilar de la comida casera chilena.','easy',90,'d6nXcyGGVqE'),
(17, 6,'Empanada de Pino','Empanada horneada con relleno de carne molida sofrita con cebolla (pino), aceitunas, huevo duro y pasas. Símbolo gastronómico del 18 de Septiembre.','medium',90,'nCYcQAKQIOM'),
(18, 6,'Pastel de Choclo','Fuente de greda con relleno de pino y pollo cubierto de choclo molido con albahaca, azúcar y mantequilla. Clásico del verano chileno.','medium',75,'lKXvRuivFwo'),
(19, 7,'Arepa Venezolana','Pan de maíz blanco precocido, dorado en budare o sartén. Se rellena con caraotas, carne mechada y queso amarillo. Base de toda mesa venezolana.','easy',30,'kpZx53kkslw'),
(20, 7,'Pabellón Criollo','Plato nacional venezolano: caraotas negras, arroz blanco, carne de res mechada y tajadas de plátano maduro. Cuatro sabores en perfecta armonía criolla.','medium',90,'DbJ8-Uo2MOQ'),
(21, 7,'Hallacas Navideñas','Hallaca venezolana de Navidad: masa de maíz pintada con onoto, rellena de guiso de carnes, aceitunas y alcaparras. Envuelta y cocida en hojas de plátano.','hard',480,'qZtBvmaOGdA'),
(22, 8,'Ceviche de Camarón','Camarones cocidos marinados en limón y naranjilla con cebolla paiteña, tomate y cilantro. Servido frío con tostadas o patacones.','easy',30,'s8Fmezppr8g'),
(23, 8,'Seco de Pollo','Guiso de pollo en salsa de cerveza negra, naranjilla y especias andinas. Se sirve con arroz amarillo, frijoles y aguacate en rodajas.','medium',60,'CJFdqk2HP4A'),
(24, 8,'Llapingachos','Tortillas de papa con queso, doradas en manteca de chancho hasta formar costra. Se sirven con salsa de maní, huevo frito, chorizo y ensalada.','medium',60,'Un7WxYDq_4c'),
(25, 9,'Salteña','Empanada boliviana ovalada y jugosa, rellena de carne, papas y arvejas en caldo gelificado con ají. El desayuno estrella de las ciudades bolivianas.','hard',180,'VydD2si0MwI'),
(26, 9,'Fricasé Paceño','Sopa de cerdo en caldo amarillo de ají con mote, chuño y verduras. Plato festivo tradicional de los domingos en La Paz.','medium',120,'x0CNslZsF7M'),
(27, 9,'Pique Macho','Carne de res y salchicha picadas salteadas, sobre papas fritas, cubierto de locoto, tomate, cebolla y huevo duro. El rey de los fines de semana.','easy',45,'Y_Ckwty5dks'),
(28, 10,'Sopa Paraguaya','A pesar del nombre, es un pan denso de harina de maíz, queso Paraguay y cebolla horneado en tatakua. Acompañante infaltable del asado.','medium',60,'Vfj0J9oxCkM'),
(29, 10,'Chipa Guazú','Pan festivo de almidón de mandioca, queso Paraguay y huevos, cocinado en horno de barro. Infaltable en Semana Santa y los viajes en bus.','easy',45,'ipBODTICzrE'),
(30, 10,'Mbejú','Torta crujiente de almidón de mandioca y queso fresca en sartén de hierro. Desayuno o merienda tradicional guaraní, acompañado de mate o cocido.','easy',20,'nB6UJUjea5Q'),
(31, 11,'Chivito Uruguayo','El sándwich nacional: filete fino de ternera, jamón, queso, huevo, tomate y lechuga en pan brioche con mayonesa. Monumento gastronómico declarado patrimonio.','easy',30,'pdNXrjhn0z4'),
(32, 11,'Asado Uruguayo','Tradición propia con vacío entero a la parrilla, corazón de cuadril y tira de asado corta. Cultura de reunión familiar alrededor del fuego y la brasa.','medium',180,'772DiAckQKo'),
(33, 11,'Tortas Fritas','Masas de harina fritas en grasa vacuna, redondas con agujero central. La tradición dice que se comen con mate cuando llueve. Consuelo y hogar.','easy',30,'0N5tx-KKoHg'),
(34, 12,'Pepián','Guiso ancestral maya con salsa espesa de pepitoria y ajonjolí tostados, chiles y especias. Plato nacional guatemalteco, declarado Patrimonio Cultural Inmaterial.','hard',120,'F96diq3p8lM'),
(35, 12,'Kak''ik de Pavo','Sopa ceremonial maya de pavo con chile cobanero, hierba santa y recado negro. Originaria de Alta Verapaz, Patrimonio Cultural de la Humanidad.','hard',180,'Kpbh2sFqRjA'),
(36, 12,'Rellenitos de Plátano','Bolitas de plátano maduro rellenas de frijoles negros dulces y canela, fritas hasta dorar. Postre y antojito típico de calles y mercados guatemaltecos.','easy',45,'0ZKslDAwxE4'),
(37, 13,'Ropa Vieja','Falda de res cocida y deshebrada en sofrito cubano de tomate, pimiento, ají y cebolla. El plato nacional de Cuba, lento, aromático y profundo.','medium',120,'oG0_sAbQoJU'),
(38, 13,'Moros y Cristianos','Arroz negro cocido junto con frijoles negros, sofrito cubano y especias. Nombre histórico que simboliza la fusión de culturas en la isla caribeña.','easy',60,'ni8caneHNGw'),
(39, 13,'Lechón Asado','Cerdo entero marinado en mojo criollo (ajo, naranja agria, orégano) y asado lentamente. El plato de las grandes celebraciones familiares cubanas.','hard',480,'Rs6E-bJMtTI'),
(40, 14,'Pupusas','Gruesas tortillas de masa de maíz rellenas de chicharrón molido, queso, frijoles o loroco. El platillo nacional, acompañado de curtido y salsa roja.','medium',60,'cqV-INtBwZ4'),
(41, 14,'Sopa de Pata','Caldo robusto de pata de res con maíz, yuca, ejotes, plátano verde y hierbas. Plato de fuerza que se come en celebraciones y fines de semana.','medium',180,'p3XHVK_qs5A'),
(42, 14,'Yuca con Chicharrón','Yuca hervida y frita acompañada de chicharrón de cerdo crujiente, curtido de repollo y salsa de tomate. El antojito salvadoreño más popular.','easy',45,'uPj5qYqY1H0'),
(43, 15,'Gallo Pinto Nica','Arroz con frijoles rojos, cebolla, pimiento y culantro. El desayuno diario nicaragüense, Patrimonio Cultural Intangible. Simple, nutritivo e identitario.','easy',30,'1FcVydCONdY'),
(44, 15,'Nacatamal','Tamal gigante de masa de maíz con manteca, relleno de cerdo, arroz, papas y hierbabuena. Envuelto en hoja de plátano y cocido al vapor.','hard',360,'udN1jZAfkV0'),
(45, 15,'Vigorón','Chicharrón de cerdo crujiente sobre yuca hervida y ensalada de repollo con tomate y vinagre. Servido sobre hoja de plátano en el mercado de Granada.','easy',45,'gTux0-zctlE'),
(46, 16,'Gallo Pinto Tico','Versión costarricense con frijoles negros, arroz, Salsa Lizano y culantro coyote. El desayuno más pura vida de Centroamérica, en la mesa de todos.','easy',20,'XFPqLOgn8-0'),
(47, 16,'Casado Costarricense','Plato completo del almuerzo: arroz, frijoles, ensalada, plátano maduro y una proteína. El plato del día más popular en sodas y restaurantes del país.','easy',45,'ogkJ5zdg9gs'),
(48, 16,'Olla de Carne','Sopa dominical de res con mazorca, papa, yuca, plátano verde, zanahoria y culantro. El plato de reunión familiar del domingo en todos los hogares costarricenses.','easy',120,'Fsv6uv7t3uo'),
(49, 17,'Baleada Hondureña','Tortilla de harina de trigo gruesa con frijoles refritos, crema hondureña, queso seco y mantequilla. El street food más popular y querido de Honduras.','easy',20,'VijmDziZ_Dc'),
(50, 17,'Sopa de Caracol','Sopa cremosa de leche de coco con caracol marino, yuca, plátano verde y verduras. Especialidad de la Costa Atlántica garífuna, fragante y exótica.','medium',90,'C9ltoUzrrp0'),
(51, 17,'Tapado Olanchano','Guiso de carne de res y cerdo con tubérculos y vegetales, cocinado tapado en horno de tierra. Plato festivo tradicional del interior hondureño.','hard',240,'_G-cqwzbLMY'),
(52, 18,'Sancocho Panameño','Sopa de pollo de patio con ñame, otoe, maíz y culantro. El plato nacional de Panamá, preparado en fiestas y como cura del cansancio.','easy',90,'QohfKrKlgUc'),
(53, 18,'Ropa Vieja Panameña','Versión panameña de la ropa vieja: carne desmenuzada en sofrito con ají chombo, tomate y cebolla. Se sirve con arroz con frijoles y patacones.','medium',120,'MaxfWKMUoRE'),
(54, 18,'Ceviche de Corvina','Ceviche panameño con corvina, apio, cebolla, ají chombo y abundante limón. Fresco y picante, servido en vasos plásticos con galletas de soda.','easy',30,'XQ5m6h_ephM'),
(55, 19,'La Bandera Dominicana','El plato nacional: arroz blanco, habichuelas rojas y carne guisada con sofrito. Servida al mediodía en cada hogar dominicano, todos los días.','medium',90,'anp6MlFmk18'),
(56, 19,'Mangú con Los Tres Golpes','Puré de plátano verde suave, servido con cebolla morada en vinagre, huevo frito, queso frito y salami. El desayuno dominicano por excelencia.','easy',30,'jNC_2WfaedE'),
(57, 19,'Sancocho de Siete Carnes','Sopa festiva con siete tipos de carne, yuca, ñame, auyama, plátano y maíz. Se cocina solo para celebraciones, bodas y bautizos grandes.','hard',240,'X-w9fU7uPE8');

-- ---------- Catálogo de ingredientes (185 únicos) ----------
INSERT INTO `ingredients` (`id`,`name`) VALUES
(1,'Cerdo'),(2,'Chile guajillo'),(3,'Achiote'),(4,'Piña'),(5,'Cilantro'),
(6,'Cebolla'),(7,'Tortilla de maíz'),(8,'Limón'),(9,'Chile mulato'),(10,'Chile ancho'),
(11,'Chocolate'),(12,'Ajonjolí'),(13,'Plátano macho'),(14,'Pavo'),(15,'Ajo'),
(16,'Tomate'),(17,'Chile poblano'),(18,'Carne molida'),(19,'Nuez de Castilla'),(20,'Granada'),
(21,'Perejil'),(22,'Frutas secas'),(23,'Vacío'),(24,'Costillas'),(25,'Chorizo criollo'),
(26,'Morcilla'),(27,'Sal gruesa'),(28,'Carbón'),(29,'Harina'),(30,'Grasa vacuna'),
(31,'Carne picada'),(32,'Pimentón'),(33,'Aceitunas'),(34,'Huevo duro'),(35,'Maíz blanco'),
(36,'Porotos'),(37,'Calabaza'),(38,'Mondongo'),(39,'Chorizo colorado'),(40,'Tocino'),
(41,'Frijol negro'),(42,'Costilla de cerdo'),(43,'Linguiça'),(44,'Laurel'),(45,'Naranja'),
(46,'Almidón de mandioca'),(47,'Queso minas'),(48,'Huevo'),(49,'Leche'),(50,'Aceite'),
(51,'Sal'),(52,'Leche condensada'),(53,'Cacao en polvo'),(54,'Mantequilla'),(55,'Granillo de chocolate'),
(56,'Corvina o lenguado'),(57,'Limón peruano'),(58,'Ají limo'),(59,'Cebolla morada'),(60,'Culantro'),
(61,'Choclo'),(62,'Camote'),(63,'Lomo fino'),(64,'Cebolla roja'),(65,'Ají amarillo'),
(66,'Sillao'),(67,'Vinagre'),(68,'Papa'),(69,'Arroz'),(70,'Pechuga de pollo'),
(71,'Pan de molde'),(72,'Nueces'),(73,'Queso parmesano'),(74,'Leche evaporada'),(75,'Frijoles rojos'),
(76,'Chicharrón'),(77,'Chorizo'),(78,'Aguacate'),(79,'Plátano'),(80,'Papa pastusa'),
(81,'Papa criolla'),(82,'Papa sabanera'),(83,'Pollo'),(84,'Mazorca'),(85,'Guascas'),
(86,'Crema de leche'),(87,'Maíz tierno'),(88,'Azúcar'),(89,'Queso blanco'),(90,'Vacuno'),
(91,'Zapallo'),(92,'Zanahoria'),(93,'Porotos verdes'),(94,'Orégano'),(95,'Manteca'),
(96,'Pasas'),(97,'Albahaca'),(98,'Harina PAN'),(99,'Agua tibia'),(100,'Carne mechada'),
(101,'Caraotas negras'),(102,'Queso amarillo'),(103,'Carne de res'),(104,'Plátano maduro'),(105,'Ají'),
(106,'Comino'),(107,'Harina de maíz'),(108,'Carne res y cerdo'),(109,'Alcaparras'),(110,'Hoja de plátano'),
(111,'Camarón'),(112,'Naranjilla'),(113,'Cebolla paiteña'),(114,'Cerveza negra'),(115,'Queso'),
(116,'Manteca de chancho'),(117,'Maní'),(118,'Arvejas'),(119,'Ají colorado'),(120,'Caldo gelificado'),
(121,'Mote'),(122,'Chuño'),(123,'Hierbabuena'),(124,'Salchicha'),(125,'Locoto'),
(126,'Mostaza'),(127,'Queso Paraguay'),(128,'Anís'),(129,'Filete de ternera'),(130,'Jamón cocido'),
(131,'Lechuga'),(132,'Mayonesa'),(133,'Pan'),(134,'Cuadril'),(135,'Tira de asado'),
(136,'Bicarbonato'),(137,'Pepitoria'),(138,'Chile guaque'),(139,'Miltomate'),(140,'Chile cobanero'),
(141,'Hierba santa'),(142,'Recado'),(143,'Plátano macho maduro'),(144,'Frijoles negros'),(145,'Canela'),
(146,'Falda de res'),(147,'Pimiento'),(148,'Ají pimiento'),(149,'Cerdo entero'),(150,'Naranja agria'),
(151,'Masa de maíz'),(152,'Chicharrón molido'),(153,'Loroco'),(154,'Frijoles refritos'),(155,'Curtido'),
(156,'Pata de res'),(157,'Maíz'),(158,'Yuca'),(159,'Ejotes'),(160,'Plátano verde'),
(161,'Chicharrón de cerdo'),(162,'Repollo'),(163,'Manteca de cerdo'),(164,'Salsa Lizano'),(165,'Culantro coyote'),
(166,'Pollo o carne'),(167,'Picadillo'),(168,'Tortilla de harina'),(169,'Crema'),(170,'Queso seco'),
(171,'Huevo (opcional)'),(172,'Caracol marino'),(173,'Leche de coco'),(174,'Chile'),(175,'Chile dulce'),
(176,'Pollo de patio'),(177,'Ñame'),(178,'Otoe'),(179,'Ají chombo'),(180,'Corvina'),
(181,'Apio'),(182,'Habichuelas rojas'),(183,'Salami'),(184,'7 tipos de carne'),(185,'Auyama');

-- ---------- Relación receta ↔ ingrediente ----------
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (1,1),(1,2),(1,3),(1,4),(1,5),(1,6),(1,7),(1,8);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (2,9),(2,10),(2,11),(2,12),(2,13),(2,14),(2,15),(2,16);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (3,17),(3,18),(3,19),(3,20),(3,21),(3,22);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (4,23),(4,24),(4,25),(4,26),(4,27),(4,28);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (5,29),(5,30),(5,31),(5,6),(5,32),(5,33),(5,34);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (6,35),(6,36),(6,37),(6,38),(6,39),(6,40),(6,6);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (7,41),(7,42),(7,40),(7,43),(7,6),(7,15),(7,44),(7,45);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (8,46),(8,47),(8,48),(8,49),(8,50),(8,51);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (9,52),(9,53),(9,54),(9,55);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (10,56),(10,57),(10,58),(10,59),(10,60),(10,61),(10,62);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (11,63),(11,16),(11,64),(11,65),(11,66),(11,67),(11,68),(11,69);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (12,70),(12,65),(12,71),(12,72),(12,73),(12,74);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (13,75),(13,69),(13,18),(13,76),(13,77),(13,78),(13,79),(13,48);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (14,80),(14,81),(14,82),(14,83),(14,84),(14,85),(14,86);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (15,87),(15,51),(15,88),(15,54),(15,89),(15,49);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (16,90),(16,91),(16,68),(16,61),(16,92),(16,93),(16,94);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (17,29),(17,95),(17,18),(17,6),(17,33),(17,34),(17,96);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (18,61),(18,83),(18,18),(18,6),(18,97),(18,88),(18,34),(18,54);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (19,98),(19,99),(19,51),(19,100),(19,101),(19,102);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (20,101),(20,69),(20,103),(20,104),(20,6),(20,105),(20,15),(20,106);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (21,107),(21,108),(21,83),(21,40),(21,33),(21,109),(21,96),(21,110);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (22,111),(22,8),(22,112),(22,113),(22,16),(22,5),(22,105),(22,51);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (23,83),(23,114),(23,112),(23,65),(23,60),(23,15),(23,6),(23,106);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (24,68),(24,115),(24,6),(24,116),(24,117),(24,48),(24,3);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (25,29),(25,103),(25,68),(25,118),(25,119),(25,120),(25,33),(25,48);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (26,1),(26,65),(26,121),(26,122),(26,6),(26,15),(26,94),(26,123);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (27,103),(27,124),(27,68),(27,125),(27,16),(27,6),(27,34),(27,126);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (28,107),(28,127),(28,6),(28,48),(28,49),(28,54),(28,51);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (29,46),(29,127),(29,48),(29,54),(29,49),(29,128);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (30,46),(30,127),(30,54),(30,51),(30,99);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (31,129),(31,130),(31,115),(31,48),(31,16),(31,131),(31,132),(31,133);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (32,23),(32,134),(32,135),(32,77),(32,26),(32,27);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (33,29),(33,30),(33,99),(33,51),(33,136);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (34,83),(34,137),(34,12),(34,138),(34,16),(34,139),(34,6),(34,15);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (35,14),(35,140),(35,16),(35,139),(35,141),(35,6),(35,15),(35,142);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (36,143),(36,144),(36,88),(36,145),(36,50);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (37,146),(37,16),(37,147),(37,6),(37,15),(37,106),(37,44),(37,148);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (38,69),(38,144),(38,6),(38,147),(38,15),(38,106),(38,44),(38,50);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (39,149),(39,15),(39,150),(39,94),(39,106),(39,51),(39,50);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (40,151),(40,152),(40,115),(40,153),(40,154),(40,155),(40,51);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (41,156),(41,157),(41,158),(41,159),(41,160),(41,16),(41,6),(41,60);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (42,158),(42,161),(42,162),(42,16),(42,6),(42,8),(42,67);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (43,69),(43,75),(43,6),(43,147),(43,60),(43,15),(43,50),(43,51);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (44,151),(44,163),(44,1),(44,69),(44,68),(44,16),(44,123),(44,110);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (45,161),(45,158),(45,162),(45,16),(45,67),(45,8),(45,51);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (46,69),(46,144),(46,164),(46,6),(46,165),(46,147),(46,50);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (47,69),(47,144),(47,166),(47,104),(47,131),(47,16),(47,167);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (48,103),(48,84),(48,68),(48,158),(48,160),(48,92),(48,60),(48,51);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (49,168),(49,154),(49,169),(49,170),(49,54),(49,171);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (50,172),(50,173),(50,158),(50,160),(50,6),(50,15),(50,60),(50,174);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (51,103),(51,1),(51,158),(51,79),(51,6),(51,175),(51,16),(51,60);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (52,176),(52,177),(52,178),(52,157),(52,60),(52,15),(52,6),(52,51);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (53,103),(53,179),(53,16),(53,6),(53,15),(53,106),(53,60),(53,51);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (54,180),(54,8),(54,6),(54,181),(54,179),(54,60),(54,51);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (55,69),(55,182),(55,103),(55,16),(55,6),(55,147),(55,15),(55,94);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (56,160),(56,54),(56,51),(56,59),(56,67),(56,48),(56,89),(56,183);
INSERT INTO `recipe_ingredient` (`recipe_id`,`ingredient_id`) VALUES (57,184),(57,158),(57,177),(57,185),(57,160),(57,157),(57,6),(57,15);

-- ---------- Vista de estadísticas ----------
CREATE OR REPLACE VIEW `v_estadisticas` AS
SELECT
 (SELECT COUNT(DISTINCT `country_id`) FROM `recipes`) AS `paises_con_recetas`,
 (SELECT COUNT(*) FROM `recipes`) AS `total_recetas`,
 (SELECT COUNT(*) FROM `ingredients`) AS `ingredientes_distintos`,
 (SELECT COUNT(*) FROM `recipes` WHERE `youtube_id` IS NOT NULL AND `youtube_id` <> '') AS `recetas_con_video`;