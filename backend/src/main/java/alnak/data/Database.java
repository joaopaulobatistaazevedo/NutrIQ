package alnak.data;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;

public class Database {

    private static final String DB_URL = "jdbc:sqlite:meal_planner.db?journal_mode=WAL";
    private static Database instance;
    private Connection connection;

    private Database() {
        try {
            connection = DriverManager.getConnection(DB_URL);
            connection.createStatement().execute("PRAGMA foreign_keys = ON");
            initSchema();
            System.out.println("✅ SQLite connected: meal_planner.db");
        } catch (SQLException e) {
            throw new RuntimeException("Failed to connect to SQLite: " + e.getMessage(), e);
        }
    }

    public static synchronized Database getInstance() {
        if (instance == null) instance = new Database();
        return instance;
    }

    public Connection getConnection() {
        return connection;
    }

    private void initSchema() throws SQLException {
        try (Statement s = connection.createStatement()) {

            // ── User (singleton) ──────────────────────────────────
            s.executeUpdate("""
                CREATE TABLE IF NOT EXISTS user_profile (
                    id             INTEGER PRIMARY KEY CHECK (id = 1),
                    age            INTEGER,
                    sex            TEXT,
                    height_cm      INTEGER,
                    weight_kg      REAL,
                    goal           TEXT,
                    daily_calories INTEGER,
                    budget_weekly  REAL
                )
            """);

            s.executeUpdate("""
                CREATE TABLE IF NOT EXISTS user_restrictions (
                    restriction TEXT PRIMARY KEY
                )
            """);

            s.executeUpdate("""
                CREATE TABLE IF NOT EXISTS user_allergens (
                    allergen TEXT PRIMARY KEY
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

            // ── Indexes ───────────────────────────────────────────
            s.executeUpdate("CREATE INDEX IF NOT EXISTS idx_recipes_meal_type     ON recipes(meal_type)");
            s.executeUpdate("CREATE INDEX IF NOT EXISTS idx_ingredients_normalized ON ingredients(normalized_name)");
            s.executeUpdate("CREATE INDEX IF NOT EXISTS idx_ri_recipe             ON recipe_ingredients(recipe_id)");
            s.executeUpdate("CREATE INDEX IF NOT EXISTS idx_steps_recipe          ON recipe_steps(recipe_id, step_order)");
        }
    }
}
