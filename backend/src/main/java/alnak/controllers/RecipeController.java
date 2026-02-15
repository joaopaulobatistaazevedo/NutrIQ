package alnak.controllers;

import java.util.List;
import java.util.Map;
import java.util.Set;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

import alnak.business_logic.entities.Allergen;
import alnak.business_logic.entities.Recipe;
import alnak.dto.RecipeDTOs.RecipeResponse;
import alnak.services.RecipeService;

public class RecipeController {

    private final RecipeService recipeService;
    private final ObjectMapper  mapper;

    public RecipeController(RecipeService recipeService) {
        this.recipeService = recipeService;
        this.mapper = new ObjectMapper()
            .registerModule(new JavaTimeModule())
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)
            .configure(DeserializationFeature.READ_UNKNOWN_ENUM_VALUES_AS_NULL, true);
    }

    // ── Read ──────────────────────────────────────────────────────

    public List<RecipeResponse> listAll() {
        return RecipeResponse.fromList(recipeService.listAll());
    }

    /** List all recipes, annotating which ones the user has favorited. */
    public List<RecipeResponse> listAll(Long userId) {
        Set<Integer> favIds = userId != null ? recipeService.listFavoriteIds(userId) : Set.of();
        return RecipeResponse.fromList(recipeService.listAll(), favIds);
    }

    public RecipeResponse getById(int id) {
        return RecipeResponse.from(recipeService.getById(id));
    }

    /** Get recipe by id with favorite status for user. */
    public RecipeResponse getById(int id, Long userId) {
        Recipe recipe = recipeService.getById(id);
        boolean fav = userId != null && recipeService.isFavorite(userId, id);
        return RecipeResponse.from(recipe, fav);
    }

    public List<RecipeResponse> search(String query) {
        return RecipeResponse.fromList(recipeService.search(query));
    }

    public List<RecipeResponse> listByMealType(String mealType) {
        return RecipeResponse.fromList(recipeService.listByMealType(mealType));
    }

    public List<RecipeResponse> filter(String mealType, int minCal, int maxCal,
                                       String allergensRaw, String excludeTagsRaw) {
        Set<Allergen> allergens   = parseAllergens(allergensRaw);
        Set<String>   excludeTags = parseTags(excludeTagsRaw);
        return RecipeResponse.fromList(
                recipeService.filter(mealType, minCal, maxCal, allergens, excludeTags));
    }

    // ── User recipes ──────────────────────────────────────────────

    /** List recipes created by the authenticated user. */
    public List<RecipeResponse> listMyRecipes(long userId) {
        Set<Integer> favIds = recipeService.listFavoriteIds(userId);
        return RecipeResponse.fromList(recipeService.listUserRecipes(userId), favIds);
    }

    /** Create a recipe owned by the authenticated user. */
    public RecipeResponse createForUser(long userId, String body) throws Exception {
        Recipe recipe = mapper.readValue(body, Recipe.class);
        return RecipeResponse.from(recipeService.createForUser(userId, recipe));
    }

    /** Update a recipe owned by the authenticated user. */
    public RecipeResponse updateForUser(long userId, int id, String body) throws Exception {
        Recipe recipe = mapper.readValue(body, Recipe.class);
        return RecipeResponse.from(recipeService.updateForUser(userId, id, recipe));
    }

    /** Delete a recipe owned by the authenticated user. */
    public void deleteForUser(long userId, int id) {
        recipeService.deleteForUser(userId, id);
    }

    // ── Favorites ─────────────────────────────────────────────────

    /** Toggle favorite status for a recipe. Returns { "favorited": true/false }. */
    public Map<String, Object> toggleFavorite(long userId, int recipeId) {
        boolean added = recipeService.toggleFavorite(userId, recipeId);
        return Map.of("favorited", added, "recipeId", recipeId);
    }

    /** Check if a recipe is favorited. */
    public Map<String, Object> checkFavorite(long userId, int recipeId) {
        boolean fav = recipeService.isFavorite(userId, recipeId);
        return Map.of("favorited", fav, "recipeId", recipeId);
    }

    /** List recipes favorited by the authenticated user. */
    public List<RecipeResponse> listFavorites(long userId) {
        return RecipeResponse.fromList(
                recipeService.listFavoriteRecipes(userId),
                recipeService.listFavoriteIds(userId));
    }

    /** List all recipes a user has access to (own + favorites) — for chatbot. */
    public List<RecipeResponse> listUserAccessible(long userId) {
        return RecipeResponse.fromList(recipeService.listUserAccessibleRecipes(userId));
    }

    // ── Write (legacy — no auth) ──────────────────────────────────

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