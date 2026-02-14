package alnak.dto;

import alnak.business_logic.entities.MealPlan;
import alnak.business_logic.entities.MealType;
import alnak.business_logic.entities.PlanStatus;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public class MealPlanDTOs {

    // ── Plan DTOs ─────────────────────────────────────────────────

    /** Body for POST /api/meal-plans */
    public record CreatePlanRequest(String weekStart) {}

    public record MealResponse(
            int id,
            int mealPlanId,
            int recipeId,
            String recipeName,
            String dayOfWeek,    // e.g. "MONDAY"
            String mealType,     // e.g. "BREAKFAST"
            boolean completed,
            String photoPath,
            LocalDateTime completedAt
    ) {
        public static MealResponse from(MealPlan.MealPlanMeal m) {
            return new MealResponse(
                    m.getId(),
                    m.getMealPlanId(),
                    m.getRecipeId(),
                    m.getRecipe() != null ? m.getRecipe().getName() : null,
                    m.getDayOfWeek() != null ? m.getDayOfWeek().name() : null,
                    m.getMealType() != null ? m.getMealType().name() : null,
                    m.isCompleted(),
                    m.getPhotoPath(),
                    m.getCompletedAt()
            );
        }

        public static List<MealResponse> fromList(List<MealPlan.MealPlanMeal> meals) {
            return meals.stream().map(MealResponse::from).toList();
        }
    }

    public record MealPlanResponse(
            int id,
            LocalDate weekStart,
            String status,
            LocalDateTime createdAt,
            List<MealResponse> meals,
            double totalCost
    ) {
        public static MealPlanResponse from(MealPlan plan) {
            return new MealPlanResponse(
                    plan.getId(),
                    plan.getWeekStart(),
                    plan.getStatus() != null ? plan.getStatus().name() : null,
                    plan.getCreatedAt(),
                    MealResponse.fromList(plan.getMeals()),
                    plan.totalCost()
            );
        }

        public static List<MealPlanResponse> fromList(List<MealPlan> plans) {
            return plans.stream().map(MealPlanResponse::from).toList();
        }
    }

    // ── Meal mutation DTOs ────────────────────────────────────────

    /** Body for POST /api/meal-plans/{planId}/meals */
    public record AddMealRequest(
            int recipeId,
            String dayOfWeek,   // "MONDAY" … "SUNDAY"
            String mealType     // "BREAKFAST" / "LUNCH" / "DINNER" / "SNACK"
    ) {}

    /** Body for PUT /api/meal-plans/{planId}/meals/{mealId}/swap */
    public record SwapMealRequest(int newRecipeId) {}

    /** Body for POST /api/meal-plans/{planId}/meals/{mealId}/complete */
    public record CompleteMealRequest(String photoPath) {}

    /** Body for PUT /api/meal-plans/{planId}/status */
    public record UpdateStatusRequest(String status) {}
}