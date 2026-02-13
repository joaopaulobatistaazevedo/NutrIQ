package alnak.dto;

import alnak.models.Goal;
import alnak.models.Restriction;
import alnak.models.Sex;

import java.util.Set;

public class UpdateProfileRequest {
    private Integer age;
    private Sex sex;
    private Integer heightCm;
    private Double weightKg;
    private Goal goal;
    private Set<Restriction> restrictions;
    private Set<String> allergens;
    private Double maxWeeklyBudget;

    public Integer getAge() {
        return age;
    }

    public void setAge(Integer age) {
        this.age = age;
    }

    public Sex getSex() {
        return sex;
    }

    public void setSex(Sex sex) {
        this.sex = sex;
    }

    public Integer getHeightCm() {
        return heightCm;
    }

    public void setHeightCm(Integer heightCm) {
        this.heightCm = heightCm;
    }

    public Double getWeightKg() {
        return weightKg;
    }

    public void setWeightKg(Double weightKg) {
        this.weightKg = weightKg;
    }

    public Goal getGoal() {
        return goal;
    }

    public void setGoal(Goal goal) {
        this.goal = goal;
    }

    public Set<Restriction> getRestrictions() {
        return restrictions;
    }

    public void setRestrictions(Set<Restriction> restrictions) {
        this.restrictions = restrictions;
    }

    public Set<String> getAllergens() {
        return allergens;
    }

    public void setAllergens(Set<String> allergens) {
        this.allergens = allergens;
    }

    public Double getMaxWeeklyBudget() {
        return maxWeeklyBudget;
    }

    public void setMaxWeeklyBudget(Double maxWeeklyBudget) {
        this.maxWeeklyBudget = maxWeeklyBudget;
    }
}
