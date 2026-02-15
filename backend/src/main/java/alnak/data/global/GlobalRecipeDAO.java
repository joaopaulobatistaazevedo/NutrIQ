package alnak.data.global;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import alnak.business_logic.entities.MealType;
import alnak.business_logic.entities.NutritionalInfo;
import alnak.business_logic.entities.Recipe;

/**
 * Mirrors recipes from SQLite into MySQL so they can be referenced
 * by global tables (posts, user_recipe_ratings).
 *
 * Does NOT replicate ingredients/steps/tags — those stay local.
 * The source of truth for recipe content is always {@code LocalDatabase}.
 */
public class GlobalRecipeDAO {

    private final Connection conn;

    public GlobalRecipeDAO() {
        this.conn = GlobalDatabase.getInstance().getConnection();
    }

    // ── Sync / Mirror ─────────────────────────────────────────────

    /**
     * Read recipes directly from global MySQL recipes table.
     * Used by API endpoints that serve frontend recipe cards.
     */
    public List<Recipe> listRecipes(Integer limit, MealType mealType) {
        StringBuilder sql = new StringBuilder("""
                SELECT id, name, description, meal_type, prep_time_min, cook_time_min,
                       servings, calories, protein_g, carbs_g, fat_g, image_url,
                       owner_id, visibility
                FROM recipes
                WHERE (visibility = 'PUBLIC' OR owner_id IS NULL)
                """);

        if (mealType != null) {
            sql.append(" AND meal_type = ?");
        }
        sql.append(" ORDER BY id DESC");
        if (limit != null && limit > 0) {
            sql.append(" LIMIT ?");
        }

        try (PreparedStatement ps = conn.prepareStatement(sql.toString())) {
            int idx = 1;
            if (mealType != null) {
                ps.setString(idx++, mealType.name());
            }
            if (limit != null && limit > 0) {
                ps.setInt(idx, limit);
            }

            try (ResultSet rs = ps.executeQuery()) {
                List<Recipe> items = new ArrayList<>();
                while (rs.next()) {
                    items.add(mapRecipeRow(rs));
                }
                return items;
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to list recipes", e);
        }
    }

    /**
     * Read a single recipe by id from global MySQL recipes table.
     */
    public Optional<Recipe> getRecipeById(int id) {
        try (PreparedStatement ps = conn.prepareStatement("""
                SELECT id, name, description, meal_type, prep_time_min, cook_time_min,
                       servings, calories, protein_g, carbs_g, fat_g, image_url,
                       owner_id, visibility
                FROM recipes
                WHERE id = ?
                """)) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return Optional.empty();
                }
                return Optional.of(mapRecipeRow(rs));
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to get recipe by id", e);
        }
    }

    /**
     * Search recipes by name in global MySQL recipes table.
     */
    public List<Recipe> searchRecipes(String query, Integer limit) {
        StringBuilder sql = new StringBuilder("""
                SELECT id, name, description, meal_type, prep_time_min, cook_time_min,
                       servings, calories, protein_g, carbs_g, fat_g, image_url,
                       owner_id, visibility
                FROM recipes
                WHERE LOWER(name) LIKE LOWER(?)
                  AND (visibility = 'PUBLIC' OR owner_id IS NULL)
                ORDER BY id DESC
                """);
        if (limit != null && limit > 0) {
            sql.append(" LIMIT ?");
        }

        try (PreparedStatement ps = conn.prepareStatement(sql.toString())) {
            ps.setString(1, "%" + query.trim() + "%");
            if (limit != null && limit > 0) {
                ps.setInt(2, limit);
            }

            try (ResultSet rs = ps.executeQuery()) {
                List<Recipe> items = new ArrayList<>();
                while (rs.next()) {
                    items.add(mapRecipeRow(rs));
                }
                return items;
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to search recipes", e);
        }
    }

    /**
     * Push a recipe from local SQLite into the global MySQL recipes table.
     * Uses the same id so both databases always refer to the same recipe
     * by the same integer key.
     * Safe to call repeatedly — it will update if the row already exists.
     */
    public void syncRecipe(Recipe recipe) {
        // Skip sync for user-owned recipes to avoid overwriting with scraped data
        if (recipe.getOwnerId() != null) return;
        try (PreparedStatement ps = conn.prepareStatement("""
                INSERT INTO recipes
                  (id, name, description, meal_type, prep_time_min, cook_time_min,
                   servings, calories, protein_g, carbs_g, fat_g, image_url,
                   owner_id, visibility)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    name          = IF(owner_id IS NULL, VALUES(name), name),
                    description   = IF(owner_id IS NULL, VALUES(description), description),
                    meal_type     = IF(owner_id IS NULL, VALUES(meal_type), meal_type),
                    prep_time_min = IF(owner_id IS NULL, VALUES(prep_time_min), prep_time_min),
                    cook_time_min = IF(owner_id IS NULL, VALUES(cook_time_min), cook_time_min),
                    servings      = IF(owner_id IS NULL, VALUES(servings), servings),
                    calories      = IF(owner_id IS NULL, VALUES(calories), calories),
                    protein_g     = IF(owner_id IS NULL, VALUES(protein_g), protein_g),
                    carbs_g       = IF(owner_id IS NULL, VALUES(carbs_g), carbs_g),
                    fat_g         = IF(owner_id IS NULL, VALUES(fat_g), fat_g),
                    image_url     = IF(owner_id IS NULL, VALUES(image_url), image_url),
                    owner_id      = IF(owner_id IS NULL, VALUES(owner_id), owner_id),
                    visibility    = IF(owner_id IS NULL, VALUES(visibility), visibility)
                """)) {
            bindRecipe(ps, recipe);
            ps.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to sync recipe id=" + recipe.getId(), e);
        }
    }

    /**
     * Batch-sync a list of recipes in a single transaction.
     * Ideal for the initial data load / scraper runs.
     */
    public void syncAll(List<Recipe> recipes) {
        try {
            conn.setAutoCommit(false);
            try {
                for (Recipe r : recipes) syncRecipe(r);
                conn.commit();
            } catch (SQLException e) {
                conn.rollback();
                throw e;
            } finally {
                conn.setAutoCommit(true);
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to batch-sync recipes", e);
        }
    }

    /**
     * Remove a recipe from the global table (e.g. when deleted locally).
     * Cascades will clean up any orphan ratings; posts will retain the
     * recipe_id but the FK will fail — consider soft-deleting instead
     * if post history must be preserved.
     */
    public void deleteRecipe(int recipeId) {
        try (PreparedStatement ps = conn.prepareStatement(
                "DELETE FROM recipes WHERE id = ?")) {
            ps.setInt(1, recipeId);
            ps.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    // ── Direct CRUD (user recipes — global only, no SQLite) ───────

    /**
     * Insert a new user-owned recipe directly into MySQL.
     * Uses AUTO_INCREMENT to generate the id (unlike syncRecipe which
     * mirrors an existing SQLite id).
     * Populates {@code recipe.id} with the generated key.
     */
    public Recipe insertRecipe(Recipe recipe) {
        try (PreparedStatement ps = conn.prepareStatement("""
                INSERT INTO recipes
                  (name, description, meal_type, prep_time_min, cook_time_min,
                   servings, calories, protein_g, carbs_g, fat_g, image_url,
                   owner_id, visibility)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, java.sql.Statement.RETURN_GENERATED_KEYS)) {
            NutritionalInfo n = recipe.getNutritionalInfo();
            ps.setString(1, recipe.getName());
            ps.setString(2, recipe.getDescription());
            ps.setString(3, recipe.getMealType() != null ? recipe.getMealType().name() : null);
            ps.setInt(4, recipe.getPrepTimeMin());
            ps.setInt(5, recipe.getCookTimeMin());
            ps.setInt(6, recipe.getServings());
            ps.setDouble(7,  n != null ? n.getCalories() : 0);
            ps.setDouble(8,  n != null ? n.getProteinG()  : 0);
            ps.setDouble(9,  n != null ? n.getCarbsG()    : 0);
            ps.setDouble(10, n != null ? n.getFatG()      : 0);
            ps.setString(11, recipe.getImageUrl());
            if (recipe.getOwnerId() != null) {
                ps.setInt(12, recipe.getOwnerId());
            } else {
                ps.setNull(12, java.sql.Types.INTEGER);
            }
            ps.setString(13, recipe.getVisibility() != null ? recipe.getVisibility() : "PUBLIC");
            ps.executeUpdate();
            try (ResultSet keys = ps.getGeneratedKeys()) {
                if (keys.next()) recipe.setId(keys.getInt(1));
            }
            // Persist ingredients and steps
            saveIngredients(recipe.getId(), recipe.getIngredients());
            saveSteps(recipe.getId(), recipe.getSteps());
            return recipe;
        } catch (SQLException e) {
            throw new RuntimeException("Failed to insert user recipe", e);
        }
    }

    /**
     * Update an existing recipe directly in MySQL (for user-owned recipes).
     */
    public void updateRecipe(Recipe recipe) {
        try (PreparedStatement ps = conn.prepareStatement("""
                UPDATE recipes SET
                    name          = ?,
                    description   = ?,
                    meal_type     = ?,
                    prep_time_min = ?,
                    cook_time_min = ?,
                    servings      = ?,
                    calories      = ?,
                    protein_g     = ?,
                    carbs_g       = ?,
                    fat_g         = ?,
                    image_url     = ?,
                    owner_id      = ?,
                    visibility    = ?
                WHERE id = ?
                """)) {
            NutritionalInfo n = recipe.getNutritionalInfo();
            ps.setString(1, recipe.getName());
            ps.setString(2, recipe.getDescription());
            ps.setString(3, recipe.getMealType() != null ? recipe.getMealType().name() : null);
            ps.setInt(4, recipe.getPrepTimeMin());
            ps.setInt(5, recipe.getCookTimeMin());
            ps.setInt(6, recipe.getServings());
            ps.setDouble(7,  n != null ? n.getCalories() : 0);
            ps.setDouble(8,  n != null ? n.getProteinG()  : 0);
            ps.setDouble(9,  n != null ? n.getCarbsG()    : 0);
            ps.setDouble(10, n != null ? n.getFatG()      : 0);
            ps.setString(11, recipe.getImageUrl());
            if (recipe.getOwnerId() != null) {
                ps.setInt(12, recipe.getOwnerId());
            } else {
                ps.setNull(12, java.sql.Types.INTEGER);
            }
            ps.setString(13, recipe.getVisibility() != null ? recipe.getVisibility() : "PUBLIC");
            ps.setInt(14, recipe.getId());
            ps.executeUpdate();
            // Re-save ingredients and steps
            saveIngredients(recipe.getId(), recipe.getIngredients());
            saveSteps(recipe.getId(), recipe.getSteps());
        } catch (SQLException e) {
            throw new RuntimeException("Failed to update recipe id=" + recipe.getId(), e);
        }
    }

    // ── Ratings ───────────────────────────────────────────────────

    /**
     * Upsert a user's personal rating for a recipe (1–5).
     * This is independent of posting — a user can rate without posting.
     */
    public void rateRecipe(long userId, int recipeId, int rating) {
        if (rating < 1 || rating > 5)
            throw new IllegalArgumentException("Rating must be between 1 and 5");
        try (PreparedStatement ps = conn.prepareStatement("""
                INSERT INTO user_recipe_ratings (user_id, recipe_id, rating)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE rating = VALUES(rating)
                """)) {
            ps.setLong(1, userId);
            ps.setInt(2, recipeId);
            ps.setInt(3, rating);
            ps.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    /**
     * Returns the rating the given user gave a recipe, if any.
     */
    public Optional<Integer> getUserRating(long userId, int recipeId) {
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT rating FROM user_recipe_ratings WHERE user_id = ? AND recipe_id = ?")) {
            ps.setLong(1, userId);
            ps.setInt(2, recipeId);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) return Optional.empty();
                return Optional.of(rs.getInt("rating"));
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    /**
     * Returns ratings that friends of {@code userId} have given to {@code recipeId}.
     *
     * Result map: {@code friendUserId → rating}
     * Only includes accepted friends who have actually rated the recipe.
     */
    public Map<Long, Integer> getFriendRatingsForRecipe(long userId, int recipeId) {
        String sql = """
                SELECT r.user_id, r.rating
                FROM user_recipe_ratings r
                INNER JOIN friendships f ON (
                    (f.requester_id = ? AND f.addressee_id = r.user_id)
                    OR
                    (f.addressee_id = ? AND f.requester_id = r.user_id)
                )
                WHERE r.recipe_id = ?
                  AND f.status = 'ACCEPTED'
                ORDER BY r.rated_at DESC
                """;
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setLong(1, userId);
            ps.setLong(2, userId);
            ps.setInt(3, recipeId);
            try (ResultSet rs = ps.executeQuery()) {
                // LinkedHashMap preserves insertion (most-recently-rated) order
                Map<Long, Integer> ratings = new LinkedHashMap<>();
                while (rs.next())
                    ratings.put(rs.getLong("user_id"), rs.getInt("rating"));
                return ratings;
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    /**
     * Average rating across ALL users for a recipe.
     * Returns {@link Optional#empty()} if nobody has rated it yet.
     */
    public Optional<Double> getAverageRating(int recipeId) {
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT AVG(rating) AS avg_rating FROM user_recipe_ratings WHERE recipe_id = ?")) {
            ps.setInt(1, recipeId);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next() || rs.getObject("avg_rating") == null)
                    return Optional.empty();
                return Optional.of(rs.getDouble("avg_rating"));
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    /**
     * Average rating from accepted friends of {@code userId} for a recipe.
     * Returns {@link Optional#empty()} if no friends have rated it.
     */
    public Optional<Double> getAverageFriendRating(long userId, int recipeId) {
        Map<Long, Integer> friendRatings = getFriendRatingsForRecipe(userId, recipeId);
        if (friendRatings.isEmpty()) return Optional.empty();
        double avg = friendRatings.values().stream()
                .mapToInt(Integer::intValue)
                .average()
                .orElse(0.0);
        return Optional.of(avg);
    }

    /**
     * Top N recipes rated highest by a user's friends.
     * Useful for a "friends recommend" section.
     *
     * @param userId    the user whose friend network to query
     * @param limit     max number of recipes to return
     */
    public List<Integer> getTopRatedByFriends(long userId, int limit) {
        String sql = """
                SELECT r.recipe_id
                FROM user_recipe_ratings r
                INNER JOIN friendships f ON (
                    (f.requester_id = ? AND f.addressee_id = r.user_id)
                    OR
                    (f.addressee_id = ? AND f.requester_id = r.user_id)
                )
                WHERE f.status = 'ACCEPTED'
                GROUP BY r.recipe_id
                ORDER BY AVG(r.rating) DESC, COUNT(*) DESC
                LIMIT ?
                """;
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setLong(1, userId);
            ps.setLong(2, userId);
            ps.setInt(3, limit);
            try (ResultSet rs = ps.executeQuery()) {
                List<Integer> ids = new ArrayList<>();
                while (rs.next()) ids.add(rs.getInt("recipe_id"));
                return ids;
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    // ── Ingredient / Step persistence ───────────────────────────

    /**
     * Replace all ingredients for a recipe (delete + re-insert).
     */
    private void saveIngredients(int recipeId, List<Recipe.RecipeIngredient> ingredients) {
        if (ingredients == null) return;
        try {
            try (PreparedStatement del = conn.prepareStatement(
                    "DELETE FROM recipe_ingredients WHERE recipe_id = ?")) {
                del.setInt(1, recipeId);
                del.executeUpdate();
            }
            if (ingredients.isEmpty()) return;
            try (PreparedStatement ins = conn.prepareStatement("""
                    INSERT INTO recipe_ingredients
                      (recipe_id, ingredient_name, quantity, unit, notes, order_index)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """)) {
                int idx = 0;
                for (Recipe.RecipeIngredient ri : ingredients) {
                    String name = ri.getIngredientName();
                    if ((name == null || name.isBlank()) && ri.getIngredient() != null) {
                        name = ri.getIngredient().getName();
                    }
                    if (name == null || name.isBlank()) continue;
                    ins.setInt(1, recipeId);
                    ins.setString(2, name);
                    ins.setDouble(3, ri.getQuantity());
                    ins.setString(4, ri.getUnit() != null ? ri.getUnit().name() : null);
                    ins.setString(5, ri.getNotes());
                    ins.setInt(6, ri.getOrderIndex() > 0 ? ri.getOrderIndex() : ++idx);
                    ins.addBatch();
                }
                ins.executeBatch();
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to save ingredients for recipe " + recipeId, e);
        }
    }

    /**
     * Replace all steps for a recipe (delete + re-insert).
     */
    private void saveSteps(int recipeId, List<Recipe.RecipeStep> steps) {
        if (steps == null) return;
        try {
            try (PreparedStatement del = conn.prepareStatement(
                    "DELETE FROM recipe_steps WHERE recipe_id = ?")) {
                del.setInt(1, recipeId);
                del.executeUpdate();
            }
            if (steps.isEmpty()) return;
            try (PreparedStatement ins = conn.prepareStatement("""
                    INSERT INTO recipe_steps
                      (recipe_id, step_order, description, duration_minutes)
                    VALUES (?, ?, ?, ?)
                    """)) {
                for (Recipe.RecipeStep step : steps) {
                    if (step.getDescription() == null || step.getDescription().isBlank()) continue;
                    ins.setInt(1, recipeId);
                    ins.setInt(2, step.getStepOrder());
                    ins.setString(3, step.getDescription());
                    ins.setInt(4, step.getDurationMinutes());
                    ins.addBatch();
                }
                ins.executeBatch();
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to save steps for recipe " + recipeId, e);
        }
    }

    /**
     * Load ingredients for a recipe from the global table.
     */
    private List<Recipe.RecipeIngredient> loadIngredients(int recipeId) {
        List<Recipe.RecipeIngredient> list = new ArrayList<>();
        try (PreparedStatement ps = conn.prepareStatement("""
                SELECT id, ingredient_name, quantity, unit, notes, order_index
                FROM recipe_ingredients
                WHERE recipe_id = ?
                ORDER BY order_index
                """)) {
            ps.setInt(1, recipeId);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Recipe.RecipeIngredient ri = new Recipe.RecipeIngredient();
                    ri.setId(rs.getInt("id"));
                    ri.setRecipeId(recipeId);
                    ri.setIngredientName(rs.getString("ingredient_name"));
                    ri.setQuantity(rs.getDouble("quantity"));
                    String unitStr = rs.getString("unit");
                    if (unitStr != null && !unitStr.isBlank()) {
                        try { ri.setUnit(alnak.business_logic.entities.Unit.valueOf(unitStr)); }
                        catch (IllegalArgumentException ignored) { /* keep null */ }
                    }
                    ri.setNotes(rs.getString("notes"));
                    ri.setOrderIndex(rs.getInt("order_index"));
                    list.add(ri);
                }
            }
        } catch (SQLException e) {
            // Don't crash — just return empty ingredients
        }
        return list;
    }

    /**
     * Load steps for a recipe from the global table.
     */
    private List<Recipe.RecipeStep> loadSteps(int recipeId) {
        List<Recipe.RecipeStep> list = new ArrayList<>();
        try (PreparedStatement ps = conn.prepareStatement("""
                SELECT id, step_order, description, duration_minutes
                FROM recipe_steps
                WHERE recipe_id = ?
                ORDER BY step_order
                """)) {
            ps.setInt(1, recipeId);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Recipe.RecipeStep step = new Recipe.RecipeStep();
                    step.setId(rs.getInt("id"));
                    step.setRecipeId(recipeId);
                    step.setStepOrder(rs.getInt("step_order"));
                    step.setDescription(rs.getString("description"));
                    step.setDurationMinutes(rs.getInt("duration_minutes"));
                    list.add(step);
                }
            }
        } catch (SQLException e) {
            // Don't crash — just return empty steps
        }
        return list;
    }

    // ── Private helpers ───────────────────────────────────────────

    private void bindRecipe(PreparedStatement ps, Recipe r) throws SQLException {
        NutritionalInfo n = r.getNutritionalInfo();
        ps.setInt(1, r.getId());
        ps.setString(2, r.getName());
        ps.setString(3, r.getDescription());
        ps.setString(4, r.getMealType() != null ? r.getMealType().name() : null);
        ps.setInt(5, r.getPrepTimeMin());
        ps.setInt(6, r.getCookTimeMin());
        ps.setInt(7, r.getServings());
        ps.setDouble(8,  n != null ? n.getCalories() : 0);
        ps.setDouble(9,  n != null ? n.getProteinG()  : 0);
        ps.setDouble(10, n != null ? n.getCarbsG()    : 0);
        ps.setDouble(11, n != null ? n.getFatG()      : 0);
        ps.setString(12, r.getImageUrl());
        if (r.getOwnerId() != null) {
            ps.setInt(13, r.getOwnerId());
        } else {
            ps.setNull(13, java.sql.Types.INTEGER);
        }
        ps.setString(14, r.getVisibility() != null ? r.getVisibility() : "PUBLIC");
    }

    private Recipe mapRecipeRow(ResultSet rs) throws SQLException {
        Recipe recipe = new Recipe();
        recipe.setId(rs.getInt("id"));
        recipe.setName(rs.getString("name"));
        recipe.setDescription(rs.getString("description"));
        recipe.setPrepTimeMin(rs.getInt("prep_time_min"));
        recipe.setCookTimeMin(rs.getInt("cook_time_min"));
        recipe.setServings(rs.getInt("servings"));
        recipe.setImageUrl(rs.getString("image_url"));

        String mealTypeRaw = rs.getString("meal_type");
        if (mealTypeRaw != null && !mealTypeRaw.isBlank()) {
            try {
                recipe.setMealType(MealType.from(mealTypeRaw));
            } catch (IllegalArgumentException ignored) {
                // Keep null if an old row contains unexpected value.
            }
        }

        recipe.setNutritionalInfo(
                new NutritionalInfo(
                        rs.getDouble("calories"),
                        rs.getDouble("protein_g"),
                        rs.getDouble("carbs_g"),
                        rs.getDouble("fat_g")
                )
        );

        int ownerId = rs.getInt("owner_id");
        recipe.setOwnerId(rs.wasNull() ? null : ownerId);
        recipe.setVisibility(rs.getString("visibility"));

        // Load related ingredients and steps from global tables
        recipe.setIngredients(loadIngredients(recipe.getId()));
        recipe.setSteps(loadSteps(recipe.getId()));

        return recipe;
    }

    // ── User Recipes (owned) ──────────────────────────────────

    /**
     * List all recipes created by a specific user.
     */
    public List<Recipe> listUserRecipes(long userId) {
        try (PreparedStatement ps = conn.prepareStatement("""
                SELECT id, name, description, meal_type, prep_time_min, cook_time_min,
                       servings, calories, protein_g, carbs_g, fat_g, image_url,
                       owner_id, visibility
                FROM recipes
                WHERE owner_id = ?
                ORDER BY id DESC
                """)) {
            ps.setLong(1, userId);
            try (ResultSet rs = ps.executeQuery()) {
                List<Recipe> items = new ArrayList<>();
                while (rs.next()) items.add(mapRecipeRow(rs));
                return items;
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to list user recipes", e);
        }
    }

    /**
     * List recipes visible to a user: public + user's own private.
     */
    public List<Recipe> listVisibleRecipes(long userId, Integer limit, MealType mealType) {
        StringBuilder sql = new StringBuilder("""
                SELECT id, name, description, meal_type, prep_time_min, cook_time_min,
                       servings, calories, protein_g, carbs_g, fat_g, image_url,
                       owner_id, visibility
                FROM recipes
                WHERE (visibility = 'PUBLIC' OR owner_id IS NULL OR owner_id = ?)
                """);
        if (mealType != null) sql.append(" AND meal_type = ?");
        sql.append(" ORDER BY id DESC");
        if (limit != null && limit > 0) sql.append(" LIMIT ?");

        try (PreparedStatement ps = conn.prepareStatement(sql.toString())) {
            int idx = 1;
            ps.setLong(idx++, userId);
            if (mealType != null) ps.setString(idx++, mealType.name());
            if (limit != null && limit > 0) ps.setInt(idx, limit);

            try (ResultSet rs = ps.executeQuery()) {
                List<Recipe> items = new ArrayList<>();
                while (rs.next()) items.add(mapRecipeRow(rs));
                return items;
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to list visible recipes", e);
        }
    }

    // ── Favorites (star/bookmark) ─────────────────────────────

    /**
     * Toggle a recipe as favorite. Returns true if added, false if removed.
     */
    public boolean toggleFavorite(long userId, int recipeId) {
        if (isFavorite(userId, recipeId)) {
            removeFavorite(userId, recipeId);
            return false;
        } else {
            addFavorite(userId, recipeId);
            return true;
        }
    }

    public void addFavorite(long userId, int recipeId) {
        try (PreparedStatement ps = conn.prepareStatement("""
                INSERT IGNORE INTO user_recipe_favorites (user_id, recipe_id)
                VALUES (?, ?)
                """)) {
            ps.setLong(1, userId);
            ps.setInt(2, recipeId);
            ps.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to add favorite", e);
        }
    }

    public void removeFavorite(long userId, int recipeId) {
        try (PreparedStatement ps = conn.prepareStatement(
                "DELETE FROM user_recipe_favorites WHERE user_id = ? AND recipe_id = ?")) {
            ps.setLong(1, userId);
            ps.setInt(2, recipeId);
            ps.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to remove favorite", e);
        }
    }

    public boolean isFavorite(long userId, int recipeId) {
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT 1 FROM user_recipe_favorites WHERE user_id = ? AND recipe_id = ?")) {
            ps.setLong(1, userId);
            ps.setInt(2, recipeId);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next();
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to check favorite", e);
        }
    }

    /**
     * List all recipe IDs favorited by a user.
     */
    public List<Integer> listFavoriteIds(long userId) {
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT recipe_id FROM user_recipe_favorites WHERE user_id = ? ORDER BY created_at DESC")) {
            ps.setLong(1, userId);
            try (ResultSet rs = ps.executeQuery()) {
                List<Integer> ids = new ArrayList<>();
                while (rs.next()) ids.add(rs.getInt("recipe_id"));
                return ids;
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to list favorites", e);
        }
    }

    /**
     * List all recipes favorited by a user (full recipe objects).
     */
    public List<Recipe> listFavoriteRecipes(long userId) {
        try (PreparedStatement ps = conn.prepareStatement("""
                SELECT r.id, r.name, r.description, r.meal_type, r.prep_time_min, r.cook_time_min,
                       r.servings, r.calories, r.protein_g, r.carbs_g, r.fat_g, r.image_url,
                       r.owner_id, r.visibility
                FROM recipes r
                INNER JOIN user_recipe_favorites f ON f.recipe_id = r.id
                WHERE f.user_id = ?
                ORDER BY f.created_at DESC
                """)) {
            ps.setLong(1, userId);
            try (ResultSet rs = ps.executeQuery()) {
                List<Recipe> items = new ArrayList<>();
                while (rs.next()) items.add(mapRecipeRow(rs));
                return items;
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to list favorite recipes", e);
        }
    }
}
