package alnak.controllers;

import alnak.dto.RecipeSummaryResponse;
import alnak.services.RecipeService;

import java.util.List;

public class RecipeController {
    private final RecipeService recipeService;

    public RecipeController(RecipeService recipeService) {
        this.recipeService = recipeService;
    }

    public List<RecipeSummaryResponse> listRecipes(Integer limit, String mealType) {
        return recipeService.listRecipes(limit, mealType).stream()
                .map(RecipeSummaryResponse::from)
                .toList();
    }
}
