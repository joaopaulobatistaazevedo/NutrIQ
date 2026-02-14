package alnak.services;

import alnak.business_logic.entities.MealType;
import alnak.business_logic.entities.Recipe;
import alnak.data.global.GlobalRecipeDAO;

import java.util.List;

public class RecipeService {
    private final GlobalRecipeDAO recipeDAO;

    public RecipeService() {
        this(new GlobalRecipeDAO());
    }

    public RecipeService(GlobalRecipeDAO recipeDAO) {
        this.recipeDAO = recipeDAO;
    }

    public List<Recipe> listRecipes(Integer limit, String mealTypeRaw) {
        MealType mealType = parseMealType(mealTypeRaw);
        Integer sanitizedLimit = sanitizeLimit(limit);
        return recipeDAO.listRecipes(sanitizedLimit, mealType);
    }

    private MealType parseMealType(String mealTypeRaw) {
        if (mealTypeRaw == null || mealTypeRaw.isBlank()) {
            return null;
        }
        try {
            return MealType.from(mealTypeRaw.trim());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException(
                    "mealType invalido. Usa: BREAKFAST, LUNCH, DINNER ou SNACK."
            );
        }
    }

    private Integer sanitizeLimit(Integer limit) {
        if (limit == null) {
            return 200;
        }
        if (limit <= 0) {
            throw new IllegalArgumentException("limit deve ser > 0");
        }
        return Math.min(limit, 500);
    }
}
