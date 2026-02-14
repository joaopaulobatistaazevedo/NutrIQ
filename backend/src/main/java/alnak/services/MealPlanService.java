package alnak.services;

import alnak.business_logic.entities.MealPlan;
import alnak.business_logic.entities.MealType;
import alnak.business_logic.entities.PlanStatus;
import alnak.business_logic.entities.Recipe;
import alnak.data.global.GlobalMealPlanDAO;
import alnak.data.global.GlobalRecipeDAO;
import alnak.data.local.RecipeDAO;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

/**
 * Business logic for meal plans.
 */
public class MealPlanService {

    private final GlobalMealPlanDAO globalMealPlanDAO;
    private final GlobalRecipeDAO   globalRecipeDAO;
    private final RecipeDAO         recipeDAO;

    public MealPlanService(GlobalMealPlanDAO globalMealPlanDAO,
                           GlobalRecipeDAO globalRecipeDAO,
                           RecipeDAO recipeDAO) {
        this.globalMealPlanDAO = globalMealPlanDAO;
        this.globalRecipeDAO   = globalRecipeDAO;
        this.recipeDAO         = recipeDAO;
    }

    // ── Plan lifecycle ────────────────────────────────────────────

    /**
     * Create a new meal plan for the given week.
     *
     * @param weekStart Monday of the target week (ISO date string, e.g. "2025-06-09")
     */
    public MealPlan createPlan(long userId, String weekStart) {
        LocalDate date = parseWeekStart(weekStart);
        MealPlan plan = new MealPlan(date);
        plan.setStatus(PlanStatus.ACTIVE);
        globalMealPlanDAO.addPlan(userId, plan);
        return plan;
    }

    /**
     * Returns all plans, newest first.
     */
    public List<MealPlan> listAll(long userId) {
        List<MealPlan> plans = globalMealPlanDAO.listPlans(userId);
        plans.forEach(this::hydratePlanMeals);
        return plans;
    }

    /**
     * Returns the most recent active plan, if one exists.
     */
    public Optional<MealPlan> getActivePlan(long userId) {
        Optional<MealPlan> global = globalMealPlanDAO.getActive(userId);
        if (global.isPresent()) {
            MealPlan plan = global.get();
            hydratePlanMeals(plan);
            return Optional.of(plan);
        }
        return Optional.empty();
    }

    /**
     * Find a plan by its database id.
     */
    public MealPlan getPlanById(long userId, int planId) {
        return findPlanById(userId, planId);   // throws if not found
    }

    /**
     * Update the status of a plan (e.g. ACTIVE → COMPLETED).
     */
    public MealPlan updateStatus(long userId, int planId, String statusRaw) {
        PlanStatus status = parsePlanStatus(statusRaw);
        MealPlan plan = findPlanById(userId, planId);
        globalMealPlanDAO.setStatus(userId, plan.getId(), status);
        plan.setStatus(status);
        return plan;
    }

    /**
     * Delete a plan and all its meals (cascade is handled by the DAO).
     */
    public void deletePlan(long userId, int planId) {
        globalMealPlanDAO.deletePlan(userId, planId);
    }

    // ── Meal management ───────────────────────────────────────────

    /**
     * Add a meal slot to a plan.
     *
     * @param planId     target plan
     * @param recipeId   recipe to assign — must exist locally
     * @param dayRaw     day of week string, e.g. "MONDAY"
     * @param mealTypeRaw meal type string, e.g. "BREAKFAST"
     * @return the persisted meal (with id populated)
     */
    public MealPlan.MealPlanMeal addMeal(long userId, int planId, int recipeId,
                                         String dayRaw, String mealTypeRaw) {
        MealPlan plan    = findPlanById(userId, planId);
        Recipe   recipe  = requireRecipe(recipeId);
        DayOfWeek  day   = parseDayOfWeek(dayRaw);
        MealType   type  = parseMealType(mealTypeRaw);

        MealPlan.MealPlanMeal meal = new MealPlan.MealPlanMeal(planId, recipe, day, type);
        globalMealPlanDAO.addMeal(userId, meal);

        // keep the in-memory plan consistent so callers don't need to re-fetch
        plan.getMeals().add(meal);
        return meal;
    }

    /**
     * Remove a meal slot from a plan.
     *
     * @param planId the owning plan (validated for existence)
     * @param mealId the meal row id to delete
     */
    public void removeMeal(long userId, int planId, int mealId) {
        MealPlan plan = findPlanById(userId, planId);
        boolean owned = plan.getMeals().stream()
                .anyMatch(m -> m.getId() == mealId);
        if (!owned)
            throw new IllegalArgumentException(
                    "Meal " + mealId + " does not belong to plan " + planId);
        globalMealPlanDAO.removeMeal(userId, planId, mealId);
    }

