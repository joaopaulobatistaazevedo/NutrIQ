package alnak.business_logic.entities;

public enum Restriction {
    VEGETARIAN,
    VEGAN,
    GLUTEN_FREE,
    LACTOSE_FREE,
    HALAL,
    KOSHER,
    LOW_CARB,
    LOW_FAT,
    HIGH_PROTEIN;

    public static Restriction from(String s) {
        return valueOf(s.toUpperCase());
    }
}
