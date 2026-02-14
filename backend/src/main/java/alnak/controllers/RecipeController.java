package alnak.controllers;

import alnak.business_logic.entities.Allergen;
import alnak.business_logic.entities.Recipe;
import alnak.dto.RecipeDTOs.*;
import alnak.services.RecipeService;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

import java.util.List;
import java.util.Set;

public class RecipeController {

    private final RecipeService recipeService;
    private final ObjectMapper  mapper;

    public RecipeController(RecipeService recipeService) {
        this.recipeService = recipeService;
        this.mapper = new ObjectMapper().registerModule(new JavaTimeModule());
    }

    // ── Read ──────────────────────────────────────────────────────

    public List<RecipeResponse> listAll() {
        return RecipeResponse.fromList(recipeService.listAll());
    }

    public RecipeResponse getById(int id) {
        return RecipeResponse.from(recipeService.getById(id));
    }

    public List<RecipeResponse> search(String query) {
        return RecipeResponse.fromList(recipeService.search(query));
    }

    public List<RecipeResponse> listByMealType(String mealType) {
        return RecipeResponse.fromList(recipeService.listByMealType(mealType));
    }

    /**
     * Filtered search for meal planning.
     * Accepts query params: mealType, minCal, maxCal, allergens (comma-separated), excludeTags (comma-separated)
     */
    public List<RecipeResponse> filter(String mealType, int minCal, int maxCal,
                                       String allergensRaw, String excludeTagsRaw) {
        Set<Allergen> allergens   = parseAllergens(allergensRaw);
        Set<String>   excludeTags = parseTags(excludeTagsRaw);
        return RecipeResponse.fromList(
                recipeService.filter(mealType, minCal, maxCal, allergens, excludeTags));
    }

    // ── Write ─────────────────────────────────────────────────────

    public RecipeResponse create(String body) throws Exception {
        Recipe recipe = mapper.readValue(body, Recipe.class);
        return RecipeResponse.from(recipeService.create(recipe));
    }

    public RecipeResponse update(int id, String body) throws Exception {
        Recipe recipe = mapper.readValue(body, Recipe.class);
        return RecipeResponse.from(recipeService.update(id, recipe));
    }

    public void delete(int id) {
        recipeService.delete(id);
    }

    // ── Private helpers ───────────────────────────────────────────

    private Set<Allergen> parseAllergens(String raw) {
        if (raw == null || raw.isBlank()) return Set.of();
        Set<Allergen> result = new java.util.LinkedHashSet<>();
        for (String token : raw.split(",")) {
            String t = token.trim().toUpperCase();
            if (!t.isEmpty()) {
                try { result.add(Allergen.valueOf(t)); }
                catch (IllegalArgumentException e) {
                    throw new IllegalArgumentException("Alergénio inválido: " + token.trim());
                }
            }
        }
        return result;
    }

    private Set<String> parseTags(String raw) {
        if (raw == null || raw.isBlank()) return Set.of();
        Set<String> result = new java.util.LinkedHashSet<>();
        for (String token : raw.split(",")) {
            String t = token.trim().toLowerCase();
            if (!t.isEmpty()) result.add(t);
        }
        return result;
    }
}