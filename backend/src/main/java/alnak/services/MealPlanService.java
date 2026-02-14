package alnak.services;

import alnak.business_logic.entities.MealPlan;
import alnak.business_logic.entities.MealType;
import alnak.business_logic.entities.PlanStatus;
import alnak.business_logic.entities.Recipe;
import alnak.data.local.MealPlanDAO;
import alnak.data.local.RecipeDAO;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

/**
 * Business logic for meal plans.
 *
 * The DAO is an AbstractList ordered newest-first; the service works in
 * terms of plan IDs (from HTTP routes) and resolves positions internally.
 * All callers only ever see/use IDs.
 */
public class MealPlanService {

    private final MealPlanDAO mealPlanDAO;
    private final RecipeDAO   recipeDAO;

    public MealPlanService(MealPlanDAO mealPlanDAO, RecipeDAO recipeDAO) {
        this.mealPlanDAO = mealPlanDAO;
        this.recipeDAO   = recipeDAO;
    }

    // ── Plan lifecycle ────────────────────────────────────────────

    /**
     * Create a new meal plan for the given week.
     *
     * @param weekStart Monday of the target week (ISO date string, e.g. "2025-06-09")
     */
    public MealPlan createPlan(String weekStart) {
        LocalDate date = parseWeekStart(weekStart);
        MealPlan plan = new MealPlan(date);
        plan.setStatus(PlanStatus.ACTIVE);
        mealPlanDAO.add(plan);    // populates plan.id via RETURN_GENERATED_KEYS
        return plan;
    }

    /**
     * Returns all plans, newest first.
     */
    public List<MealPlan> listAll() {
        // AbstractList.subList / stream copy — avoids holding a live DAO reference
        return List.copyOf(mealPlanDAO);
    }

    /**
     * Returns the most recent active plan, if one exists.
     */
    public Optional<MealPlan> getActivePlan() {
        return mealPlanDAO.getActive();
    }

    /**
     * Find a plan by its database id.
     */
    public MealPlan getPlanById(int planId) {
        return findPlanById(planId);   // throws if not found
    }

    /**
     * Update the status of a plan (e.g. ACTIVE → COMPLETED).
     */
    public MealPlan updateStatus(int planId, String statusRaw) {
        PlanStatus status = parsePlanStatus(statusRaw);
        MealPlan plan = findPlanById(planId);
        mealPlanDAO.setStatus(plan.getId(), status);
        plan.setStatus(status);
        return plan;
    }

    /**
     * Delete a plan and all its meals (cascade is handled by the DAO).
     */
    public void deletePlan(int planId) {
        int index = requirePlanIndex(planId);
        mealPlanDAO.remove(index);
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
    public MealPlan.MealPlanMeal addMeal(int planId, int recipeId,
                                         String dayRaw, String mealTypeRaw) {
        MealPlan plan    = findPlanById(planId);
        Recipe   recipe  = requireRecipe(recipeId);
        DayOfWeek  day   = parseDayOfWeek(dayRaw);
        MealType   type  = parseMealType(mealTypeRaw);

        MealPlan.MealPlanMeal meal = new MealPlan.MealPlanMeal(planId, recipe, day, type);
        mealPlanDAO.addMeal(meal);   // populates meal.id

        // keep the in-memory plan consistent so callers don't need to re-fetch
        plan.getMeals().add(meal);
        return meal;
    }

    /**
     * Remove a meal slot from a plan.
     * Uses a direct DELETE via {@link MealPlanDAO#removeMeal(int)}.
     *
     * @param planId the owning plan (validated for existence)
     * @param mealId the meal row id to delete
     */
    public void removeMeal(int planId, int mealId) {
        MealPlan plan = findPlanById(planId);
        boolean owned = plan.getMeals().stream()
                .anyMatch(m -> m.getId() == mealId);
        if (!owned)
            throw new IllegalArgumentException(
                    "Meal " + mealId + " does not belong to plan " + planId);
        mealPlanDAO.removeMeal(mealId);
    }

    /**
     * Replace the recipe in an existing meal slot.
     *
     * @param planId      the owning plan (validated for existence)
     * @param mealId      the meal slot to update
     * @param newRecipeId replacement recipe — must exist locally
     */
    public MealPlan.MealPlanMeal swapRecipe(int planId, int mealId, int newRecipeId) {
        MealPlan plan   = findPlanById(planId);
        Recipe   recipe = requireRecipe(newRecipeId);

        MealPlan.MealPlanMeal meal = plan.getMeals().stream()
                .filter(m -> m.getId() == mealId)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException(
                        "Meal " + mealId + " does not belong to plan " + planId));

        mealPlanDAO.swapRecipe(mealId, newRecipeId);
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
    public MealPlan.MealPlanMeal completeMeal(int planId, int mealId, String photoPath) {
        MealPlan plan = findPlanById(planId);
        MealPlan.MealPlanMeal meal = plan.getMeals().stream()
                .filter(m -> m.getId() == mealId)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException(
                        "Meal " + mealId + " does not belong to plan " + planId));

        mealPlanDAO.completeMeal(mealId, photoPath);
        meal.markCompleted(photoPath);   // updates in-memory state
        return meal;
    }

    /**
     * Returns all meals for a specific day within a plan.
     *
     * @param dayRaw e.g. "TUESDAY"
     */
    public List<MealPlan.MealPlanMeal> getMealsForDay(int planId, String dayRaw) {
        MealPlan  plan = findPlanById(planId);
        DayOfWeek day  = parseDayOfWeek(dayRaw);
        return plan.mealsForDay(day.getValue());
    }

    /**
     * Returns all meals of a given type (e.g. all breakfasts) in a plan.
     */
    public List<MealPlan.MealPlanMeal> getMealsByType(int planId, String mealTypeRaw) {
        MealPlan plan = findPlanById(planId);
        MealType type = parseMealType(mealTypeRaw);
        return plan.mealsOfType(type);
    }

    // ── Stats ─────────────────────────────────────────────────────

    public int completedMealCount() {
        return mealPlanDAO.completedMealCount();
    }

    public List<String> allPhotos() {
        return mealPlanDAO.photos();
    }

    // ── Private helpers ───────────────────────────────────────────

    /**
     * Iterates the DAO (newest-first list) to find a plan by id.
     * Throws {@link IllegalArgumentException} if not found.
     */
    private MealPlan findPlanById(int planId) {
        return mealPlanDAO.stream()
                .filter(p -> p.getId() == planId)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException(
                        "Plano de refeições não encontrado: " + planId));
    }

    /**
     * Returns the list index of a plan by id — needed for remove().
     */
    private int requirePlanIndex(int planId) {
        for (int i = 0; i < mealPlanDAO.size(); i++) {
            if (mealPlanDAO.get(i).getId() == planId) return i;
        }
        throw new IllegalArgumentException("Plano de refeições não encontrado: " + planId);
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