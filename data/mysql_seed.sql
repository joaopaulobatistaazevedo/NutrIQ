-- MySQL dump 10.13  Distrib 8.0.45, for Linux (x86_64)
--
-- Host: localhost    Database: bugsbyte
-- ------------------------------------------------------
-- Server version	8.0.45

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `friendships`
--

DROP TABLE IF EXISTS `friendships`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `friendships` (
  `requester_id` int NOT NULL,
  `addressee_id` int NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'PENDING',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`requester_id`,`addressee_id`),
  KEY `idx_friendships_addr` (`addressee_id`),
  CONSTRAINT `friendships_ibfk_1` FOREIGN KEY (`requester_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `friendships_ibfk_2` FOREIGN KEY (`addressee_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `friendships_chk_1` CHECK ((`requester_id` <> `addressee_id`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `friendships`
--

LOCK TABLES `friendships` WRITE;
/*!40000 ALTER TABLE `friendships` DISABLE KEYS */;
/*!40000 ALTER TABLE `friendships` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `meal_plan_meals`
--

DROP TABLE IF EXISTS `meal_plan_meals`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `meal_plan_meals` (
  `id` int NOT NULL AUTO_INCREMENT,
  `meal_plan_id` int NOT NULL,
  `recipe_id` int NOT NULL,
  `day_of_week` int NOT NULL,
  `meal_type` varchar(50) NOT NULL,
  `is_completed` tinyint DEFAULT '0',
  `photo_path` varchar(500) DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `recipe_id` (`recipe_id`),
  KEY `idx_mp_meals_plan` (`meal_plan_id`),
  CONSTRAINT `meal_plan_meals_ibfk_1` FOREIGN KEY (`meal_plan_id`) REFERENCES `meal_plans` (`id`) ON DELETE CASCADE,
  CONSTRAINT `meal_plan_meals_ibfk_2` FOREIGN KEY (`recipe_id`) REFERENCES `recipes` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `meal_plan_meals`
--

LOCK TABLES `meal_plan_meals` WRITE;
/*!40000 ALTER TABLE `meal_plan_meals` DISABLE KEYS */;
/*!40000 ALTER TABLE `meal_plan_meals` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `meal_plans`
--

DROP TABLE IF EXISTS `meal_plans`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `meal_plans` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `week_start` date DEFAULT NULL,
  `status` varchar(20) DEFAULT 'ACTIVE',
  PRIMARY KEY (`id`),
  KEY `idx_meal_plans_user` (`user_id`),
  KEY `idx_meal_plans_week` (`week_start`),
  CONSTRAINT `meal_plans_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `meal_plans`
--

LOCK TABLES `meal_plans` WRITE;
/*!40000 ALTER TABLE `meal_plans` DISABLE KEYS */;
/*!40000 ALTER TABLE `meal_plans` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `posts`
--

DROP TABLE IF EXISTS `posts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `posts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `recipe_id` int NOT NULL,
  `picture_path` varchar(500) NOT NULL,
  `description` text,
  `rating` tinyint NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_posts_user` (`user_id`),
  KEY `idx_posts_recipe` (`recipe_id`),
  CONSTRAINT `posts_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `posts_ibfk_2` FOREIGN KEY (`recipe_id`) REFERENCES `recipes` (`id`),
  CONSTRAINT `posts_chk_1` CHECK ((`rating` between 1 and 5))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `posts`
--

LOCK TABLES `posts` WRITE;
/*!40000 ALTER TABLE `posts` DISABLE KEYS */;
/*!40000 ALTER TABLE `posts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `recipes`
--

DROP TABLE IF EXISTS `recipes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `recipes` (
  `id` int NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text,
  `meal_type` varchar(50) NOT NULL,
  `prep_time_min` int DEFAULT '0',
  `cook_time_min` int DEFAULT '0',
  `servings` int DEFAULT '2',
  `calories` double DEFAULT '0',
  `protein_g` double DEFAULT '0',
  `carbs_g` double DEFAULT '0',
  `fat_g` double DEFAULT '0',
  `image_url` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `recipes`
--

LOCK TABLES `recipes` WRITE;
/*!40000 ALTER TABLE `recipes` DISABLE KEYS */;
INSERT INTO `recipes` VALUES (32252128,'Trança de queijo e doce de maçã','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/tranca-de-queijo-e-doce-de-maca/ | Ingredientes: 2 rolos  massa folhada estendida (retangular), 150 g  doce de maçã, 80 g  miolo de noz partido, 2  queijos frescos (360 g), 1  ovo M, Tomilho q.b., Papel vegetal q.b.','DINNER',0,0,2,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2025/11/dlhxqto9hjc6.jpg'),(87382238,'Bacalhau à zé do pipo','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/bacalhau-a-ze-do-pipo-2/ | Ingredientes: 500 g de bacalhau em postas altas, 2,5 dl de leite, 1 dente de alho, 2 cebolas, 1 dl de azeite, 2 folhas de louro, 1 kg de puré de batata, Pão ralado para polvilhar','DINNER',60,60,4,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/04/peyh6wbwlpu2-1.jpg'),(106605843,'Bolo de chocolate com azeite','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/bolo-de-chocolate-com-azeite-2/ | Ingredientes: 300 g de açúcar, 240 g de farinha, 90 g de chocolate em pó, 3 Ovos, 1,5 dl de azeite, 2 dl de água quente, 1 colher (sopa) de fermento em pó, 1 colher (café) de canela em pó','DINNER',70,70,7,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2016/02/kdtvisvjjwdq.jpg'),(157753354,'Ovos mexidos com salsichas e espinafres','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/ovos-mexidos-com-salsichas-e-espinafres/ | Ingredientes: 5  Ovos, 1 lata  6 salsichas, 1 molho  espinafres, 20 g  manteiga, Sal q.b.','SNACK',15,15,2,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2025/10/l1hjycw7g3sj.jpg'),(159946887,'Empada de pizza','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/empada-de-pizza-2/ | Ingredientes: 2 rolos  massa de pizza estendida de compra, 250 g  cogumelos frescos, 200 g  molho de tomate, 8 fatias  queijo, 8 fatias  fiambre, 1  cebola média, 1 dente  alho, 2 colheres (sopa)  azeite','DINNER',40,40,4,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/06/xoz0gfp3j0lu.jpg'),(191669264,'Feijoada low cost','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/feijoada-low-cost-2/ | Ingredientes: 500 g  sobras de carnes cozidas, 1 molho pequeno  grelos, 1  cebola, 3 dentes  alho, 1 folha  louro, 5 colheres (sopa)  azeite, 1 lata grande  feijão manteiga, Sal q.b.','DINNER',40,40,4,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/04/ag7hjxsvb9ec-1.jpg'),(196685476,'Pescada no forno mariscada','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/pescada-no-forno-mariscada-2/ | Ingredientes: 4 postas  pescada, 1 pacote  sopa instantânea creme de marisco, 600 g  batatas pequenas, 400 g  ervilhas, 2  cenouras, 2 dentes  alho, 0,5 dl  azeite, Sumo de limão q.b.','DINNER',60,60,4,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/06/l7oiua5vxeth.jpg'),(207164608,'Alheira na air fryer','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/alheira-na-air-fryer/ | Ingredientes: 3  alheiras, 1/2  broa, 100 g  couve portuguesa, 2 dentes  alho, 50 ml  azeite, Sal e pimenta q.b.','DINNER',0,40,3,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2025/10/zaukxklqsmsf-1.jpg'),(249645441,'Delícia de morango','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/delicia-de-morango-2/ | Ingredientes: 300 g  morangos, 100 g  coco ralado, 5 dl  leite quente, 1 lata  leite condensado, 4  gemas, 1 saqueta  gelatina de morango, 2 colheres (sopa) rasas  farinha maisena','DINNER',40,40,6,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/04/glspdejt0gxm.jpg'),(254067655,'Carne de vaca estufada com cenouras','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/carne-de-vaca-estufada-com-cenouras/ | Ingredientes: 700 g  Carne de Vaca Para Guisar, 3  Cenouras, 2  Cebolas, 2  Dentes de Alho, 3 colheres (sopa)  Azeite, 2 colheres (sopa)  Polpa de Tomate, 2 colheres (sopa)  Salsa Picada, 1 ramo  Alecrim','DINNER',50,0,6,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2025/10/5bbzlnf1mi8f.jpg'),(294664052,'Ovos rotos','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/ovos-rotos/ | Ingredientes: 6  Ovos M, 100 g  Cogumelos, 100 g  Bacon às tiras, 100 g  Batata cortada em palitos, 2 colheres (sopa)  Azeite, q.b.  Sal e pimenta, q.b.  Rebentos de surrel','DINNER',15,0,4,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2025/10/10qlqz28gfan.jpg'),(295957102,'Creme de grão com cenoura','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/creme-de-grao-com-cenoura-2/ | Ingredientes: 1 lata grande  grão, 5  cenouras, 1  courgette, 1  alho-francês, 1  cebola, 5 colheres (sopa)  azeite, 1 raminho  coentros picados, Sal q.b.','DINNER',40,40,6,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/04/tldxcmm6hwhb-1.jpg'),(318175753,'Pavê de chocolate','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/pave-de-chocolate-2/ | Ingredientes: 2 dl de leite frio, 2 colheres (sopa) de chocolate em pó, 2 colheres (sopa) de creme de licor de whisky, 200 g de bolachas de água e sal, Raspas de chocolate q.b., 1 lata de leite condensado, 3 colheres (sopa) de chocolate em pó, 1 colher (sopa) de margarina','DINNER',60,60,7,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/04/jay7gwzpns4u-1.jpg'),(357202008,'Bolo de nozes com natas','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/bolo-de-nozes-com-natas-2/ | Ingredientes: 400 g de açúcar, 360 g de farinha, 200 g de  manteiga, 150 g de miolo de noz moído, 6 Ovos, 2 dl de natas, 1 colher (chá) de fermento em pó, Margarina para untar','DINNER',80,80,9,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/04/3ky2yhymmqjw-1.jpg'),(383041277,'Quiche de legumes e cogumelos','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/quiche-de-legumes-e-cogumelos/ | Ingredientes: PARA A MASSA:  INGREDIENTES, 200 g  Farinha, 100 g  Manteiga, 1  Ovo M, 2 colheres (sopa)  Água, 1  Pitada de sal, para polvilhar  Farinha, para untar  Manteiga','DINNER',0,75,12,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2025/10/6t72l4obsptl.jpg'),(430492959,'Mini pastéis de feijão','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/mini-pasteis-de-feijao-2/ | Ingredientes: 600 g  massa folhada, 500 g  açúcar, 100 g  feijão branco cozido, 25 g  amêndoa moída, 6  ovos + 6 gemas, Farinha para polvilhar, Açúcar em pó para polvilhar, Caixinhas de papel','DINNER',60,60,9,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/07/scmuirw3amqn.jpg'),(480632106,'Tarte de peras','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/tarte-de-peras-2/ | Ingredientes: 250 g de farinha, 80 g de margarina, 1 ovo grande, Farinha para polvilhar, 4 peras, 4 gemas + 2 ovos, 2 latas de leite condensado, 200 g de leite','DINNER',60,60,6,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/04/flemlb2hd4cf-1.jpg'),(489289340,'Torta de café','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/torta-de-cafe-2/ | Ingredientes: 200 g de açúcar, 180 g de farinha, 7 ovos grandes, Margarina para untar, Açúcar para polvilhar, Papel vegetal, 200 g de manteiga amolecida, 150 g de açúcar em pó','DINNER',35,35,6,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/04/tq4rkselnddj-1.jpg'),(490552114,'Feijoada de lingueirão','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/feijoada-de-lingueirao/ | Ingredientes: 1 kg  Lingueirão, 1  Chouriço mouro, 600 g  Feijão-branco cozido, 2  Cenouras, 2  Tomates, 2  Cebolas, 2  Dentes de alho, 50 ml  Vinho branco','DINNER',45,0,4,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2025/11/mhes547pprua.jpg'),(503763351,'Pão-de-ló','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/pao-de-lo-2/ | Ingredientes: 250 g  açúcar, 170 g  farinha, 6  ovos + 3 gemas, 20 g  essência de baunilha, Margarina para untar, Farinha para polvilhar, Papel vegetal','DINNER',50,50,6,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2023/03/icsbhauxnhds-1.jpg'),(530147887,'Bolo Mármore','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/bolo-marmore-2/ | Ingredientes: 6  Ovos, 250 g  açúcar, 1 dl  água, 1 dl  óleo de girassol, 375 g  farinha, 1 colher (sopa)  fermento em pó, 4 colheres (sopa)  chocolate em pó, Óleo para untar','DINNER',110,110,7,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/04/lmfyeoiad3df-1.png'),(539513556,'Rissolinhos de atum com passas','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/rissolinhos-de-atum-com-passas-2/ | Ingredientes: 350 g de farinha, 500 g de água, 60 g de margarina, 3 Ovos, 1 pitada de sal, Farinha para polvilhar, Pão ralado para passar, Óleo para fritar','SNACK',60,60,24,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/04/zq9y1tllmbgh-1.jpg'),(551238356,'Bolo de banana e canela com sementes','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/bolo-de-banana-e-canela-com-sementes/ | Ingredientes: 4  bananas, 50 g  creme vegetal, 200 g  açúcar, 3  Ovos, 250 g  farinha, 2 dl  leite magro, 1 colher (sobremesa)  fermento em pó, 1 colher (sopa)  canela em pó','DINNER',60,60,8,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2025/10/hckabnguf504.jpg'),(558595468,'Bolo caseiro','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/bolo-caseiro-2/ | Ingredientes: 200 g  farinha, 200 g  açúcar, 100 g  margarina, 100 g  leite, 6  Ovos, 1 colher (chá)  fermento em pó, 1 casquinha  limão, Erva-doce q.b.','DINNER',70,70,6,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/04/ewen8xpwpuzi-1.jpg'),(572000999,'Sopa de feijão à moda da terra','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/sopa-de-feijao-a-moda-da-terra/ | Ingredientes: 200 g  Feijão vermelho cozido, 200 g  Abóbora, 600 g  Couve-lombarda, 1  Batata grande, 1  Cenoura grande, 1  Cebola, 2  Dentes de alho, 2 L  Água','DINNER',45,45,6,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2025/10/w8nchfn4dnwf.jpg'),(574371604,'Beringelas recheadas','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/beringelas-recheadas-2/ | Ingredientes: 4  beringelas, 1 colher (café)  sal, 1  cebola, 2 colheres (sopa)  azeite, 150 g  arroz, 2,5 dl  caldo de legumes, 250 g  carne picada, 8  rabanetes','SNACK',45,45,4,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/04/zznoylpap0qv-1.jpg'),(600034822,'Receita de bolo de maçã e canela','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/receita-de-bolo-de-maca-e-canela/ | Ingredientes: 250 g  farinha, 200 g  açúcar amarelo, 125 g  manteiga derretida, 4  Ovos, 3  maçãs grandes, 250 ml  leite magro, 1 colher (sobremesa)  fermento em pó, 1 colher (chá)  canela em pó','DINNER',60,0,6,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2023/10/ea1twfufhhrf.jpg'),(635345545,'Frango assado com maçã','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/frango-assado-com-maca-2/ | Ingredientes: 1  frango (de preferência do campo), 800 g  batatinhas, 4  maçãs vermelhas, 5 dentes  alho, 3 dl  vinho branco, 2 colheres (sopa)  banha, 1 colher (chá)  paprica, 1 raminho  alecrim','DINNER',120,120,6,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/04/ztmcb9kwhgba-1.jpg'),(647870794,'Frango dourado com cogumelos','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/frango-dourado-com-cogumelos-2/ | Ingredientes: 5 pernas  frango, 1 lata  cogumelos inteiros, 1 embalagem  sopa instantânea de cogumelos, 2 dl  vinho branco, 1 dl  água, Salsa picada q.b., Pimenta q.b.','DINNER',80,80,5,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2019/02/ug27lub46yx4.jpg'),(654582938,'Fusilli com pescada e cenoura','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/fusilli-com-pescada-e-cenoura-2/ | Ingredientes: 500 g  pescada congelada, 2  cenouras, 1  cebola, 3 dentes  alho, 500 g  massa fusilli, 4 colheres (sopa)  azeite, 5  tomates maduros, 1 ramo  salsa picada para polvilhar','DINNER',30,30,5,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2017/07/vyebz2wf1v05.jpg'),(675994745,'Bolinhos de canela','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/bolinhos-de-canela/ | Ingredientes: 300 g  Farinha tipo 55, 125 g  Manteiga à temperatura ambiente, 100 g  Açúcar, 1  Ovo M, q.b.  Canela em pó, q.b.  Papel vegetal','DINNER',35,0,12,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2017/01/lfsqxy9r80ol.jpg'),(709606371,'Torta de chocolate','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/torta-de-chocolate-2/ | Ingredientes: 150 g  farinha, 150 g  açúcar, 50 g  chocolate em pó, 100 g  chocolate em barra, 8  Ovos, 3 colheres (sopa)  natas, Manteiga para untar, Açúcar em pó para polvilhar','DINNER',45,45,4,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2023/03/a3ukss6lcieh.jpg'),(869046755,'Tarte folhada de natas e leite condensado','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/tarte-folhada-de-natas-e-leite-condensado/ | Ingredientes: 1 rolo  massa folhada estendida, 1 lata  leite condensado, 2  ovos m, 5  gemas m, 500 ml  natas, Canela em pó para polvilhar, Açúcar em pó para polvilhar','DINNER',55,55,7,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2025/10/yhipbtcv3kke.jpg'),(872663287,'Lombo assado à suíça','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/lombo-assado-a-suica-2/ | Ingredientes: 1 lombo  porco com aprox.1,200 kg, 250 g  queijo fatiado, 1  cebola grande, 4 dentes  alho, 1 lata grande  tomate pelado, 3 dl  vinho branco, 0,5 dl  azeite, 1 colher (chá)  pimentão-doce','DINNER',80,80,6,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2017/09/oewfeexjmn31-1.jpg'),(873908843,'Folar de carnes','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/folar-de-carnes-2/ | Ingredientes: 600 g de farinha, 120 g de manteiga amolaecida, 30 g de azeite, 6 ovos + 1 gema, 2 colheres (sopa) de  leite, 1 saqueta de fermento seco de padeiro, Sal q.b., Farinha para polvilhar','SNACK',60,60,8,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2021/04/9nc6im0jokbe-1.jpg'),(878711648,'Pavê de chocolate com nozes','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/pave-de-chocolate-com-nozes-2/ | Ingredientes: 80 g de açúcar, 60 g de farinha, 4 Ovos, Margarina para untar, Farinha para polvilhar, 1 frasco de cerejas em calda (aprox. 150g de cerejas + 100g de calda), 200 g de açúcar, 50 g de chocolate em pó','DINNER',70,70,7,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/07/atuiimyut6in.jpg'),(913876450,'Bolo brigadeiro','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/bolo-brigadeiro-2/ | Ingredientes: 250 g de farinha, 200 g de açúcar light, 5 Ovos, 1,5 dl de água bem quente, 0,5 dl de azeite, 4 colheres (sopa) de chocolate em pó, 1 colher (chá) de fermento, Margarina para untar','DINNER',60,60,8,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2016/03/llh1minjqzik-1.jpg'),(919152624,'Coelho à caçador','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/coelho-a-cacador-2/ | Ingredientes: 1  coelho pequeno, 150 g  cogumelos, 1  tomate, 1  cebola grande, 1 dente  alho, 3 dl  vinho tinto, 4 colheres (sopa)  azeite, 1 colher (sopa)  farinha','DINNER',0,80,4,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/04/mils77pxwfpl-1.jpg'),(951385385,'Legumes na air fryer','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/legumes-na-air-fryer/ | Ingredientes: 2  tomates, 1  curgetes, 1  beringelas, 1  cebolas, 1 colher (café)  açafrão-da-Índia, 1 folha  louro, 1 ramo  salsa, Sal q.b.','DINNER',30,0,2,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2025/10/l7anqjvgzkvl.jpg'),(965788290,'Tarte de coco com laranja','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/tarte-de-coco-com-laranja-2/ | Ingredientes: 1 rolo de massa quebrada estendida de compra, 200 g de coco ralado, 1 lata de leite condensado, 1 dl de  leite, 8 Ovos, Sumo de 1 laranja, Farinha para polvilhar, 2 dl de natas','DINNER',60,60,7,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/04/eiur16nderip-1.jpg'),(980829298,'Soufflé de bacalhau','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/souffle-de-bacalhau-2/ | Ingredientes: 400 g  migas de bacalhau demolhadas, 1  cebola grande, 2 dentes  alho, 6  Ovos, 400 g  leite, 40 g  farinha, 30 g  azeite, Salsa picada q.b.','DINNER',60,60,4,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/04/pgdkb1chzg2c-1.jpg'),(1010878470,'Crumble de maçã','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/crumble-de-maca-2/ | Ingredientes: 1,200 kg  maçãs, 100 g  farinha, 100 g  açúcar amarelo, 70 g  açúcar, 70 g  manteiga, 70 g  amêndoa moída, 1 colher (sobremesa)  canela em pó, Açúcar em pó para polvilhar','DINNER',60,60,6,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2017/10/j2nifcpbq4gi-1.jpg'),(1013933163,'Tortilha de alheira','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/tortilha-de-alheira/ | Ingredientes: 1  alheira, 5  batatas médias, 1  cebola pequena, 6  ovos M, Azeite q.b., Salsa q.b., Sal e pimenta de moinho q.b., Óleo para fritar','SNACK',0,0,2,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2025/10/xzjqmm21mk0c-1.jpg'),(1020146189,'Delícia de gelatina','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/delicia-de-gelatina-2/ | Ingredientes: 400 g  natas, 3 pacotes  gelatina de cores diferentes, 2  iogurtes açucarados naturais ou com aroma a gosto, 1 lata  leite condensado, 10 folhas  gelatina, Óleo para untar','DINNER',75,75,8,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2020/05/uahyh94ccnc3-1.jpg'),(1042992606,'Receita de Pataniscas de bacalhau','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/receita-de-pataniscas-de-bacalhau/ | Ingredientes: 1 posta grande  Bacalhau demolhada, 1/2  Cebola, 2  Ovos M, 1  Raminho de salsa, q.b.  Farinha com fermento, q.b.  Sal e pimenta preta, Óleo para fritar','SNACK',0,45,5,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2023/10/7yuhow0s4myx.jpg'),(1079841445,'Ensopado de bacalhau','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/ensopado-de-bacalhau-2/ | Ingredientes: 600 g  bacalhau demolhado, 1 kg  batatas, 2  tomates maduros, 3  cebolas, 4 dentes  alho, 1,5 dl  azeite, 1,5 dl  vinho branco, 1 colher (sopa)  colorau','DINNER',90,90,5,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/04/pve6gnit3ubr-1.jpg'),(1181933377,'Charlotte de morangos','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/charlotte-de-morangos-2/ | Ingredientes: 4 Ovos, 100 g de açúcar, 100 g de farinha, 200 g de doce de morango de compra, Margarina para untar, Açúcar para polvilhar, 500 g de morangos, Sumo de 1/2 limão','DINNER',90,90,8,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/04/yugexfabp389-1.jpg'),(1196671865,'Empadinhas de carne','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/empadinhas-de-carne/ | Ingredientes: 1 placa  massa folhada, 500 g  carne picada, 100 g  milho, 1/2 lata  tomate em cubos, 1  cebola, 2 dentes  alho, 1 colher (chá)  pimentão-doce fumado, 1 colher (chá)  cominhos','DINNER',35,35,12,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2025/10/dticeeb0muay.jpg'),(1199145546,'Pudim de morangos','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/pudim-de-morangos-2/ | Ingredientes: 750 g  morangos, 270 g  açúcar, 1 lata  leite condensado, 8  claras, 10 folhas  gelatina','DINNER',60,60,6,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/04/mqmculsue6pp-1.jpg'),(1210867086,'Cupcakes','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/cupcakes-2/ | Ingredientes: 400 g  natas frescas, 350 g  farinha, 300 g  açúcar + açúcar q.b., 220 g  manteiga, 100 g  leite, 5  ovos grandes, 1 colher (chá)  essência de baunilha, 1 colher (chá) bem cheia  fermento em pó','DINNER',60,60,12,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2016/11/hypz1les4ceb.jpg'),(1234234293,'Rolo folhado com creme pasteleiro','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/rolo-folhado-com-creme-pasteleiro-2/ | Ingredientes: 400 g  massa folhada, 100 g  açúcar, 40 g  farinha, 2,5 dl  leite, 2  gemas + 1 ovo, Farinha para polvilhar, Açúcar em pó para polvilhar','DINNER',70,70,5,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/04/zjlc4rfoa00n-1.jpg'),(1252934533,'Chocos com puré de couve-flor','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/chocos-com-pure-de-couve-flor-2/ | Ingredientes: 1,200 kg de choquinhos, 2 dentes de alho, 2 colheres (sopa) de azeite, 1 folha de louro, Sal e pimenta q.b., 1 couve-flor grande, 1 L de leite gordo, 2 colheres (sopa) de  manteiga','DINNER',35,35,4,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/04/ozsxlm6ech38-1.jpg'),(1260961240,'Doce de abóbora, Vinho do Porto e amêndoa','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/doce-de-abobora-vinho-do-porto-e-amendoa-2/ | Ingredientes: 1 kg  abóbora amarela descascada e sem sementes, 900 g  açúcar, 100 g  amêndoa palitada, 2 dl  Vinho do Porto Tawny, 1 dl  água, 1 casquinha  limão','DINNER',90,90,12,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/04/tqe7fnhryqtg-1.jpg'),(1288466853,'Lombinhos de salmão com camarão','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/lombinhos-de-salmao-com-camarao-2/ | Ingredientes: 4 lombinhos  salmão, 200 g  miolo de camarão, 3 dentes  alho, 1 dl  azeite, 1 dl  aguardente, Sumo de limão q.b., Coentros q.b., Sal e piripiri q.b','DINNER',35,35,4,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/04/ivyrzaiw8czx-1.jpg'),(1299647869,'Folhados de bacalhau','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/folhados-de-bacalhau-2/ | Ingredientes: 800 g  massa folhada (2 placas grossas), 600 g  bacalhau demolhado, 200 g  leite + 2 colheres (sopa) de leite, 60 g  farinha, 2  cenouras, 1  cebola, 2 dentes  alho, 30 g  azeite','DINNER',80,80,12,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/04/lt2m1ckvq23f-1.jpg'),(1337286935,'Sopa da pedra','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/sopa-da-pedra-2/ | Ingredientes: 1 orelha  porco, 1  chispe, 1 chouriço  carne, 1 morcela  cozer, 1  farinheira, 500 g  feijão encarnado de lata, 450 g  batatas, 200 g  couve lombarda','DINNER',75,75,8,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/04/m1eyn4bqh0dk-1.jpg'),(1340332637,'Bolo económico de chocolate','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/bolo-economico-de-chocolate-2/ | Ingredientes: 250 g de farinha, 160 g de açúcar, 90 g de chocolate em pó, 2 Ovos, 2 dl de leite, 2 dl de óleo, 1 colher (sobremesa) de fermento em pó, Margarina para untar','DINNER',0,50,7,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/04/cybrbs3wvlys-1.jpg'),(1451628678,'Sopa de peixe à moda da terra','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/sopa-de-peixe-a-moda-da-terra/ | Ingredientes: 0,5 kg  pescada ou outro peixe, 0,5 kg  mexilhões, 1 lata  tomate em pedaços ((390 g)), 1  cebola, 2 dentes  alho, 1 pacote  sopa instantânea de marisco ((cerca de 75 g)), 1,5 L  água, 100 ml  azeite','DINNER',45,45,4,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2022/02/dxu3ozfx7enn.jpg'),(1482099505,'Tortilha de borrego','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/tortilha-de-borrego-2/ | Ingredientes: 400 g  carne de borrego limpa, 1/2  Pimento Vermelho, 1/2  pimento verde, 1  tomate, 1  cebola, 1 dente  alho, 6  Ovos, 2 colheres (sopa)  azeite','DINNER',50,50,4,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/04/dakkrcos6rqc-1.jpg'),(1519008198,'Pastéis de massa tenra','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/pasteis-de-massa-tenra-2/ | Ingredientes: 500 g  sobras de carne de vaca estufada com o molho, 300 g  farinha + 1 colher (sopa) bem cheia de farinha, Sal fino q.b., 40 g  margarina amolecida, 40 g  banha amolecida, 1,5 dl  água, Farinha para polvilhar, Óleo para fritar','SNACK',60,60,24,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/04/gxslya4eykbj-1.jpg'),(1521129629,'Bolo moka cremoso','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/bolo-moka-cremoso-2/ | Ingredientes: 200 g de farinha, 200 g de açúcar, 6 ovos grandes, 1,5 dl de café açucarado, 1 colher (chá) de fermento, Margarina para untar, Farinha para polvilhar, 125 g de  manteiga','DINNER',60,60,8,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/04/t0g5sudgeuqr-1.jpg'),(1522112256,'Omelete de forno com frango','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/omelete-de-forno-com-frango/ | Ingredientes: 100 g  frango cozido, 4  Ovos, 1  tomate não muito maduro, 1/2  cebola, Salsa picada q.b., Sal e pimenta q.b.','SNACK',25,25,2,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2025/10/5fuafyu2qeke.jpg'),(1531856906,'Bolo de pêssegos','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/bolo-de-pessegos-2/ | Ingredientes: 800 g  pêssegos, 100 g  margarina, 250 g  açúcar, Raspa de limão q.b., 5  Ovos, 250 g  farinha, 1 colher (chá)  fermento em pó, 100 g  sultanas','DINNER',75,75,6,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/04/aa0qzqxjinqx.jpg'),(1551136234,'Bolo de cenoura e passas','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/bolo-de-cenoura-e-passas-2/ | Ingredientes: 255 g  açúcar, 165 g  farinha, 160 g  cenoura, 60 g  passas ou sultanas, 2  Ovos, 1,2 dl  óleo, 1 colher (chá)  fermento em pó, 1 colher (chá)  bicarbonato','DINNER',60,60,6,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/07/8iaxzb1dpabj.jpg'),(1557401717,'Broa de milho com chouriço','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/broa-de-milho-com-chourico/ | Ingredientes: 600 g  Farinha de milho, 400 g  Farinha de trigo, 100 g  Chouriço, 10 g  Fermento de padeiro seco, 700 ml  Água, 2 colheres (chá)  Sal grosso, para polvilhar  Farinha de milho','DINNER',60,0,6,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2025/10/npn0nfzwz17z.jpg'),(1558842502,'Frango recheado com cuscuz e frutos secos','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/frango-recheado-com-cuscuz-e-frutos-secos-2/ | Ingredientes: 1  frango com aprox. 1,200 kg, 200 g  cuscuz, 75 g  frutos secos (alperces, ameixas e figos), 50 g  passas demolhadas, 25 g  pinhões, 2 dentes  alho, 15 g  manteiga, 6 colheres (sopa)  azeite','DINNER',85,85,4,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/07/xceznybnszwn.jpg'),(1590231195,'Moqueca de peixe','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/moqueca-de-peixe-2/ | Ingredientes: 1 kg  peixe para caldeirada (safio, raia, tamboril, etc.), 4  tomates maduros, 1  pimento vermelho pequeno, 1  pimento verde pequeno, 1  cebola, 2 dentes  alho, 0,5 dl  azeite, 4 dl  leite de coco','DINNER',60,60,4,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/04/v7p5v3hexkkc-1.jpg'),(1597079113,'Arroz de peixe com courgette','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/arroz-de-peixe-com-courgette-2/ | Ingredientes: 700 g  postas de garoupa, 400 g  arroz carolino, 1 lata pequena  tomate pelado, 1  courgette, 1  cebola, 3 dentes  alho, 1 dl  azeite, 1 folha  louro','DINNER',60,60,5,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/04/zp2mx7qemgns-1.jpg'),(1600780980,'Sopa de cotovelinhos com pescada e hortelã','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/sopa-de-cotovelinhos-com-pescada-e-hortela/ | Ingredientes: 250 g  massa cotovelinhos, 4 filetes  pescada, 2  anchovas, 3 dentes  alho, 200 g  polpa de tomate, 100 ml  vinho branco, 1 colher (sopa)  manteiga, 1 colher (chá)  massa de pimentão','DINNER',50,50,4,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2025/10/bwxwpeaxvekp.jpg'),(1627043030,'Bolo do convento','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/bolo-do-convento-2/ | Ingredientes: 300 g  farinha, 300 g  açúcar, 150 g  margarina, 5  Ovos, 1 dl  leite, 0,5 dl  aguardente, 1 colher (sobremesa)  fermento em pó, Margarina para untar','DINNER',60,60,6,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/04/io28lbufdkge-1.jpg'),(1629543231,'Bolinhos de coco','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/bolinhos-de-coco-2/ | Ingredientes: 200 g  coco ralado, 150 g  açúcar, 4  ovos grandes, 8  cerejas cristalizadas, Caixinhas de papel','DINNER',40,40,16,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/04/q4zhu1unjijl-1.jpg'),(1660802705,'Carne de porco com enchidos','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/carne-de-porco-com-enchidos-2/ | Ingredientes: 1,500 kg  perna de porco limpa, 1 chouriço  carne, 1  morcela, 1  alheira, 1  farinheira, 3 dentes  alho, 4 colheres (sopa)  banha, 2 colheres (sopa)  massa de pimentão','DINNER',105,105,6,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/09/rkuug7a8rcqw.jpg'),(1662609012,'Sopa creme de alho-francês','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/sopa-creme-de-alho-frances/ | Ingredientes: 50 g  margarina, 1  alho-francês grande, 1,2 l  caldo de galinha, 0, 5 kg  batatas, 1 gema  ovo;, 1/2 colher (sopa)  margarina, Sal q.b.','DINNER',30,30,4,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2018/11/9fmzraaekrdm.jpg'),(1664590210,'Morgado do Bussaco','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/morgado-do-bussaco/ | Ingredientes: PARA O BOLO, 200 g  açúcar, 200 g  miolo de noz em pó, 10  claras M, q.b.  Miolo de noz, Manteiga para untar, q.b.  Papel vegetal, PARA O DOCE DE OVOS','DINNER',0,60,8,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2025/10/3osl7pv9sfa6.jpg'),(1676662359,'Sopa do mar com alho francês','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/sopa-do-mar-com-alho-frances-2/ | Ingredientes: 200 g  delícias do mar, 500 g  batatas, 3  alhos-franceses, 1  cebola, 5 colheres (sopa)  azeite, 1 cubo  caldo de legumes, Sal q.b.','DINNER',40,40,5,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/04/uvzbh7nj4dl9-1.jpg'),(1682201490,'Frango com molho picante','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/frango-com-molho-picante-2/ | Ingredientes: 1  frango, 3 dentes  alho, 4 dl  vinho branco, 4 colheres (sopa)  azeite, 1 colher (sobremesa)  paprica, Sumo de 1 limão, 2  malaguetas, 1 folha  louro','DINNER',70,70,5,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2021/01/oqchcd0jxoqd-1.jpg'),(1687915653,'Arroz de bacalhau à antiga','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/arroz-de-bacalhau-a-antiga-2/ | Ingredientes: 3 postas  bacalhau, 1  cebola grande, 2 dentes  alho, 350 g  arroz carolino, 500 g  tomates maduros, 4 colheres (sopa)  azeite, 1 folha  louro, Coentros q.b.','DINNER',60,60,4,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2023/11/uurl3x1cm6ml-1.png'),(1689524564,'Empadas de camarão na air fryer','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/empadas-de-camarao-na-air-fryer/ | Ingredientes: 2 rolos  massa folhada estendida, 300 g  miolo de camarão, 300 g  miolo de amêijoa, 1  cebola, 2 dentes  alho, 1  ovo m, 2 colheres (sopa)  manteiga, 1 colher (sopa)  polpa de tomate','SNACK',80,80,4,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2025/10/qn4119stqwy9.jpg'),(1699792731,'Bolo de peras','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/bolo-de-peras-2/ | Ingredientes: 5  peras, 350 g  farinha, 350 g  açúcar, 100 g  margarina, 8  Ovos, 1 dl  leite quente, 1 colher (sobremesa) bem cheia  fermento em pó, Margarina para untar','DINNER',60,60,9,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/09/pnzyanrsp3hi.jpg'),(1733514211,'Bolo de Carnaval','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/bolo-de-carnaval-2/ | Ingredientes: 80 g de chocolate em barra, 250 g de manteiga amolecida, 300 g de açúcar, 4 Ovos, 270 g de farinha, 1 colher (sopa) de fermento em pó, 1 colher (café) de corante alimentar vermelho, Manteiga para barrar','DINNER',80,80,6,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2021/02/dc7umrijcvj7-1.jpg'),(1740032361,'Cheesecake de maracujá','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/cheesecake-de-maracuja-2/ | Ingredientes: 200 g de bolachas tipo Maria, 200 g de queijo creme, 100 g de  manteiga, 4 dl de natas frescas, 1 lata de leite condensado, 9 folhas de gelatina, 800 g de maracujás, 200 g de açúcar','DINNER',60,60,6,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/04/eopipbukl0jk.jpg'),(1786482033,'Cheesecake de chocolate','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/cheesecake-de-chocolate-2/ | Ingredientes: 200 g de bolacha água e sal, 1 colher (sopa) de cacau em pó, 1 colher (sopa) de chocolate em pó, 1 colher (sopa) de açúcar em pó, 100 g de margarina vegetal, 1 tablete de chocolate em barra (70% de cacau), 7 folhas de gelatina, 360 g de requeijão (2 unidades)','DINNER',40,40,8,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/04/jeudi31nirg1-1.jpg'),(1788366663,'Queques na air fryer','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/queques-na-air-fryer/ | Ingredientes: 175 g  farinha, 150 g  manteiga derretida, 125 g  açúcar, 5  claras m, 50 ml  leite, 1 colher (sopa)  brandy, 1 colher (chá)  fermento em pó, sumo e raspa de 1 laranja','DINNER',30,30,11,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2025/10/qjykcj2tg9iy.jpg'),(1799961234,'Cavacas de Resende','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/cavacas-de-resende-2/ | Ingredientes: 950 g  açúcar, 140 g  farinha, 140 g  farinha de milho, 8  ovos + 7 gemas, 6 dl  água, 2 paus  canela, 2 casquinhas  limão, Margarina para untar','DINNER',60,60,12,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/04/lbju9hgul3rn-1.png'),(1809489076,'Enchidos marinados com broa','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/enchidos-marinados-com-broa-2/ | Ingredientes: 2 chouriços  carne, 2  linguiças, 1  morcela, 1  alheira, 6 fatias  broa de milho, 2 dentes  alho, 1 dl  Vinho do Porto, 1 dl  azeite','SNACK',20,20,4,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/04/g4jevzf89jqf-1.jpg'),(1891494220,'Tarte de natas','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/tarte-de-natas/ | Ingredientes: 1 rolo  massa folhada estendida, 400 g  leite, 200 g  açúcar, 4  Ovos, 4  gemas, 200 ml  natas, 1 colher (sopa)  farinha maisena bem cheia','DINNER',0,45,6,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2020/06/p4jwkonsmqpl.jpg'),(1922362412,'Panquecas com fruta','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/panquecas-com-fruta/ | Ingredientes: 300 g  farinha de trigo com fermento, 70 g  manteiga derretida, 50 g  açúcar, 2  ovos M, 300 ml  leite meio gordo, Banana e mirtilos q.b., Mel q.b., Açúcar e canela em pó q.b.','DINNER',0,0,2,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2025/10/rhuz7ji7gtxl-1.jpg'),(1992713063,'Caldeirada de peixe','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/caldeirada-de-peixe-2/ | Ingredientes: 1,200 kg  peixe variado para caldeirada, 1 kg  batatas, 1  Pimento Vermelho, 1  pimento verde, 1  cebola grande, 2 dentes  alho, 1 lata pequena  tomate em pedaços, 50 g  azeite','DINNER',50,50,6,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/04/zh0edjdqggys-1.jpg'),(2016920440,'Bife à portuguesa','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/bife-a-portuguesa-2/ | Ingredientes: 4  Bifes da vazia altos, 4  Fatias de presunto, 4  Batatas, 2  Dentes de alho, 50 g  Manteiga, 1 dl  Azeite, 1,5 dl  Vinho branco, 1 colher (sopa)  Mostarda','DINNER',0,40,4,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2023/02/jdluwsamkg8z.jpg'),(2040336820,'Broas na air fryer','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/broas-na-air-fryer/ | Ingredientes: 500 g  farinha, 300 g  açúcar amarelo, 150 g  miolo de noz, 2,5 dl  azeite, 0,5 l  água, 2 colheres  sopa de mel, 1 colher  chá de canela, ½ colher  chá de erva-doce moída','DINNER',0,30,6,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2025/10/lbndrl00pvn0.jpg'),(2058966420,'Creme de camarão com natas','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/creme-de-camarao-com-natas/ | Ingredientes: 500 g  camarões, 300 g  tomate pelado, 1  cenoura, 1/2  alho-francês, 1  cebola, 4 dentes  alho, 100 ml  natas, 2 colheres (sopa)  farinha maisena','DINNER',60,60,5,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2019/03/21ib6zsl7nwb.jpg'),(2113411215,'Castanhas na air fryer','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/castanhas-na-air-fryer/ | Ingredientes: 1 kg  Castanhas, q.b.  Sal Grosso','SNACK',0,0,4,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2025/10/9njueppkocdd.jpg'),(2130827411,'Sopa do balde','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/sopa-do-balde/ | Ingredientes: 700 g  entremeada, 1/2 chouriço  carne, 600 g  batatas, 500 g  couve lombarda limpa, 1 lata grande  feijão manteiga, 1  nabo com a rama, 2  cenouras, 2  alhos-franceses','DINNER',120,120,7,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2017/11/ukuibvjpdxbi.jpg'),(2133261208,'Frango em franjas','Fonte: TeleCulinaria | URL: https://teleculinaria.pt/receitas/frango-em-franjas-2/ | Ingredientes: 1  cebola, 2 dentes  alho, 1 dl  azeite, 1 lata grande  tomate pelado, 1 colher (chá)  orégãos, Sal e pimenta q.b., 1  frango assado ou estufado, 1 ramo  salsa picada','DINNER',45,45,6,0,0,0,0,'https://teleculinaria.pt/wp-content/uploads/2015/04/d6n6yl6mxf3m-1.jpg');
/*!40000 ALTER TABLE `recipes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_profile_allergens`
--

DROP TABLE IF EXISTS `user_profile_allergens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_profile_allergens` (
  `user_id` int NOT NULL,
  `allergen` varchar(100) NOT NULL,
  PRIMARY KEY (`user_id`,`allergen`),
  CONSTRAINT `user_profile_allergens_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_profile_allergens`
--

LOCK TABLES `user_profile_allergens` WRITE;
/*!40000 ALTER TABLE `user_profile_allergens` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_profile_allergens` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_profile_restrictions`
--

DROP TABLE IF EXISTS `user_profile_restrictions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_profile_restrictions` (
  `user_id` int NOT NULL,
  `restriction` varchar(100) NOT NULL,
  PRIMARY KEY (`user_id`,`restriction`),
  CONSTRAINT `user_profile_restrictions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_profile_restrictions`
--

LOCK TABLES `user_profile_restrictions` WRITE;
/*!40000 ALTER TABLE `user_profile_restrictions` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_profile_restrictions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_profiles`
--

DROP TABLE IF EXISTS `user_profiles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_profiles` (
  `user_id` int NOT NULL,
  `age` int DEFAULT NULL,
  `sex` varchar(20) DEFAULT NULL,
  `height_cm` int DEFAULT NULL,
  `weight_kg` double DEFAULT NULL,
  `goal` varchar(100) DEFAULT NULL,
  `daily_calories` int DEFAULT NULL,
  `budget_weekly` double DEFAULT NULL,
  `streak_count` int NOT NULL DEFAULT '0',
  `last_meal_photo_date` date DEFAULT NULL,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `user_profiles_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_profiles`
--

LOCK TABLES `user_profiles` WRITE;
/*!40000 ALTER TABLE `user_profiles` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_profiles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_recipe_ratings`
--

DROP TABLE IF EXISTS `user_recipe_ratings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_recipe_ratings` (
  `user_id` int NOT NULL,
  `recipe_id` int NOT NULL,
  `rating` tinyint NOT NULL,
  `rated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`,`recipe_id`),
  KEY `idx_ratings_recipe` (`recipe_id`),
  CONSTRAINT `user_recipe_ratings_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `user_recipe_ratings_ibfk_2` FOREIGN KEY (`recipe_id`) REFERENCES `recipes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `user_recipe_ratings_chk_1` CHECK ((`rating` between 1 and 5))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_recipe_ratings`
--

LOCK TABLES `user_recipe_ratings` WRITE;
/*!40000 ALTER TABLE `user_recipe_ratings` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_recipe_ratings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) DEFAULT NULL,
  `email` varchar(255) NOT NULL,
  `password_hash` text NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-02-14 20:27:00
