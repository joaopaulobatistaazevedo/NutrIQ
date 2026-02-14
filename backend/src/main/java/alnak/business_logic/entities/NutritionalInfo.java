package alnak.business_logic.entities;

/**
 * Immutable value object holding macro-nutrient data per serving.
 */
public final class NutritionalInfo {

    private final double calories;
    private final double proteinG;
    private final double carbsG;
    private final double fatG;

    public NutritionalInfo(double calories, double proteinG, double carbsG, double fatG) {
        this.calories = calories;
        this.proteinG = proteinG;
        this.carbsG   = carbsG;
        this.fatG     = fatG;
    }

    public double getCalories() { return calories; }
    public double getProteinG() { return proteinG; }
    public double getCarbsG() { return carbsG; }
    public double getFatG() { return fatG; }

    /** Scales all values proportionally for a given number of servings. */
    public NutritionalInfo forServings(int servings)
    {
        return new NutritionalInfo
        (
            calories * servings,
            proteinG * servings,
            carbsG   * servings,
            fatG     * servings
        );
    }

    @Override
    public String toString()
    {
        return "NutritionalInfo{cal=%.1f, protein=%.1fg, carbs=%.1fg, fat=%.1fg}"
               .formatted(calories, proteinG, carbsG, fatG);
    }
}
