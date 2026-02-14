package alnak.data.local;

import java.nio.file.Files;
import java.nio.file.Path;
import java.io.IOException;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

public class LocalDatabase {

    private static final Path DB_DIR = Path.of("database");
    private static final String DB_FILE_NAME = "meal_planner.db";
    private static final Path LEGACY_DB_PATH = Path.of(DB_FILE_NAME);
    private static LocalDatabase instance;
    private Connection connection;

    private LocalDatabase() {
        try {
            Path dbPath = DB_DIR.resolve(DB_FILE_NAME).toAbsolutePath().normalize();
            Path legacyPath = LEGACY_DB_PATH.toAbsolutePath().normalize();

            Files.createDirectories(dbPath.getParent());
            String dbUrl = "jdbc:sqlite:" + dbPath + "?journal_mode=WAL";
            connection = DriverManager.getConnection(dbUrl);
            connection.createStatement().execute("PRAGMA foreign_keys = ON");
            initSchema();
            System.out.println("SQLite connected: " + dbPath);
            if (!legacyPath.equals(dbPath) && Files.exists(legacyPath)) {
                System.out.println("WARNING: legacy SQLite file found at " + legacyPath + ". Use " + dbPath + " as canonical DB.");
            }
        } catch (SQLException | IOException e) {
            throw new RuntimeException("Failed to connect to SQLite: " + e.getMessage(), e);
        }
    }

    public static synchronized LocalDatabase getInstance() {
        if (instance == null) instance = new LocalDatabase();
        return instance;
    }

    public Connection getConnection() {
        return connection;
    }

