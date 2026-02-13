package alnak.business_logic.entities;

import java.util.EnumSet;
import java.util.Set;

/**
 * A canonical ingredient (e.g. "Chicken Breast").
 * Recipes reference ingredients via RecipeIngredient, which adds quantity/unit.
 */
public class Ingredient {

    private int id;
    private String name;
    private String normalizedName;   // lowercase, no accents — used for fuzzy matching
    private double pricePerUnit;     // price in € for one unit
    private Unit unit;               // reference unit for the price
    private String category;         // e.g. "MEAT", "PRODUCE", "DAIRY"
    private Set<Allergen> allergens; // allergens this ingredient contains

    public Ingredient() {
        this.allergens = EnumSet.noneOf(Allergen.class);
    }

    public Ingredient(String name, double pricePerUnit, Unit unit, String category) {
        this();
        this.name           = name;
        this.normalizedName = normalize(name);
        this.pricePerUnit   = pricePerUnit;
        this.unit           = unit;
        this.category       = category;
    }

    private static String normalize(String s) {
        return s == null ? "" : s.toLowerCase()
            .replaceAll("[áàãâä]", "a")
            .replaceAll("[éèêë]", "e")
            .replaceAll("[íìîï]", "i")
            .replaceAll("[óòõôö]", "o")
            .replaceAll("[úùûü]", "u")
            .replaceAll("[ç]", "c")
            .replaceAll("[^a-z0-9 ]", "")
            .trim();
    }

    /** Whether this ingredient contains the given allergen. */
    public boolean hasAllergen(Allergen a) {
        return allergens.contains(a);
    }

    /** Whether this ingredient contains any of the given allergens. */
    public boolean hasAnyAllergen(Set<Allergen> toCheck) {
        return allergens.stream().anyMatch(toCheck::contains);
    }

    public int getId()                    { return id; }
    public void setId(int id)             { this.id = id; }
    public String getName()               { return name; }
    public void setName(String name)      { this.name = name; this.normalizedName = normalize(name); }
    public String getNormalizedName()     { return normalizedName; }
    public double getPricePerUnit()       { return pricePerUnit; }
    public void setPricePerUnit(double p) { this.pricePerUnit = p; }
    public Unit getUnit()                 { return unit; }
    public void setUnit(Unit unit)        { this.unit = unit; }
    public String getCategory()           { return category; }
    public void setCategory(String c)     { this.category = c; }
    public Set<Allergen> getAllergens()   { return allergens; }
    public void setAllergens(Set<Allergen> a) { this.allergens = a; }
    public void addAllergen(Allergen a)   { this.allergens.add(a); }
}
