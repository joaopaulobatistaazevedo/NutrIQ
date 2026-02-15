package alnak.business_logic.entities;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public class Recipe {
    private Set<String> tags = new HashSet<>();
    private int id;
    private String name;
    private String description;

    private List<RecipeIngredient> ingredients = new ArrayList<>();
    private List<RecipeStep> steps = new ArrayList<>();
    private NutritionalInfo nutritionalInfo;
    private MealType mealType;

    private int prepTimeMin;
    private int cookTimeMin;
    private int servings = 2;
    private String imageUrl;

    public Recipe() {}

    public int totalTimeMin() {
        return prepTimeMin + cookTimeMin;
    }

    public double estimatedCost() {
        return ingredients.stream()
            .mapToDouble(RecipeIngredient::estimatedCost)
            .sum();
    }

    /** Cost per serving. */
    public double costPerServing() {
        return servings > 0 ? estimatedCost() / servings : 0;
    }

    /** True if none of the recipe's ingredients contain any of the given allergens. */
    public boolean isSafeFor(Set<Allergen> allergens) {
        return ingredients.stream()
            .map(RecipeIngredient::getIngredient)
            .noneMatch(ing -> ing != null && ing.hasAnyAllergen(allergens));
    }

    /** True if the recipe carries all of the given tags. */
    public boolean hasAllTags(Set<String> required) {
        return tags.containsAll(required);
    }

    public boolean hasTag(String tag) {
        return tags.contains(tag.toLowerCase());
    }

    /** Calories per serving (delegates to NutritionalInfo). */
    public double calories() {
        return nutritionalInfo != null ? nutritionalInfo.getCalories() : 0;
    }

    // ── Getters / Setters ─────────────────────────────────────────

    public int getId()                                      { return id; }
    public void setId(int id)                               { this.id = id; }
    public String getName()                                 { return name; }
    public void setName(String name)                        { this.name = name; }
    public String getDescription()                          { return description; }
    public void setDescription(String description)          { this.description = description; }
    public MealType getMealType()                           { return mealType; }
    public void setMealType(MealType mealType)              { this.mealType = mealType; }
    public List<RecipeIngredient> getIngredients()          { return ingredients; }
    public void setIngredients(List<RecipeIngredient> i)    { this.ingredients = i; }
    public List<RecipeStep> getSteps()                      { return steps; }
    public void setSteps(List<RecipeStep> steps)            { this.steps = steps; }
    public int getPrepTimeMin()                             { return prepTimeMin; }
    public void setPrepTimeMin(int prepTimeMin)             { this.prepTimeMin = prepTimeMin; }
    public int getCookTimeMin()                             { return cookTimeMin; }
    public void setCookTimeMin(int cookTimeMin)             { this.cookTimeMin = cookTimeMin; }
    public int getServings()                                { return servings; }
    public void setServings(int servings)                   { this.servings = servings; }
    public NutritionalInfo getNutritionalInfo()             { return nutritionalInfo; }
    public void setNutritionalInfo(NutritionalInfo n)       { this.nutritionalInfo = n; }
    public String getImageUrl()                             { return imageUrl; }
    public void setImageUrl(String imageUrl)                { this.imageUrl = imageUrl; }
    public Set<String> getTags()                            { return tags; }
    public void setTags(Set<String> tags)                   { this.tags = tags; }

    // ── Embedded types (moved from separate files) ───────────────────

    public static class RecipeIngredient {
        private int id;
        private int recipeId;
        private Ingredient ingredient;
        private double quantity;
        private Unit unit;
        private String notes; // optional: "finely chopped", "room temperature"

        public RecipeIngredient() {}

        public RecipeIngredient(Ingredient ingredient, double quantity, Unit unit) {
            this.ingredient = ingredient;
            this.quantity   = quantity;
            this.unit       = unit;
        }

        /** Estimated cost of this line item based on the ingredient's unit price. */
        public double estimatedCost() {
            if (ingredient == null || ingredient.getPricePerUnit() == 0) return 0;
            return ingredient.getPricePerUnit() * quantity;
        }

        @Override
        public String toString() {
            return "%.1f %s %s".formatted(quantity, unit.name().toLowerCase(), ingredient.getName());
        }

        public int getId()                        { return id; }
        public void setId(int id)                 { this.id = id; }
        public int getRecipeId()                  { return recipeId; }
        public void setRecipeId(int recipeId)     { this.recipeId = recipeId; }
        public Ingredient getIngredient()         { return ingredient; }
        public void setIngredient(Ingredient i)   { this.ingredient = i; }
        public double getQuantity()               { return quantity; }
        public void setQuantity(double quantity)  { this.quantity = quantity; }
        public Unit getUnit()                     { return unit; }
        public void setUnit(Unit unit)            { this.unit = unit; }
        public String getNotes()                  { return notes; }
        public void setNotes(String notes)        { this.notes = notes; }
    }

    public static class RecipeStep {

        private int id;
        private int recipeId;
        private int stepOrder; // 1-based
        private String description;
        private int durationMinutes; // 0 if not time-bounded

        public RecipeStep() {}

        public RecipeStep(int stepOrder, String description) {
            this.stepOrder   = stepOrder;
            this.description = description;
        }

        public RecipeStep(int stepOrder, String description, int durationMinutes) {
            this(stepOrder, description);
            this.durationMinutes = durationMinutes;
        }

        @Override
        public String toString() {
            return "%d. %s".formatted(stepOrder, description);
        }

        public int getId()                          { return id; }
        public void setId(int id)                   { this.id = id; }
        public int getRecipeId()                    { return recipeId; }
        public void setRecipeId(int recipeId)       { this.recipeId = recipeId; }
        public int getStepOrder()                   { return stepOrder; }
        public void setStepOrder(int stepOrder)     { this.stepOrder = stepOrder; }
        public String getDescription()              { return description; }
        public void setDescription(String d)        { this.description = d; }
        public int getDurationMinutes()             { return durationMinutes; }
        public void setDurationMinutes(int d)       { this.durationMinutes = d; }
    }
}
