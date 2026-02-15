package alnak.data.global;

import io.github.cdimascio.dotenv.Dotenv;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

public class GlobalDatabase
{

    private static GlobalDatabase instance;
    private final Connection connection;
    private final ThreadLocal<Connection> threadConnection;
    private final String jdbcUrl;
    private final Set<Connection> openedConnections;

    private static final Dotenv DOTENV = Dotenv.configure()
            .ignoreIfMissing()
            .load();

    private static final String HOST = readConfig("MYSQL_HOST", "DB_HOST", "localhost");
    private static final String PORT = readConfig("MYSQL_PORT", "DB_PORT", "3306");
    private static final String DB_NAME = readConfig("MYSQL_DB", "DB_NAME", "meal_planner_users");
    private static final String USER = readConfig("MYSQL_USER", "DB_USER", "root");
    private static final String PASSWORD = readConfig("MYSQL_PASS", "DB_PASS", "");
    private static final String PARAMS = sanitizeParams(
            readConfig(
                    "MYSQL_PARAMS",
                    "DB_PARAMS",
                    "useSSL=true&serverTimezone=UTC&allowPublicKeyRetrieval=true"
            )
    );

    private GlobalDatabase() {
        try {
            this.jdbcUrl = String.format(
                    "jdbc:mysql://%s:%s/%s?%s",
                    HOST, PORT, DB_NAME, PARAMS
            );

            this.threadConnection = new ThreadLocal<>();
                this.openedConnections = ConcurrentHashMap.newKeySet();
            this.connection = (Connection) Proxy.newProxyInstance(
                    Connection.class.getClassLoader(),
                    new Class[]{Connection.class},
                    (proxy, method, args) -> {
                        String name = method.getName();

                        if ("close".equals(name)) {
                            Connection c = threadConnection.get();
                            if (c != null) {
                                try {
                                    if (!c.isClosed()) {
                                        c.close();
                                    }
                                } finally {
                                    openedConnections.remove(c);
                                    threadConnection.remove();
                                }
                            }
                            return null;
                        }

                        Connection c = currentConnection();
                        try {
                            return method.invoke(c, args);
                        } catch (InvocationTargetException e) {
                            throw e.getCause();
                        }
                    }
            );

            Runtime.getRuntime().addShutdownHook(new Thread(this::closeAllOpenedConnections));

            initSchema();
            System.out.println("MySQL connected: " + HOST + ":" + PORT + "/" + DB_NAME);
        } catch (SQLException e) {
            throw new RuntimeException("Failed to connect to MySQL: " + e.getMessage(), e);
        }
    }

    public static synchronized GlobalDatabase getInstance() {
        if (instance == null) instance = new GlobalDatabase();
        return instance;
    }

    public Connection getConnection() {
        return connection;
    }

    private Connection currentConnection() throws SQLException {
        Connection c = threadConnection.get();
        if (c == null || c.isClosed()) {
            c = DriverManager.getConnection(jdbcUrl, USER, PASSWORD);
            threadConnection.set(c);
            openedConnections.add(c);
        }
        return c;
    }

    private void closeAllOpenedConnections() {
        for (Connection c : openedConnections) {
            try {
                if (c != null && !c.isClosed()) {
                    c.close();
                }
            } catch (SQLException ignored) {
            }
        }
        openedConnections.clear();
    }