    private void initSchema() throws SQLException {
        try (Statement s = connection.createStatement()) {

            // ── Users + profile (multi-user) ─────────────────────
            s.executeUpdate("""
                CREATE TABLE IF NOT EXISTS users (
                    id            INTEGER PRIMARY KEY AUTOINCREMENT,
                    name          TEXT,
                    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
                    password_hash TEXT NOT NULL,
                    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """);

            s.executeUpdate("""
                CREATE TABLE IF NOT EXISTS user_profiles (
                    user_id        INTEGER PRIMARY KEY,
                    age            INTEGER,
                    sex            TEXT,
                    height_cm      INTEGER,
                    weight_kg      REAL,
                    goal           TEXT,
                    daily_calories INTEGER,
                    budget_weekly  REAL,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            """);

            s.executeUpdate("""
                CREATE TABLE IF NOT EXISTS user_profile_restrictions (
                    user_id     INTEGER NOT NULL,
                    restriction TEXT    NOT NULL,
                    PRIMARY KEY (user_id, restriction),
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            """);

            s.executeUpdate("""
                CREATE TABLE IF NOT EXISTS user_profile_allergens (
                    user_id   INTEGER NOT NULL,
                    allergen  TEXT    NOT NULL,
                    PRIMARY KEY (user_id, allergen),
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            """);

            // ── Ingredients ───────────────────────────────────────
            s.executeUpdate("""
                CREATE TABLE IF NOT EXISTS ingredients (
                    id               INTEGER PRIMARY KEY AUTOINCREMENT,
                    name             TEXT NOT NULL,
                    normalized_name  TEXT NOT NULL,
                    price_per_unit   REAL DEFAULT 0,
                    unit             TEXT,
                    category         TEXT
                )
            """);

            s.executeUpdate("""
                CREATE TABLE IF NOT EXISTS ingredient_allergens (
                    ingredient_id INTEGER NOT NULL,
                    allergen      TEXT    NOT NULL,
                    PRIMARY KEY (ingredient_id, allergen),
                    FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE
                )
            """);

            // ── Scraped ingredient prices by supermarket ─────────
            s.executeUpdate("""
                CREATE TABLE IF NOT EXISTS ingredient_market_prices (
                    ingredient_normalized TEXT NOT NULL,
                    supermarket           TEXT NOT NULL,
                    ingredient_name       TEXT,
                    product_name          TEXT,
                    product_url           TEXT,
                    image_url             TEXT,
                    price                 REAL NOT NULL,
                    currency              TEXT DEFAULT 'EUR',
                    calories              REAL,
                    source                TEXT,
                    note                  TEXT,
                    scraped_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (ingredient_normalized, supermarket)
                )
            """);
            ensureColumnExists("ingredient_market_prices", "image_url", "TEXT");

            // ── Recipes ───────────────────────────────────────────
            s.executeUpdate("""
                CREATE TABLE IF NOT EXISTS recipes (
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    name         TEXT NOT NULL,
                    description  TEXT,
                    meal_type    TEXT NOT NULL,
                    prep_time_min INTEGER DEFAULT 0,
                    cook_time_min INTEGER DEFAULT 0,
                    servings      INTEGER DEFAULT 2,
                    calories      REAL    DEFAULT 0,
                    protein_g     REAL    DEFAULT 0,
                    carbs_g       REAL    DEFAULT 0,
                    fat_g         REAL    DEFAULT 0,
                    image_url     TEXT
                )
            """);

            s.executeUpdate("""
                CREATE TABLE IF NOT EXISTS recipe_ingredients (
                    id            INTEGER PRIMARY KEY AUTOINCREMENT,
                    recipe_id     INTEGER NOT NULL,
                    ingredient_id INTEGER NOT NULL,
                    quantity      REAL    NOT NULL,
                    unit          TEXT    NOT NULL,
                    notes         TEXT,
                    FOREIGN KEY (recipe_id)     REFERENCES recipes(id)     ON DELETE CASCADE,
                    FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
                )
            """);

            s.executeUpdate("""
                CREATE TABLE IF NOT EXISTS recipe_steps (
                    id            INTEGER PRIMARY KEY AUTOINCREMENT,
                    recipe_id     INTEGER NOT NULL,
                    step_order    INTEGER NOT NULL,
                    description   TEXT    NOT NULL,
                    duration_min  INTEGER DEFAULT 0,
                    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
                )
            """);

            s.executeUpdate("""
                CREATE TABLE IF NOT EXISTS recipe_tags (
                    recipe_id INTEGER NOT NULL,
                    tag       TEXT    NOT NULL,
                    PRIMARY KEY (recipe_id, tag),
                    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
                )
            """);

            // ── Meal Plans ────────────────────────────────────────
            s.executeUpdate("""
                CREATE TABLE IF NOT EXISTS meal_plans (
                    id         INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    week_start DATE,
                    status     TEXT DEFAULT 'ACTIVE'
                )
            """);

            s.executeUpdate("""
                CREATE TABLE IF NOT EXISTS meal_plan_meals (
                    id            INTEGER PRIMARY KEY AUTOINCREMENT,
                    meal_plan_id  INTEGER NOT NULL,
                    recipe_id     INTEGER NOT NULL,
                    day_of_week   INTEGER NOT NULL,
                    meal_type     TEXT    NOT NULL,
                    is_completed  INTEGER DEFAULT 0,
                    photo_path    TEXT,
                    completed_at  DATETIME,
                    FOREIGN KEY (meal_plan_id) REFERENCES meal_plans(id) ON DELETE CASCADE,
                    FOREIGN KEY (recipe_id)    REFERENCES recipes(id)
                )
            """);



            // ── Shopping cart snapshots ─────────────────────────
            s.executeUpdate("""
                CREATE TABLE IF NOT EXISTS shopping_cart_snapshots (
                    user_id      INTEGER PRIMARY KEY,
                    payload_json TEXT NOT NULL,
                    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            """);

            // ── Indexes ───────────────────────────────────────────
            s.executeUpdate("CREATE INDEX IF NOT EXISTS idx_users_email          ON users(email)");
            s.executeUpdate("CREATE INDEX IF NOT EXISTS idx_user_profiles_user    ON user_profiles(user_id)");
            s.executeUpdate("CREATE INDEX IF NOT EXISTS idx_recipes_meal_type     ON recipes(meal_type)");
            s.executeUpdate("CREATE INDEX IF NOT EXISTS idx_ingredients_normalized ON ingredients(normalized_name)");
            s.executeUpdate("CREATE INDEX IF NOT EXISTS idx_market_prices_supermarket ON ingredient_market_prices(supermarket)");
            s.executeUpdate("CREATE INDEX IF NOT EXISTS idx_market_prices_price      ON ingredient_market_prices(price)");
            s.executeUpdate("CREATE INDEX IF NOT EXISTS idx_ri_recipe             ON recipe_ingredients(recipe_id)");
            s.executeUpdate("CREATE INDEX IF NOT EXISTS idx_steps_recipe          ON recipe_steps(recipe_id, step_order)");
            s.executeUpdate("CREATE INDEX IF NOT EXISTS idx_cart_snapshots_updated ON shopping_cart_snapshots(updated_at)");
        }
    }

    private void ensureColumnExists(String tableName, String columnName, String columnDefinition) throws SQLException {
        boolean hasColumn = false;
        String pragma = "PRAGMA table_info(" + tableName + ")";
        try (Statement s = connection.createStatement();
             ResultSet rs = s.executeQuery(pragma)) {
            while (rs.next()) {
                if (columnName.equalsIgnoreCase(rs.getString("name"))) {
                    hasColumn = true;
                    break;
                }
            }
        }

        if (hasColumn) {
            return;
        }

        String alter = "ALTER TABLE " + tableName + " ADD COLUMN " + columnName + " " + columnDefinition;
        try (Statement s = connection.createStatement()) {
            s.executeUpdate(alter);
        }
    }
}
