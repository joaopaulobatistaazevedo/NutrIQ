package alnak.dto;

import alnak.business_logic.entities.NutritionalInfo;
import alnak.business_logic.entities.Recipe;

public class RecipeSummaryResponse {
    private int id;
    private String name;
    private String description;
    private String mealType;
    private int prepTimeMin;
    private int cookTimeMin;
    private int totalTimeMin;
    private int servings;
    private double calories;
    private double proteinG;
    private double carbsG;
    private double fatG;
    private String imageUrl;
    private String sourceUrl;

    public static RecipeSummaryResponse from(Recipe recipe) {
        RecipeSummaryResponse response = new RecipeSummaryResponse();
        response.setId(recipe.getId());
        response.setName(recipe.getName());
        response.setDescription(recipe.getDescription());
        response.setMealType(recipe.getMealType() != null ? recipe.getMealType().name() : null);
        response.setPrepTimeMin(recipe.getPrepTimeMin());
        response.setCookTimeMin(recipe.getCookTimeMin());
        response.setTotalTimeMin(recipe.totalTimeMin());
        response.setServings(recipe.getServings());
        response.setImageUrl(recipe.getImageUrl());
        response.setSourceUrl(extractSourceUrl(recipe.getDescription()));

        NutritionalInfo nutritionalInfo = recipe.getNutritionalInfo();
        if (nutritionalInfo != null) {
            response.setCalories(nutritionalInfo.getCalories());
            response.setProteinG(nutritionalInfo.getProteinG());
            response.setCarbsG(nutritionalInfo.getCarbsG());
            response.setFatG(nutritionalInfo.getFatG());
        }
        return response;
    }

    private static String extractSourceUrl(String description) {
        if (description == null || description.isBlank()) {
            return null;
        }

        String marker = "URL:";
        int idx = description.indexOf(marker);
        if (idx < 0) {
            return null;
        }

        String after = description.substring(idx + marker.length()).trim();
        int delimiter = after.indexOf(" | ");
        if (delimiter >= 0) {
            after = after.substring(0, delimiter).trim();
        }

        if (after.startsWith("http://") || after.startsWith("https://")) {
            return after;
        }
        return null;
    }

    public int getId() {
        return id;
    }

    public void setId(int id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getMealType() {
        return mealType;
    }

    public void setMealType(String mealType) {
        this.mealType = mealType;
    }

    public int getPrepTimeMin() {
        return prepTimeMin;
    }

    public void setPrepTimeMin(int prepTimeMin) {
        this.prepTimeMin = prepTimeMin;
    }

    public int getCookTimeMin() {
        return cookTimeMin;
    }

    public void setCookTimeMin(int cookTimeMin) {
        this.cookTimeMin = cookTimeMin;
    }

    public int getTotalTimeMin() {
        return totalTimeMin;
    }

    public void setTotalTimeMin(int totalTimeMin) {
        this.totalTimeMin = totalTimeMin;
    }

    public int getServings() {
        return servings;
    }

    public void setServings(int servings) {
        this.servings = servings;
    }

    public double getCalories() {
        return calories;
    }

    public void setCalories(double calories) {
        this.calories = calories;
    }

    public double getProteinG() {
        return proteinG;
    }

    public void setProteinG(double proteinG) {
        this.proteinG = proteinG;
    }

    public double getCarbsG() {
        return carbsG;
    }

    public void setCarbsG(double carbsG) {
        this.carbsG = carbsG;
    }

    public double getFatG() {
        return fatG;
    }

    public void setFatG(double fatG) {
        this.fatG = fatG;
    }

    public String getImageUrl() {
        return imageUrl;
    }

    public void setImageUrl(String imageUrl) {
        this.imageUrl = imageUrl;
    }

    public String getSourceUrl() {
        return sourceUrl;
    }

    public void setSourceUrl(String sourceUrl) {
        this.sourceUrl = sourceUrl;
    }
}
