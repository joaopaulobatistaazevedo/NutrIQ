package alnak.dto;

import alnak.business_logic.entities.MealType;
import alnak.business_logic.entities.NutritionalInfo;
import alnak.business_logic.entities.Recipe;

import java.util.List;
import java.util.Set;

public class RecipeDTOs {

    // ── Response ──────────────────────────────────────────────────

    public record NutritionalInfoResponse(
            double calories,
            double proteinG,
            double carbsG,
            double fatG
    ) {
        public static NutritionalInfoResponse from(NutritionalInfo n) {
            if (n == null) return new NutritionalInfoResponse(0, 0, 0, 0);
            return new NutritionalInfoResponse(n.getCalories(), n.getProteinG(),
                    n.getCarbsG(), n.getFatG());
        }
    }

    public record RecipeIngredientResponse(
            int id,
            String ingredientName,
            double quantity,
            String unit,
            String notes
    ) {
        public static RecipeIngredientResponse from(Recipe.RecipeIngredient ri) {
            return new RecipeIngredientResponse(
                    ri.getId(),
                    ri.getIngredient() != null ? ri.getIngredient().getName() : null,
                    ri.getQuantity(),
                    ri.getUnit() != null ? ri.getUnit().name() : null,
                    ri.getNotes()
            );
        }
    }

    public record RecipeStepResponse(
            int stepOrder,
            String description,
            int durationMinutes
    ) {
        public static RecipeStepResponse from(Recipe.RecipeStep step) {
            return new RecipeStepResponse(
                    step.getStepOrder(),
                    step.getDescription(),
                    step.getDurationMinutes()
            );
        }
    }

    public record RecipeResponse(
            int id,
            String name,
            String description,
            String mealType,
            int prepTimeMin,
            int cookTimeMin,
            int totalTimeMin,
            int servings,
            double estimatedCost,
            double costPerServing,
            NutritionalInfoResponse nutritionalInfo,
            List<RecipeIngredientResponse> ingredients,
            List<RecipeStepResponse> steps,
            Set<String> tags,
            String imageUrl
    ) {
        public static RecipeResponse from(Recipe r) {
            return new RecipeResponse(
                    r.getId(),
                    r.getName(),
                    r.getDescription(),
                    r.getMealType() != null ? r.getMealType().name() : null,
                    r.getPrepTimeMin(),
                    r.getCookTimeMin(),
                    r.totalTimeMin(),
                    r.getServings(),
                    r.estimatedCost(),
                    r.costPerServing(),
                    NutritionalInfoResponse.from(r.getNutritionalInfo()),
                    r.getIngredients().stream().map(RecipeIngredientResponse::from).toList(),
                    r.getSteps().stream().map(RecipeStepResponse::from).toList(),
                    r.getTags(),
                    r.getImageUrl()
            );
        }

        public static List<RecipeResponse> fromList(List<Recipe> recipes) {
            return recipes.stream().map(RecipeResponse::from).toList();
        }
    }
}