    private void initSchema() throws SQLException {
        try (Statement s = connection.createStatement()) {

            // ── Users ─────────────────────────────────────────────
            s.executeUpdate("""
                CREATE TABLE IF NOT EXISTS users (
                    id            INT PRIMARY KEY AUTO_INCREMENT,
                    name          VARCHAR(255),
                    email         VARCHAR(255) NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """);

            s.executeUpdate("""
                CREATE TABLE IF NOT EXISTS user_profiles (
                    user_id               INT PRIMARY KEY,
                    age                   INT,
                    sex                   VARCHAR(20),
                    height_cm             INT,
                    weight_kg             DOUBLE,
                    goal                  VARCHAR(100),
                    daily_calories        INT,
                    budget_weekly         DOUBLE,
                    streak_count          INT NOT NULL DEFAULT 0,
                    last_meal_photo_date  DATE,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            """);

            ensureColumnExists(s, "user_profiles", "streak_count", "INT NOT NULL DEFAULT 0");
            ensureColumnExists(s, "user_profiles", "last_meal_photo_date", "DATE");

            s.executeUpdate("""
                CREATE TABLE IF NOT EXISTS user_profile_restrictions (
                    user_id     INT         NOT NULL,
                    restriction VARCHAR(100) NOT NULL,
                    PRIMARY KEY (user_id, restriction),
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            """);

            s.executeUpdate("""
                CREATE TABLE IF NOT EXISTS user_profile_allergens (
                    user_id  INT         NOT NULL,
                    allergen VARCHAR(100) NOT NULL,
                    PRIMARY KEY (user_id, allergen),
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            """);

            // ── Friendships ───────────────────────────────────────
            s.executeUpdate("""
                CREATE TABLE IF NOT EXISTS friendships (
                    requester_id INT         NOT NULL,
                    addressee_id INT         NOT NULL,
                    status       VARCHAR(20) NOT NULL DEFAULT 'PENDING',
                    created_at   DATETIME    DEFAULT CURRENT_TIMESTAMP,
                    updated_at   DATETIME    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    PRIMARY KEY (requester_id, addressee_id),
                    FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (addressee_id) REFERENCES users(id) ON DELETE CASCADE,
                    CHECK (requester_id <> addressee_id)
                )
            """);

            // ── Recipes (mirrored from local SQLite) ──────────────
            s.executeUpdate("""
                CREATE TABLE IF NOT EXISTS recipes (
                    id            INT PRIMARY KEY,
                    name          VARCHAR(255) NOT NULL,
                    description   TEXT,
                    meal_type     VARCHAR(50)  NOT NULL,
                    prep_time_min INT          DEFAULT 0,
                    cook_time_min INT          DEFAULT 0,
                    servings      INT          DEFAULT 2,
                    calories      DOUBLE       DEFAULT 0,
                    protein_g     DOUBLE       DEFAULT 0,
                    carbs_g       DOUBLE       DEFAULT 0,
                    fat_g         DOUBLE       DEFAULT 0,
                    image_url     VARCHAR(500)
                )
            """);

            // ── Meal plans (global per user) ─────────────────────
            s.executeUpdate("""
                CREATE TABLE IF NOT EXISTS meal_plans (
                    id         INT PRIMARY KEY AUTO_INCREMENT,
                    user_id    INT          NOT NULL,
                    created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
                    week_start DATE,
                    status     VARCHAR(20)  DEFAULT 'ACTIVE',
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            """);

            s.executeUpdate("""
                CREATE TABLE IF NOT EXISTS meal_plan_meals (
                    id            INT PRIMARY KEY AUTO_INCREMENT,
                    meal_plan_id  INT         NOT NULL,
                    recipe_id     INT         NOT NULL,
                    day_of_week   INT         NOT NULL,
                    meal_type     VARCHAR(50) NOT NULL,
                    is_completed  TINYINT     DEFAULT 0,
                    photo_path    VARCHAR(500),
                    completed_at  DATETIME,
                    FOREIGN KEY (meal_plan_id) REFERENCES meal_plans(id) ON DELETE CASCADE,
                    FOREIGN KEY (recipe_id)    REFERENCES recipes(id)
                )
            """);

            // ── User–Recipe ratings ───────────────────────────────
            s.executeUpdate("""
                CREATE TABLE IF NOT EXISTS user_recipe_ratings (
                    user_id    INT NOT NULL,
                    recipe_id  INT NOT NULL,
                    rating     TINYINT NOT NULL,
                    rated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    PRIMARY KEY (user_id, recipe_id),
                    FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE,
                    FOREIGN KEY (recipe_id) REFERENCES recipes(id)  ON DELETE CASCADE,
                    CHECK (rating BETWEEN 1 AND 5)
                )
            """);

            // ── Posts ─────────────────────────────────────────────
            s.executeUpdate("""
                CREATE TABLE IF NOT EXISTS posts (
                    id           INT PRIMARY KEY AUTO_INCREMENT,
                    user_id      INT          NOT NULL,
                    recipe_id    INT          NOT NULL,
                    picture_path VARCHAR(500) NOT NULL,
                    description  TEXT,
                    rating       TINYINT      NOT NULL,
                    created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE,
                    FOREIGN KEY (recipe_id) REFERENCES recipes(id),
                    CHECK (rating BETWEEN 1 AND 5)
                )
            """);

            // ── Post interactions (kudos + comments) ─────────────
            s.executeUpdate("""
                CREATE TABLE IF NOT EXISTS post_kudos (
                    post_id    INT       NOT NULL,
                    user_id    INT       NOT NULL,
                    created_at DATETIME  DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (post_id, user_id),
                    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            """);

            s.executeUpdate("""
                CREATE TABLE IF NOT EXISTS post_comments (
                    id         INT PRIMARY KEY AUTO_INCREMENT,
                    post_id    INT         NOT NULL,
                    user_id    INT         NOT NULL,
                    text       TEXT        NOT NULL,
                    created_at DATETIME    DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            """);

            // ── Indexes ───────────────────────────────────────────
            createIndexIfMissing(s, "CREATE INDEX idx_users_email      ON users(email)");
            createIndexIfMissing(s, "CREATE INDEX idx_friendships_addr ON friendships(addressee_id)");
            createIndexIfMissing(s, "CREATE INDEX idx_posts_user       ON posts(user_id)");
            createIndexIfMissing(s, "CREATE INDEX idx_posts_recipe     ON posts(recipe_id)");
            createIndexIfMissing(s, "CREATE INDEX idx_post_kudos_user  ON post_kudos(user_id)");
            createIndexIfMissing(s, "CREATE INDEX idx_post_comments_post ON post_comments(post_id)");
            createIndexIfMissing(s, "CREATE INDEX idx_post_comments_user ON post_comments(user_id)");
            createIndexIfMissing(s, "CREATE INDEX idx_ratings_recipe   ON user_recipe_ratings(recipe_id)");
            createIndexIfMissing(s, "CREATE INDEX idx_meal_plans_user  ON meal_plans(user_id)");
            createIndexIfMissing(s, "CREATE INDEX idx_meal_plans_week  ON meal_plans(week_start)");
            createIndexIfMissing(s, "CREATE INDEX idx_mp_meals_plan    ON meal_plan_meals(meal_plan_id)");
        }
    }

