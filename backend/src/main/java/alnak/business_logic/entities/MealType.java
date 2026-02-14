package alnak.business_logic.entities;

public enum MealType {
    BREAKFAST, LUNCH, DINNER, SNACK;

    public static MealType from(String s) {
        return valueOf(s.toUpperCase());
    }
}
