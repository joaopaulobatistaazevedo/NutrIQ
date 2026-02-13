package alnak.business_logic.entities;

/**
 * The 14 EU major allergens (Regulation EU 1169/2011) plus common extras.
 * Stored as the enum name (e.g. "GLUTEN") in the DB.
 */
public enum Allergen {
    GLUTEN,
    CRUSTACEANS,
    EGGS,
    FISH,
    PEANUTS,
    SOYBEANS,
    MILK,
    NUTS,           // tree nuts (almonds, cashews, hazelnuts, etc.)
    CELERY,
    MUSTARD,
    SESAME,
    SULPHITES,
    LUPIN,
    MOLLUSCS;

    public static Allergen from(String s) {
        return valueOf(s.toUpperCase());
    }
}