    private void createIndexIfMissing(Statement s, String sql) throws SQLException {
        try {
            s.executeUpdate(sql);
        } catch (SQLException e) {
            if (e.getErrorCode() == 1061) {
                return;
            }
            if (e.getMessage() != null && e.getMessage().toLowerCase().contains("duplicate key name")) {
                return;
            }
            throw e;
        }
    }

    private void ensureColumnExists(Statement s, String table, String column, String definition) throws SQLException {
        try {
            s.executeUpdate("ALTER TABLE " + table + " ADD COLUMN " + column + " " + definition);
        } catch (SQLException e) {
            if (e.getErrorCode() == 1060) {
                return;
            }
            String message = e.getMessage();
            if (message != null && message.toLowerCase().contains("duplicate column name")) {
                return;
            }
            throw e;
        }
    }

    private static String readConfig(String mysqlKey, String dbKey, String defaultValue) {
        String value = firstNonBlank(
                System.getenv(mysqlKey),
                System.getenv(dbKey),
                DOTENV.get(mysqlKey),
                DOTENV.get(dbKey)
        );
        return value != null ? value : defaultValue;
    }

    private static String firstNonBlank(String... candidates) {
        for (String candidate : candidates) {
            if (candidate != null && !candidate.isBlank()) {
                return candidate.trim();
            }
        }
        return null;
    }

    private static String sanitizeParams(String rawParams) {
        if (rawParams == null || rawParams.isBlank()) {
            return "useSSL=true&serverTimezone=UTC&allowPublicKeyRetrieval=true";
        }
        String trimmed = rawParams.trim();
        if (trimmed.startsWith("?")) {
            return trimmed.substring(1);
        }
        return trimmed;
    }
}
