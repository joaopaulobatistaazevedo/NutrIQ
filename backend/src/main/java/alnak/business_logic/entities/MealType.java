package alnak.business_logic.entities;

public enum MealType {
    BREAKFAST, LUNCH, DINNER, SNACK;

    public static MealType from(String s) {
        String normalized = s == null ? "" : s.trim().toUpperCase();
        if ("MEAL".equals(normalized) || "REFEICAO".equals(normalized) || "REFEIÇÃO".equals(normalized)) {
            return DINNER;
        }
        return valueOf(normalized);
    }
}
