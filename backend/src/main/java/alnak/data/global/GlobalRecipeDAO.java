package alnak.data.global;

import alnak.business_logic.entities.MealType;
import alnak.business_logic.entities.NutritionalInfo;
import alnak.business_logic.entities.Recipe;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

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
                       servings, calories, protein_g, carbs_g, fat_g, image_url
                FROM recipes
                """);

        if (mealType != null) {
            sql.append(" WHERE meal_type = ?");
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
                       servings, calories, protein_g, carbs_g, fat_g, image_url
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
                       servings, calories, protein_g, carbs_g, fat_g, image_url
                FROM recipes
                WHERE LOWER(name) LIKE LOWER(?)
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
        try (PreparedStatement ps = conn.prepareStatement("""
                INSERT INTO recipes
                  (id, name, description, meal_type, prep_time_min, cook_time_min,
                   servings, calories, protein_g, carbs_g, fat_g, image_url)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    name          = VALUES(name),
                    description   = VALUES(description),
                    meal_type     = VALUES(meal_type),
                    prep_time_min = VALUES(prep_time_min),
                    cook_time_min = VALUES(cook_time_min),
                    servings      = VALUES(servings),
                    calories      = VALUES(calories),
                    protein_g     = VALUES(protein_g),
                    carbs_g       = VALUES(carbs_g),
                    fat_g         = VALUES(fat_g),
                    image_url     = VALUES(image_url)
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
        return recipe;
    }
}
