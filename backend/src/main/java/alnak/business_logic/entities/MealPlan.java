package alnak.business_logic.entities;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

public class MealPlan {

    private int id;
    private LocalDateTime createdAt;
    private LocalDate weekStart;
    private PlanStatus status = PlanStatus.ACTIVE;
    private List<MealPlanMeal> meals = new ArrayList<>();

    public MealPlan() {}

    public MealPlan(LocalDate weekStart) {
        this.weekStart = weekStart;
    }

    // ── Derived helpers ───────────────────────────────────────────

    /** All meals for a given day (1 = Monday … 7 = Sunday). */
    public List<MealPlanMeal> mealsForDay(int dayOfWeek) {
        return meals.stream()
            .filter(m -> m.getDayOfWeek().getValue() == dayOfWeek)
            .toList();
    }

    /** All meals of a given type across the whole week. */
    public List<MealPlanMeal> mealsOfType(MealType type) {
        return meals.stream()
            .filter(m -> m.getMealType() == type)
            .toList();
    }

    /** Total estimated weekly cost. */
    public double totalCost() {
        return meals.stream()
            .filter(m -> m.getRecipe() != null)
            .mapToDouble(m -> m.getRecipe().costPerServing())
            .sum();
    }

    public boolean isActive() {
        return status == PlanStatus.ACTIVE;
    }

    // ── Getters / Setters ─────────────────────────────────────────

    public int getId()                              { return id; }
    public void setId(int id)                       { this.id = id; }
    public LocalDateTime getCreatedAt()             { return createdAt; }
    public void setCreatedAt(LocalDateTime t)       { this.createdAt = t; }
    public LocalDate getWeekStart()                 { return weekStart; }
    public void setWeekStart(LocalDate weekStart)   { this.weekStart = weekStart; }
    public PlanStatus getStatus()                   { return status; }
    public void setStatus(PlanStatus status)        { this.status = status; }
    public List<MealPlanMeal> getMeals()            { return meals; }
    public void setMeals(List<MealPlanMeal> meals)  { this.meals = meals; }

    // ── Embedded type for a meal within a plan (moved from MealPlanMeal.java) ─
    public static class MealPlanMeal {

        private int id;
        private int mealPlanId;
        private int recipeId;
        private DayOfWeek dayOfWeek;
        private MealType mealType;
        private boolean completed;
        private String photoPath;
        private LocalDateTime completedAt;

        /** Populated when fetching with JOIN — avoids a second query. */
        private Recipe recipe;

        public MealPlanMeal() {}

        public MealPlanMeal(int mealPlanId, Recipe recipe, DayOfWeek day, MealType type) {
            this.mealPlanId = mealPlanId;
            this.recipe     = recipe;
            this.recipeId   = recipe.getId();
            this.dayOfWeek  = day;
            this.mealType   = type;
        }

        // ── Derived helpers ───────────────────────────────────────────

        public void markCompleted(String photoPath) {
            this.completed    = true;
            this.photoPath    = photoPath;
            this.completedAt  = LocalDateTime.now();
        }

        public boolean hasPhoto() {
            return photoPath != null && !photoPath.isBlank();
        }

        // ── Getters / Setters ─────────────────────────────────────────

        public int getId()                            { return id; }
        public void setId(int id)                     { this.id = id; }
        public int getMealPlanId()                    { return mealPlanId; }
        public void setMealPlanId(int mealPlanId)     { this.mealPlanId = mealPlanId; }
        public int getRecipeId()                      { return recipeId; }
        public void setRecipeId(int recipeId)         { this.recipeId = recipeId; }
        public DayOfWeek getDayOfWeek()               { return dayOfWeek; }
        public void setDayOfWeek(DayOfWeek dayOfWeek) { this.dayOfWeek = dayOfWeek; }
        public MealType getMealType()                 { return mealType; }
        public void setMealType(MealType mealType)    { this.mealType = mealType; }
        public boolean isCompleted()                  { return completed; }
        public void setCompleted(boolean completed)   { this.completed = completed; }
        public String getPhotoPath()                  { return photoPath; }
        public void setPhotoPath(String photoPath)    { this.photoPath = photoPath; }
        public LocalDateTime getCompletedAt()         { return completedAt; }
        public void setCompletedAt(LocalDateTime t)   { this.completedAt = t; }
        public Recipe getRecipe()                     { return recipe; }
        public void setRecipe(Recipe recipe)          { this.recipe = recipe; }
    }
}
