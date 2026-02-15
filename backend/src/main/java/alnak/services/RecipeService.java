package alnak.services;

import alnak.business_logic.entities.Allergen;
import alnak.business_logic.entities.MealType;
import alnak.business_logic.entities.Recipe;
import alnak.data.global.GlobalRecipeDAO;
import alnak.data.local.RecipeDAO;

import java.util.List;
import java.util.Map;
import java.util.Set;

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
     *
     * @param mealTypeRaw  meal type string (case-insensitive)
     * @param minCal       minimum calories (inclusive)
     * @param maxCal       maximum calories (inclusive)
     * @param allergens    allergens the result must be free of (may be empty)
     * @param excludeTags  tags that disqualify a recipe (may be empty)
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

    // ── Write ─────────────────────────────────────────────────────

    public Recipe create(Recipe recipe) {
        validateRecipe(recipe);
        recipeDAO.put(recipe);   // sets recipe.id via RETURN_GENERATED_KEYS
        globalRecipeDAO.syncRecipe(recipe);
        return recipe;
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

    public void delete(int id) {
        Recipe removed = recipeDAO.remove(id);
        if (removed == null) {
            throw new IllegalArgumentException("Receita não encontrada: " + id);
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