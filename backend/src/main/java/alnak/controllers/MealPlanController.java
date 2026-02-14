package alnak.controllers;

import alnak.business_logic.entities.MealPlan;
import alnak.dto.MealPlanDTOs.*;
import alnak.services.MealPlanService;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

import java.util.List;

/**
 * HTTP adapter for meal plan operations.
 *
 * Intended route registrations:
 *
 *   POST   /api/meal-plans                                → createPlan
 *   GET    /api/meal-plans                                → listPlans
 *   GET    /api/meal-plans/active                         → getActivePlan
 *   GET    /api/meal-plans/{planId}                       → getPlan
 *   PUT    /api/meal-plans/{planId}/status                → updateStatus
 *   DELETE /api/meal-plans/{planId}                       → deletePlan
 *
 *   POST   /api/meal-plans/{planId}/meals                 → addMeal
 *   DELETE /api/meal-plans/{planId}/meals/{mealId}        → removeMeal
 *   PUT    /api/meal-plans/{planId}/meals/{mealId}/swap   → swapMeal
 *   POST   /api/meal-plans/{planId}/meals/{mealId}/complete → completeMeal
 *
 *   GET    /api/meal-plans/{planId}/meals/day/{day}       → getMealsForDay
 *   GET    /api/meal-plans/{planId}/meals/type/{type}     → getMealsByType
 */
public class MealPlanController {

    private final MealPlanService mealPlanService;
    private final ObjectMapper    mapper;

    public MealPlanController(MealPlanService mealPlanService) {
        this.mealPlanService = mealPlanService;
        this.mapper = new ObjectMapper()
                .registerModule(new JavaTimeModule());
    }

    // ── Plans ─────────────────────────────────────────────────────

    public MealPlanResponse createPlan(String body) throws Exception {
        CreatePlanRequest req = mapper.readValue(body, CreatePlanRequest.class);
        MealPlan plan = mealPlanService.createPlan(req.weekStart());
        return MealPlanResponse.from(plan);
    }

    public List<MealPlanResponse> listPlans() {
        return MealPlanResponse.fromList(mealPlanService.listAll());
    }

    public MealPlanResponse getActivePlan() {
        MealPlan plan = mealPlanService.getActivePlan()
                .orElseThrow(() -> new IllegalArgumentException("Nenhum plano ativo encontrado."));
        return MealPlanResponse.from(plan);
    }

    public MealPlanResponse getPlan(int planId) {
        return MealPlanResponse.from(mealPlanService.getPlanById(planId));
    }

    public MealPlanResponse updateStatus(int planId, String body) throws Exception {
        UpdateStatusRequest req = mapper.readValue(body, UpdateStatusRequest.class);
        MealPlan plan = mealPlanService.updateStatus(planId, req.status());
        return MealPlanResponse.from(plan);
    }

    public void deletePlan(int planId) {
        mealPlanService.deletePlan(planId);
    }

    // ── Meals ─────────────────────────────────────────────────────

    public MealResponse addMeal(int planId, String body) throws Exception {
        AddMealRequest req = mapper.readValue(body, AddMealRequest.class);
        MealPlan.MealPlanMeal meal = mealPlanService.addMeal(
                planId, req.recipeId(), req.dayOfWeek(), req.mealType());
        return MealResponse.from(meal);
    }

    public void removeMeal(int planId, int mealId) {
        mealPlanService.removeMeal(planId, mealId);
    }

    public MealResponse swapMeal(int planId, int mealId, String body) throws Exception {
        SwapMealRequest req = mapper.readValue(body, SwapMealRequest.class);
        MealPlan.MealPlanMeal meal = mealPlanService.swapRecipe(planId, mealId, req.newRecipeId());
        return MealResponse.from(meal);
    }

    public MealResponse completeMeal(int planId, int mealId, String body) throws Exception {
        CompleteMealRequest req = mapper.readValue(body, CompleteMealRequest.class);
        MealPlan.MealPlanMeal meal = mealPlanService.completeMeal(
                planId, mealId, req.photoPath());
        return MealResponse.from(meal);
    }

    public List<MealResponse> getMealsForDay(int planId, String day) {
        return MealResponse.fromList(mealPlanService.getMealsForDay(planId, day));
    }

    public List<MealResponse> getMealsByType(int planId, String type) {
        return MealResponse.fromList(mealPlanService.getMealsByType(planId, type));
    }
}