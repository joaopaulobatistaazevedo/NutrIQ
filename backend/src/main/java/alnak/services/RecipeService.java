package alnak.services;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import alnak.business_logic.entities.Allergen;
import alnak.business_logic.entities.MealType;
import alnak.business_logic.entities.Recipe;
import alnak.data.global.GlobalRecipeDAO;
import alnak.data.local.RecipeDAO;

public class RecipeService {

    private final RecipeDAO recipeDAO;
    private final GlobalRecipeDAO globalRecipeDAO;

    public RecipeService(RecipeDAO recipeDAO, GlobalRecipeDAO globalRecipeDAO) {
        this.recipeDAO = recipeDAO;
        this.globalRecipeDAO = globalRecipeDAO;
    }

    // ── Read ──────────────────────────────────────────────────────

    public List<Recipe> listAll() {
        List<Recipe> global = globalRecipeDAO.listRecipes(null, null);
        if (!global.isEmpty()) {
            return global;
        }
        return List.copyOf(recipeDAO.values());
    }

    public Recipe getById(int id) {
        Recipe recipe = recipeDAO.get(id);
        if (recipe != null) {
            return recipe;
        }

        return globalRecipeDAO.getRecipeById(id)
                .orElseThrow(() -> new IllegalArgumentException("Receita não encontrada: " + id));
    }

    public List<Recipe> search(String query) {
        if (query == null || query.isBlank()) {
            throw new IllegalArgumentException("Parâmetro de pesquisa inválido.");
        }
        List<Recipe> global = globalRecipeDAO.searchRecipes(query.trim(), 200);
        if (!global.isEmpty()) {
            return global;
        }
        return recipeDAO.search(query.trim());
    }

    public List<Recipe> listByMealType(String mealTypeRaw) {
        MealType type = parseMealType(mealTypeRaw);
        List<Recipe> global = globalRecipeDAO.listRecipes(300, type);
        if (!global.isEmpty()) {
            return global;
        }
        return recipeDAO.byMealType(type);
    }

    /**
     * Meal-planning filter: meal type + calorie window + allergen safety + tag exclusions.
     */
    public List<Recipe> filter(String mealTypeRaw, int minCal, int maxCal,
                               Set<Allergen> allergens, Set<String> excludeTags) {
        if (minCal < 0 || maxCal < minCal) {
            throw new IllegalArgumentException(
                    "Intervalo de calorias inválido: minCal=" + minCal + ", maxCal=" + maxCal);
        }
        MealType type = parseMealType(mealTypeRaw);
        return recipeDAO.filtered(type, minCal, maxCal,
                allergens  != null ? allergens   : Set.of(),
                excludeTags != null ? excludeTags : Set.of());
    }

    // ── User recipes ──────────────────────────────────────────────

    /** List recipes created by a specific user. */
    public List<Recipe> listUserRecipes(long userId) {
        return globalRecipeDAO.listUserRecipes(userId);
    }

    /** List all recipes visible to a user (public + own private). */
    public List<Recipe> listVisibleRecipes(long userId, Integer limit, MealType mealType) {
        return globalRecipeDAO.listVisibleRecipes(userId, limit, mealType);
    }

    // ── Favorites ─────────────────────────────────────────────────

    /** Toggle a recipe as favorite. Returns true if added, false if removed. */
    public boolean toggleFavorite(long userId, int recipeId) {
        return globalRecipeDAO.toggleFavorite(userId, recipeId);
    }

    /** Check if a recipe is favorited by a user. */
    public boolean isFavorite(long userId, int recipeId) {
        return globalRecipeDAO.isFavorite(userId, recipeId);
    }

    /** List all recipe IDs favorited by a user. */
    public Set<Integer> listFavoriteIds(long userId) {
        return new HashSet<>(globalRecipeDAO.listFavoriteIds(userId));
    }

    /** List all recipes favorited by a user. */
    public List<Recipe> listFavoriteRecipes(long userId) {
        return globalRecipeDAO.listFavoriteRecipes(userId);
    }

