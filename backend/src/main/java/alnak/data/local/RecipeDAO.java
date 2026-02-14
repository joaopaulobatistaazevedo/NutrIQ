package alnak.data.local;

import alnak.business_logic.entities.Allergen;
import alnak.business_logic.entities.Ingredient;
import alnak.business_logic.entities.MealType;
import alnak.business_logic.entities.NutritionalInfo;
import alnak.business_logic.entities.Recipe;
import alnak.business_logic.entities.Unit;

import java.sql.*;
import java.util.*;

/**
 * Map<Integer, Recipe> backed by SQLite.
 * Keys are recipe ids. Loading a recipe also loads its ingredients, steps and tags.
 */
public class RecipeDAO extends AbstractMap<Integer, Recipe> {

    private final Connection conn;

    public RecipeDAO() {
        this.conn = LocalDatabase.getInstance().getConnection();
    }

    // ── AbstractMap contract ──────────────────────────────────────

    @Override
    public Set<Entry<Integer, Recipe>> entrySet() {
        try {
            Set<Entry<Integer, Recipe>> entries = new LinkedHashSet<>();
            try (Statement stmt = conn.createStatement();
                 ResultSet rs = stmt.executeQuery("SELECT * FROM recipes ORDER BY name")) {
                while (rs.next()) {
                    Recipe r = mapRecipe(rs);
                    hydrate(r);
                    entries.add(new SimpleImmutableEntry<>(r.getId(), r));
                }
            }
            return entries;
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    @Override
    public Recipe get(Object key) {
        if (!(key instanceof Integer id)) return null;
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT * FROM recipes WHERE id = ?")) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) return null;
                Recipe r = mapRecipe(rs);
                hydrate(r);
                return r;
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    @Override
    public Recipe put(Integer key, Recipe recipe) {
        Recipe previous = key != null && key > 0 ? get(key) : null;
        try {
            if (previous == null) insert(recipe);
            else { recipe.setId(key); update(recipe); }
        } catch (SQLException e) { throw new RuntimeException(e); }
        return previous;
    }

    /** Convenience — INSERT without a key. Populates id on the passed object. */
    public Recipe put(Recipe recipe) {
        try { insert(recipe); return recipe; }
        catch (SQLException e) { throw new RuntimeException(e); }
    }

    @Override
    public Recipe remove(Object key) {
        if (!(key instanceof Integer id)) return null;
        Recipe previous = get(id);
        if (previous != null) {
            try (PreparedStatement ps = conn.prepareStatement(
                    "DELETE FROM recipes WHERE id = ?")) {
                // ON DELETE CASCADE handles steps, ingredients, tags
                ps.setInt(1, id);
                ps.executeUpdate();
            } catch (SQLException e) { throw new RuntimeException(e); }
        }
        return previous;
    }

    @Override
    public boolean containsKey(Object key) {
        if (!(key instanceof Integer id)) return false;
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT 1 FROM recipes WHERE id = ?")) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) { return rs.next(); }
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    // ── Domain helpers ────────────────────────────────────────────

    public List<Recipe> byMealType(MealType type) {
        return query("SELECT * FROM recipes WHERE meal_type = ? ORDER BY name",
                     type.name());
    }

    /**
     * Meal-planning algorithm filter:
     * meal type + calorie window + safe for user's allergens + no excluded tags.
     */
    public List<Recipe> filtered(MealType type, int minCal, int maxCal,
                                  Set<Allergen> allergens, Set<String> excludeTags) {
        List<Recipe> candidates = query(
            "SELECT * FROM recipes WHERE meal_type = ? AND calories BETWEEN ? AND ?",
            type.name(), minCal, maxCal);
        return candidates.stream()
            .filter(r -> r.isSafeFor(allergens))
            .filter(r -> excludeTags.stream().noneMatch(r::hasTag))
            .toList();
    }

    public List<Recipe> search(String query) {
        return query("SELECT * FROM recipes WHERE name LIKE ? ORDER BY name",
                     "%" + query + "%");
    }

    /** Batch insert in a single transaction — for the scraper. */
    public void putAll(List<Recipe> recipes) {
        try {
            conn.setAutoCommit(false);
            try {
                for (Recipe r : recipes) insert(r);
                conn.commit();
            } catch (SQLException e) { conn.rollback(); throw e; }
            finally { conn.setAutoCommit(true); }
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    // ── Private helpers ───────────────────────────────────────────

    private List<Recipe> query(String sql, Object... params) {
        try {
            List<Recipe> result = new ArrayList<>();
            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                for (int i = 0; i < params.length; i++) {
                    if (params[i] instanceof Integer n) ps.setInt(i + 1, n);
                    else ps.setString(i + 1, params[i].toString());
                }
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        Recipe r = mapRecipe(rs);
                        hydrate(r);
                        result.add(r);
                    }
                }
            }
            return result;
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    /** Load ingredients, steps and tags for a recipe. */
    private void hydrate(Recipe r) throws SQLException {
        r.setIngredients(loadIngredients(r.getId()));
        r.setSteps(loadSteps(r.getId()));
        r.setTags(loadTags(r.getId()));
    }

    private List<Recipe.RecipeIngredient> loadIngredients(int recipeId) throws SQLException {
        List<Recipe.RecipeIngredient> result = new ArrayList<>();
        String sql = """
            SELECT ri.*, i.id AS i_id, i.name, i.normalized_name,
                   i.price_per_unit, i.unit AS i_unit, i.category
            FROM recipe_ingredients ri
            JOIN ingredients i ON i.id = ri.ingredient_id
            WHERE ri.recipe_id = ?
        """;
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setInt(1, recipeId);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Ingredient ing = new Ingredient();
                    ing.setId(rs.getInt("i_id"));
                    ing.setName(rs.getString("name"));
                    String iUnit = rs.getString("i_unit");
                    if (iUnit != null) ing.setUnit(Unit.from(iUnit));
                    ing.setPricePerUnit(rs.getDouble("price_per_unit"));
                    ing.setCategory(rs.getString("category"));

                    Recipe.RecipeIngredient ri = new Recipe.RecipeIngredient();
                    ri.setId(rs.getInt("id"));
                    ri.setRecipeId(recipeId);
                    ri.setIngredient(ing);
                    ri.setQuantity(rs.getDouble("quantity"));
                    String riUnit = rs.getString("unit");
                    if (riUnit != null) ri.setUnit(Unit.from(riUnit));
                    ri.setNotes(rs.getString("notes"));
                    result.add(ri);
                }
            }
        }
        return result;
    }

    private List<Recipe.RecipeStep> loadSteps(int recipeId) throws SQLException {
        List<Recipe.RecipeStep> result = new ArrayList<>();
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT * FROM recipe_steps WHERE recipe_id = ? ORDER BY step_order")) {
            ps.setInt(1, recipeId);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Recipe.RecipeStep step = new Recipe.RecipeStep();
                    step.setId(rs.getInt("id"));
                    step.setRecipeId(recipeId);
                    step.setStepOrder(rs.getInt("step_order"));
                    step.setDescription(rs.getString("description"));
                    step.setDurationMinutes(rs.getInt("duration_min"));
                    result.add(step);
                }
            }
        }
        return result;
    }

    private Set<String> loadTags(int recipeId) throws SQLException {
        Set<String> tags = new LinkedHashSet<>();
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT tag FROM recipe_tags WHERE recipe_id = ?")) {
            ps.setInt(1, recipeId);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) tags.add(rs.getString("tag"));
            }
        }
        return tags;
    }

    private void insert(Recipe r) throws SQLException {
        String sql = """
            INSERT INTO recipes
              (name, description, meal_type, prep_time_min, cook_time_min, servings,
               calories, protein_g, carbs_g, fat_g, image_url)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
        """;
        try (PreparedStatement ps = conn.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
            bindCore(ps, r);
            ps.executeUpdate();
            try (ResultSet keys = ps.getGeneratedKeys()) {
                if (keys.next()) r.setId(keys.getInt(1));
            }
        }
        saveIngredients(r);
        saveSteps(r);
        saveTags(r);
    }

    private void update(Recipe r) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement("""
            UPDATE recipes SET name=?, description=?, meal_type=?, prep_time_min=?,
              cook_time_min=?, servings=?, calories=?, protein_g=?, carbs_g=?, fat_g=?,
              image_url=? WHERE id=?
        """)) {
            bindCore(ps, r);
            ps.setInt(12, r.getId());
            ps.executeUpdate();
        }
        // CASCADE DELETE clears child rows; re-insert
        deleteChildren(r.getId());
        saveIngredients(r);
        saveSteps(r);
        saveTags(r);
    }

    private void bindCore(PreparedStatement ps, Recipe r) throws SQLException {
        NutritionalInfo n = r.getNutritionalInfo();
        ps.setString(1, r.getName());
        ps.setString(2, r.getDescription());
        ps.setString(3, r.getMealType() != null ? r.getMealType().name() : null);
        ps.setInt(4, r.getPrepTimeMin());
        ps.setInt(5, r.getCookTimeMin());
        ps.setInt(6, r.getServings());
        ps.setDouble(7, n != null ? n.getCalories() : 0);
        ps.setDouble(8, n != null ? n.getProteinG()  : 0);
        ps.setDouble(9, n != null ? n.getCarbsG()    : 0);
        ps.setDouble(10, n != null ? n.getFatG()     : 0);
        ps.setString(11, r.getImageUrl());
    }

    private void saveIngredients(Recipe r) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement("""
            INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit, notes)
            VALUES (?, ?, ?, ?, ?)
        """)) {
            for (Recipe.RecipeIngredient ri : r.getIngredients()) {
                ps.setInt(1, r.getId());
                ps.setInt(2, ri.getIngredient().getId());
                ps.setDouble(3, ri.getQuantity());
                ps.setString(4, ri.getUnit() != null ? ri.getUnit().name() : null);
                ps.setString(5, ri.getNotes());
                ps.addBatch();
            }
            ps.executeBatch();
        }
    }

    private void saveSteps(Recipe r) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement("""
            INSERT INTO recipe_steps (recipe_id, step_order, description, duration_min)
            VALUES (?, ?, ?, ?)
        """)) {
            for (Recipe.RecipeStep step : r.getSteps()) {
                ps.setInt(1, r.getId());
                ps.setInt(2, step.getStepOrder());
                ps.setString(3, step.getDescription());
                ps.setInt(4, step.getDurationMinutes());
                ps.addBatch();
            }
            ps.executeBatch();
        }
    }

    private void saveTags(Recipe r) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement(
                "INSERT OR IGNORE INTO recipe_tags (recipe_id, tag) VALUES (?, ?)")) {
            for (String tag : r.getTags()) {
                ps.setInt(1, r.getId());
                ps.setString(2, tag.toLowerCase());
                ps.addBatch();
            }
            ps.executeBatch();
        }
    }

    private void deleteChildren(int recipeId) throws SQLException {
        for (String table : List.of("recipe_ingredients", "recipe_steps", "recipe_tags")) {
            try (PreparedStatement ps = conn.prepareStatement(
                    "DELETE FROM " + table + " WHERE recipe_id = ?")) {
                ps.setInt(1, recipeId);
                ps.executeUpdate();
            }
        }
    }

    private Recipe mapRecipe(ResultSet rs) throws SQLException {
        Recipe r = new Recipe();
        r.setId(rs.getInt("id"));
        r.setName(rs.getString("name"));
        r.setDescription(rs.getString("description"));
        String mt = rs.getString("meal_type");
        if (mt != null) r.setMealType(MealType.from(mt));
        r.setPrepTimeMin(rs.getInt("prep_time_min"));
        r.setCookTimeMin(rs.getInt("cook_time_min"));
        r.setServings(rs.getInt("servings"));
        r.setNutritionalInfo(new NutritionalInfo(
            rs.getDouble("calories"),
            rs.getDouble("protein_g"),
            rs.getDouble("carbs_g"),
            rs.getDouble("fat_g")
        ));
        r.setImageUrl(rs.getString("image_url"));
        return r;
    }
}
