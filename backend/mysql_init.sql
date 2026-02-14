-- MySQL bootstrap for Bugsbyte backend
-- Matches backend/.env:
-- DB_HOST=localhost
-- DB_PORT=3306
-- DB_NAME=bugsbyte
-- DB_USER=bugsbyte
-- DB_PASS=uma_password_forte

CREATE DATABASE IF NOT EXISTS `bugsbyte`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

CREATE USER IF NOT EXISTS 'bugsbyte'@'localhost'
  IDENTIFIED BY 'uma_password_forte';

CREATE USER IF NOT EXISTS 'bugsbyte'@'127.0.0.1'
  IDENTIFIED BY 'uma_password_forte';

ALTER USER 'bugsbyte'@'localhost'
  IDENTIFIED BY 'uma_password_forte';

ALTER USER 'bugsbyte'@'127.0.0.1'
  IDENTIFIED BY 'uma_password_forte';

GRANT ALL PRIVILEGES ON `bugsbyte`.* TO 'bugsbyte'@'localhost';
GRANT ALL PRIVILEGES ON `bugsbyte`.* TO 'bugsbyte'@'127.0.0.1';

FLUSH PRIVILEGES;