    /**
     * Replace the recipe in an existing meal slot.
     *
     * @param planId      the owning plan (validated for existence)
     * @param mealId      the meal slot to update
     * @param newRecipeId replacement recipe — must exist locally
     */
    public MealPlan.MealPlanMeal swapRecipe(long userId, int planId, int mealId, int newRecipeId) {
        MealPlan plan   = findPlanById(userId, planId);
        Recipe   recipe = requireRecipe(newRecipeId);

        MealPlan.MealPlanMeal meal = plan.getMeals().stream()
                .filter(m -> m.getId() == mealId)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException(
                        "Meal " + mealId + " does not belong to plan " + planId));

        globalMealPlanDAO.swapRecipe(userId, planId, mealId, newRecipeId);
        meal.setRecipeId(newRecipeId);
        meal.setRecipe(recipe);
        return meal;
    }

    /**
     * Mark a meal as completed, optionally attaching a photo.
     *
     * @param planId    the owning plan (validated for existence)
     * @param mealId    the meal to complete
     * @param photoPath optional path/URL to the completion photo
     */
    public MealPlan.MealPlanMeal completeMeal(long userId, int planId, int mealId, String photoPath) {
        MealPlan plan = findPlanById(userId, planId);
        MealPlan.MealPlanMeal meal = plan.getMeals().stream()
                .filter(m -> m.getId() == mealId)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException(
                        "Meal " + mealId + " does not belong to plan " + planId));

        globalMealPlanDAO.completeMeal(userId, planId, mealId, photoPath);
        meal.markCompleted(photoPath);   // updates in-memory state
        return meal;
    }

    /**
     * Returns all meals for a specific day within a plan.
     *
     * @param dayRaw e.g. "TUESDAY"
     */
    public List<MealPlan.MealPlanMeal> getMealsForDay(long userId, int planId, String dayRaw) {
        MealPlan  plan = findPlanById(userId, planId);
        DayOfWeek day  = parseDayOfWeek(dayRaw);
        return plan.mealsForDay(day.getValue());
    }

    /**
     * Returns all meals of a given type (e.g. all breakfasts) in a plan.
     */
    public List<MealPlan.MealPlanMeal> getMealsByType(long userId, int planId, String mealTypeRaw) {
        MealPlan plan = findPlanById(userId, planId);
        MealType type = parseMealType(mealTypeRaw);
        return plan.mealsOfType(type);
    }

    // ── Private helpers ───────────────────────────────────────────

    /**
     * Iterates the DAO (newest-first list) to find a plan by id.
     * Throws {@link IllegalArgumentException} if not found.
     */
    private MealPlan findPlanById(long userId, int planId) {
        Optional<MealPlan> global = globalMealPlanDAO.getPlanById(userId, planId);
        MealPlan plan = global
                .orElseThrow(() -> new IllegalArgumentException(
                        "Plano de refeições não encontrado: " + planId));
        hydratePlanMeals(plan);
        return plan;
    }

    private void hydratePlanMeals(MealPlan plan) {
        if (plan == null || plan.getMeals() == null) {
            return;
        }

        for (MealPlan.MealPlanMeal meal : plan.getMeals()) {
            if (meal.getRecipe() != null) {
                continue;
            }
            Recipe recipe = globalRecipeDAO.getRecipeById(meal.getRecipeId()).orElseGet(() -> recipeDAO.get(meal.getRecipeId()));
            meal.setRecipe(recipe);
        }
    }

    private Recipe requireRecipe(int recipeId) {
        Recipe r = recipeDAO.get(recipeId);
        if (r == null)
            throw new IllegalArgumentException("Receita não encontrada: " + recipeId);
        return r;
    }

    private LocalDate parseWeekStart(String raw) {
        if (raw == null || raw.isBlank())
            throw new IllegalArgumentException("weekStart é obrigatório (formato: YYYY-MM-DD).");
        try {
            LocalDate date = LocalDate.parse(raw.trim());
            if (date.getDayOfWeek() != DayOfWeek.MONDAY)
                throw new IllegalArgumentException(
                        "weekStart deve ser uma segunda-feira, recebido: " + raw);
            return date;
        } catch (java.time.format.DateTimeParseException e) {
            throw new IllegalArgumentException("Data inválida: " + raw);
        }
    }

    private DayOfWeek parseDayOfWeek(String raw) {
        if (raw == null || raw.isBlank())
            throw new IllegalArgumentException("dayOfWeek é obrigatório.");
        try {
            return DayOfWeek.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Dia da semana inválido: " + raw);
        }
    }

    private MealType parseMealType(String raw) {
        if (raw == null || raw.isBlank())
            throw new IllegalArgumentException("mealType é obrigatório.");
        try {
            return MealType.from(raw.trim());
        } catch (Exception e) {
            throw new IllegalArgumentException("Tipo de refeição inválido: " + raw);
        }
    }

    private PlanStatus parsePlanStatus(String raw) {
        if (raw == null || raw.isBlank())
            throw new IllegalArgumentException("status é obrigatório.");
        try {
            return PlanStatus.from(raw.trim());
        } catch (Exception e) {
            throw new IllegalArgumentException("Status inválido: " + raw);
        }
    }
}