    /** List all recipes a user has access to (own + favorites) — for chatbot. */
    public List<Recipe> listUserAccessibleRecipes(long userId) {
        List<Recipe> mine = globalRecipeDAO.listUserRecipes(userId);
        List<Recipe> favs = globalRecipeDAO.listFavoriteRecipes(userId);
        Set<Integer> seen = new HashSet<>();
        List<Recipe> combined = new java.util.ArrayList<>();
        for (Recipe r : mine) {
            if (seen.add(r.getId())) combined.add(r);
        }
        for (Recipe r : favs) {
            if (seen.add(r.getId())) combined.add(r);
        }
        return combined;
    }

    // ── Write (system / scraped recipes — local + global sync) ──

    public Recipe create(Recipe recipe) {
        validateRecipe(recipe);
        recipeDAO.put(recipe);   // sets recipe.id via RETURN_GENERATED_KEYS
        globalRecipeDAO.syncRecipe(recipe);
        return recipe;
    }

    /** Create a recipe associated with a specific user (global MySQL only). */
    public Recipe createForUser(long userId, Recipe recipe) {
        validateRecipe(recipe);
        recipe.setOwnerId((int) userId);
        if (recipe.getVisibility() == null) {
            recipe.setVisibility("PRIVATE");
        }
        return globalRecipeDAO.insertRecipe(recipe);
    }

    public Recipe update(int id, Recipe recipe) {
        if (!recipeDAO.containsKey(id)) {
            throw new IllegalArgumentException("Receita não encontrada: " + id);
        }
        validateRecipe(recipe);
        recipe.setId(id);
        recipeDAO.put(id, recipe);
        globalRecipeDAO.syncRecipe(recipe);
        return recipe;
    }

    /** Update a recipe, ensuring the user owns it (global MySQL only). */
    public Recipe updateForUser(long userId, int id, Recipe recipe) {
        Recipe existing = globalRecipeDAO.getRecipeById(id)
                .orElseThrow(() -> new IllegalArgumentException("Receita não encontrada: " + id));
        if (existing.getOwnerId() == null || existing.getOwnerId() != (int) userId) {
            throw new SecurityException("Não tem permissão para editar esta receita.");
        }
        validateRecipe(recipe);
        recipe.setId(id);
        recipe.setOwnerId((int) userId);
        globalRecipeDAO.updateRecipe(recipe);
        return recipe;
    }

    public void delete(int id) {
        Recipe removed = recipeDAO.remove(id);
        if (removed == null) {
            throw new IllegalArgumentException("Receita não encontrada: " + id);
        }
        globalRecipeDAO.deleteRecipe(id);
    }

    /** Delete a recipe, ensuring the user owns it (global MySQL only). */
    public void deleteForUser(long userId, int id) {
        Recipe existing = globalRecipeDAO.getRecipeById(id)
                .orElseThrow(() -> new IllegalArgumentException("Receita não encontrada: " + id));
        if (existing.getOwnerId() == null || existing.getOwnerId() != (int) userId) {
            throw new SecurityException("Não tem permissão para eliminar esta receita.");
        }
        globalRecipeDAO.deleteRecipe(id);
    }

    /** Batch import — delegates to the DAO transaction. */
    public Map<String, Integer> importBatch(List<Recipe> recipes) {
        if (recipes == null || recipes.isEmpty()) {
            throw new IllegalArgumentException("Lista de receitas vazia.");
        }
        recipeDAO.putAll(recipes);
        globalRecipeDAO.syncAll(recipes);
        return Map.of("imported", recipes.size());
    }

    // ── Private helpers ───────────────────────────────────────────

    private MealType parseMealType(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException("Tipo de refeição inválido.");
        }
        try {
            return MealType.from(raw.trim());
        } catch (Exception e) {
            throw new IllegalArgumentException("Tipo de refeição desconhecido: " + raw);
        }
    }

    private void validateRecipe(Recipe recipe) {
        if (recipe == null) {
            throw new IllegalArgumentException("Receita inválida.");
        }
        if (recipe.getName() == null || recipe.getName().isBlank()) {
            throw new IllegalArgumentException("O nome da receita é obrigatório.");
        }
        if (recipe.getMealType() == null) {
            throw new IllegalArgumentException("O tipo de refeição é obrigatório.");
        }
        if (recipe.getServings() <= 0) {
            throw new IllegalArgumentException("O número de porções deve ser positivo.");
        }
    }
}