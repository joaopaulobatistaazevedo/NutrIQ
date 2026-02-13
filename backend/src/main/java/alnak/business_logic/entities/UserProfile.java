package alnak.business_logic.entities;

import java.util.EnumSet;
import java.util.Set;

public class UserProfile {

    private int age;
    private Sex sex;
    private int heightCm;
    private double weightKg;
    private Goal goal;
    private int dailyCalories;           // calculated via Harris-Benedict
    private double budgetWeekly;
    private Set<Restriction> restrictions = EnumSet.noneOf(Restriction.class);
    private Set<Allergen> allergens       = EnumSet.noneOf(Allergen.class);

    public UserProfile() {}

    // ── Derived helpers ───────────────────────────────────────────

    /**
     * Calculates BMR using the Mifflin-St Jeor equation,
     * then adjusts for goal. Result stored in dailyCalories.
     */
    public int calculateDailyCalories() {
        double bmr;
        if (sex == Sex.M) {
            bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
        } else {
            bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
        }
        this.dailyCalories = (int) switch (goal) {
            case LOSE_WEIGHT -> bmr * 1.2 - 500;
            case BULK        -> bmr * 1.5 + 300;
            case MAINTAIN    -> bmr * 1.4;
        };
        return this.dailyCalories;
    }

    public boolean isVegetarian() { return restrictions.contains(Restriction.VEGETARIAN); }
    public boolean isVegan()      { return restrictions.contains(Restriction.VEGAN); }

    // ── Getters / Setters ─────────────────────────────────────────

    public int getAge()
    {
        return age;
    }

    public void setAge(int age)
    {
        this.age = age;
    }

    public Sex getSex()                               { return sex; }
    public void setSex(Sex sex)                       { this.sex = sex; }
    public int getHeightCm()                          { return heightCm; }
    public void setHeightCm(int heightCm)             { this.heightCm = heightCm; }
    public double getWeightKg()                       { return weightKg; }
    public void setWeightKg(double weightKg)          { this.weightKg = weightKg; }
    public Goal getGoal()                             { return goal; }
    public void setGoal(Goal goal)                    { this.goal = goal; }
    public int getDailyCalories()                     { return dailyCalories; }
    public void setDailyCalories(int dailyCalories)   { this.dailyCalories = dailyCalories; }
    public double getBudgetWeekly()                   { return budgetWeekly; }
    public void setBudgetWeekly(double budgetWeekly)  { this.budgetWeekly = budgetWeekly; }
    public double getMaxWeeklyBudget()                { return budgetWeekly; }
    public void setMaxWeeklyBudget(double maxBudget)  { this.budgetWeekly = maxBudget; }
    public Set<Restriction> getRestrictions()         { return restrictions; }
    public void setRestrictions(Set<Restriction> r)   {
        this.restrictions = EnumSet.noneOf(Restriction.class);
        if (r != null) this.restrictions.addAll(r);
    }
    public void replaceRestrictions(Set<Restriction> r) {
        restrictions.clear();
        if (r != null) restrictions.addAll(r);
    }
    public Set<Allergen> getAllergens()               { return allergens; }
    public void setAllergens(Set<Allergen> a)         {
        this.allergens = EnumSet.noneOf(Allergen.class);
        if (a != null) this.allergens.addAll(a);
    }
    public void replaceAllergens(Set<Allergen> a) {
        allergens.clear();
        if (a != null) allergens.addAll(a);
    }
}
