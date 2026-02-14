package alnak;

import alnak.controllers.AuthController;
import alnak.controllers.MealPlanController;
import alnak.controllers.PriceController;
import alnak.controllers.RecipeController;
import alnak.controllers.SocialController;
import alnak.controllers.ShoppingCartController;
import alnak.controllers.UserController;
import alnak.data.global.FriendshipDAO;
import alnak.data.global.GlobalDatabase;
import alnak.data.global.GlobalRecipeDAO;
import alnak.data.global.GlobalMealPlanDAO;
import alnak.data.global.PostDAO;
import alnak.data.global.UserDAO;
import alnak.data.local.IngredientMarketPriceDAO;
import alnak.data.local.RecipeDAO;
import alnak.data.local.ShoppingCartSnapshotDAO;
import alnak.dto.LoginRequest;
import alnak.dto.RegisterRequest;
import alnak.dto.UpdateProfileRequest;
import alnak.services.AuthService;
import alnak.services.MealPlanService;
import alnak.services.PriceImportService;
import alnak.services.RecipeService;
import alnak.services.SocialService;
import alnak.services.ShoppingCartService;
import alnak.services.UserService;
import alnak.utils.JWTUtil;
import io.javalin.Javalin;

import java.sql.SQLException;
import java.util.Map;

public class Main {

    public static void main(String[] args) {
        int port = resolvePort();

        // ── DAOs ──────────────────────────────────────────────────
        // Global (MySQL)
        UserDAO          userDAO          = new UserDAO();
        PostDAO          postDAO          = new PostDAO();
        FriendshipDAO    friendshipDAO    = new FriendshipDAO();
        GlobalRecipeDAO  globalRecipeDAO  = new GlobalRecipeDAO();
        GlobalMealPlanDAO globalMealPlanDAO = new GlobalMealPlanDAO();

        // Local (SQLite)
        RecipeDAO              recipeDAO              = new RecipeDAO();
        IngredientMarketPriceDAO ingredientMarketPriceDAO = new IngredientMarketPriceDAO();
        ShoppingCartSnapshotDAO shoppingCartSnapshotDAO = new ShoppingCartSnapshotDAO();

        // ── Services ──────────────────────────────────────────────
        JWTUtil          jwtUtil          = new JWTUtil();
        AuthService      authService      = new AuthService(userDAO, jwtUtil);
        UserService      userService      = new UserService(userDAO);
        PriceImportService priceImportService = new PriceImportService(ingredientMarketPriceDAO);
        RecipeService    recipeService    = new RecipeService(recipeDAO, globalRecipeDAO);
        MealPlanService  mealPlanService  = new MealPlanService(globalMealPlanDAO, globalRecipeDAO, recipeDAO);
        SocialService    socialService    = new SocialService(
                postDAO, friendshipDAO, globalRecipeDAO, recipeDAO);
        ShoppingCartService shoppingCartService = new ShoppingCartService(shoppingCartSnapshotDAO);

        // ── Controllers ───────────────────────────────────────────
        AuthController     authController     = new AuthController(authService);
        UserController     userController     = new UserController(userService, socialService);
        PriceController    priceController    = new PriceController(priceImportService);
        RecipeController   recipeController   = new RecipeController(recipeService);
        MealPlanController mealPlanController = new MealPlanController(mealPlanService);
        SocialController   socialController   = new SocialController(socialService);
        ShoppingCartController shoppingCartController = new ShoppingCartController(shoppingCartService);

        // ── App ───────────────────────────────────────────────────
        Javalin app = Javalin.create(config ->
                config.plugins.enableCors(cors -> cors.add(it -> it.anyHost())));

        app.exception(IllegalArgumentException.class,
                (e, ctx) -> ctx.status(400).json(Map.of("error", e.getMessage())));
        app.exception(SecurityException.class,
                (e, ctx) -> ctx.status(403).json(Map.of("error", e.getMessage())));

        app.after(ctx -> {
            try {
                GlobalDatabase.getInstance().getConnection().close();
            } catch (SQLException | RuntimeException ignored) {
            }
        });

        // ── Auth routes ───────────────────────────────────────────
        app.post("/api/auth/register", ctx -> {
            RegisterRequest request = ctx.bodyAsClass(RegisterRequest.class);
            ctx.status(201).json(authController.register(request));
        });

        app.post("/api/auth/login", ctx -> {
            LoginRequest request = ctx.bodyAsClass(LoginRequest.class);
            ctx.json(authController.login(request));
        });


        app.post("/api/auth/forgot-password", ctx -> {
            Map<String, Object> payload = ctx.bodyAsClass(Map.class);
            Object emailValue = payload.get("email");
            String email = emailValue == null ? null : emailValue.toString();
            ctx.json(authController.forgotPassword(email));
        });

        // ── User routes ───────────────────────────────────────────
        app.get("/api/users/me", ctx -> {
            Long userId = extractUserId(ctx.header("Authorization"), jwtUtil);
            ctx.json(userController.me(userId));
        });

        app.put("/api/users/me/profile", ctx -> {
            Long userId = extractUserId(ctx.header("Authorization"), jwtUtil);
            UpdateProfileRequest request = ctx.bodyAsClass(UpdateProfileRequest.class);
            ctx.json(userController.updateMyProfile(userId, request));
        });

        app.post("/api/users/me/streak/photo", ctx -> {
            Long userId = extractUserId(ctx.header("Authorization"), jwtUtil);
            ctx.status(201).json(userController.registerMealPhoto(userId, ctx.body()));
        });

        app.get("/api/debug/users", ctx ->
                ctx.json(userController.listUsers()));

        app.get("/api/debug/users/{id}", ctx -> {
            Long userId = Long.parseLong(ctx.pathParam("id"));
            ctx.json(userController.getById(userId));
        });

        // ── Price routes ──────────────────────────────────────────
        app.post("/api/prices/import", ctx -> {
            var response = priceController.importReport(ctx.body());
            ctx.status(201).json(response);
        });

        app.get("/api/prices", ctx ->
                ctx.json(priceController.listPrices()));

        app.get("/api/prices/{ingredient}/cheapest", ctx -> {
            String ingredient = ctx.pathParam("ingredient");
            ctx.json(priceController.cheapestIngredientPrice(ingredient));
        });

        app.get("/api/prices/{ingredient}", ctx -> {
            String ingredient = ctx.pathParam("ingredient");
            ctx.json(priceController.listIngredientPrices(ingredient));
        });



        // ── Shopping cart routes ─────────────────────────────────
        app.get("/api/shopping-cart", ctx -> {
            Long userId = extractUserId(ctx.header("Authorization"), jwtUtil);
            var cart = shoppingCartController.getMyCart(userId);
            if (cart == null) {
                ctx.status(404);
                return;
            }
            ctx.json(cart);
        });

        app.put("/api/shopping-cart", ctx -> {
            Long userId = extractUserId(ctx.header("Authorization"), jwtUtil);
            ctx.json(shoppingCartController.saveMyCart(userId, ctx.body()));
        });

        // ── Recipe routes ─────────────────────────────────────────
        // NOTE: static segments (/search, /filter, /meal-type) must come
        // before the wildcard /{id} so Javalin matches them first.
        app.get("/api/recipes/search", ctx -> {
            String q = ctx.queryParam("q");
            ctx.json(recipeController.search(q));
        });

        app.get("/api/recipes/filter", ctx -> {
            String mealType    = ctx.queryParam("mealType");
            int    minCal      = intParam(ctx.queryParam("minCal"), 0);
            int    maxCal      = intParam(ctx.queryParam("maxCal"), Integer.MAX_VALUE);
            String allergens   = ctx.queryParam("allergens");   // e.g. "GLUTEN,DAIRY"
            String excludeTags = ctx.queryParam("excludeTags"); // e.g. "spicy,nuts"
            ctx.json(recipeController.filter(mealType, minCal, maxCal, allergens, excludeTags));
        });

        app.get("/api/recipes/meal-type/{type}", ctx -> {
            String type = ctx.pathParam("type");
            ctx.json(recipeController.listByMealType(type));
        });

        app.get("/api/recipes", ctx ->
                ctx.json(recipeController.listAll()));

        app.get("/api/recipes/{id}", ctx -> {
            int id = Integer.parseInt(ctx.pathParam("id"));
            ctx.json(recipeController.getById(id));
        });

        app.post("/api/recipes", ctx ->
                ctx.status(201).json(recipeController.create(ctx.body())));

        app.put("/api/recipes/{id}", ctx -> {
            int id = Integer.parseInt(ctx.pathParam("id"));
            ctx.json(recipeController.update(id, ctx.body()));
        });

        app.delete("/api/recipes/{id}", ctx -> {
            int id = Integer.parseInt(ctx.pathParam("id"));
            recipeController.delete(id);
            ctx.status(204);
        });

        // ── Meal plan routes ──────────────────────────────────────
        // Static segments before wildcards (same rule as recipes).
        app.get("/api/meal-plans/active", ctx -> {
            Long userId = extractUserId(ctx.header("Authorization"), jwtUtil);
            ctx.json(mealPlanController.getActivePlan(userId));
        });

        app.get("/api/meal-plans", ctx -> {
            Long userId = extractUserId(ctx.header("Authorization"), jwtUtil);
            ctx.json(mealPlanController.listPlans(userId));
        });

        app.post("/api/meal-plans", ctx -> {
            Long userId = extractUserId(ctx.header("Authorization"), jwtUtil);
            ctx.status(201).json(mealPlanController.createPlan(userId, ctx.body()));
        });

        app.get("/api/meal-plans/{planId}", ctx -> {
            Long userId = extractUserId(ctx.header("Authorization"), jwtUtil);
            int planId = Integer.parseInt(ctx.pathParam("planId"));
            ctx.json(mealPlanController.getPlan(userId, planId));
        });

        app.put("/api/meal-plans/{planId}/status", ctx -> {
            Long userId = extractUserId(ctx.header("Authorization"), jwtUtil);
            int planId = Integer.parseInt(ctx.pathParam("planId"));
            ctx.json(mealPlanController.updateStatus(userId, planId, ctx.body()));
        });

        app.delete("/api/meal-plans/{planId}", ctx -> {
            Long userId = extractUserId(ctx.header("Authorization"), jwtUtil);
            int planId = Integer.parseInt(ctx.pathParam("planId"));
            mealPlanController.deletePlan(userId, planId);
            ctx.status(204);
        });

        app.post("/api/meal-plans/{planId}/meals", ctx -> {
            Long userId = extractUserId(ctx.header("Authorization"), jwtUtil);
            int planId = Integer.parseInt(ctx.pathParam("planId"));
            ctx.status(201).json(mealPlanController.addMeal(userId, planId, ctx.body()));
        });

        app.delete("/api/meal-plans/{planId}/meals/{mealId}", ctx -> {
            Long userId = extractUserId(ctx.header("Authorization"), jwtUtil);
            int planId = Integer.parseInt(ctx.pathParam("planId"));
            int mealId = Integer.parseInt(ctx.pathParam("mealId"));
            mealPlanController.removeMeal(userId, planId, mealId);
            ctx.status(204);
        });

        app.put("/api/meal-plans/{planId}/meals/{mealId}/swap", ctx -> {
            Long userId = extractUserId(ctx.header("Authorization"), jwtUtil);
            int planId = Integer.parseInt(ctx.pathParam("planId"));
            int mealId = Integer.parseInt(ctx.pathParam("mealId"));
            ctx.json(mealPlanController.swapMeal(userId, planId, mealId, ctx.body()));
        });

        app.post("/api/meal-plans/{planId}/meals/{mealId}/complete", ctx -> {
            Long userId = extractUserId(ctx.header("Authorization"), jwtUtil);
            int planId = Integer.parseInt(ctx.pathParam("planId"));
            int mealId = Integer.parseInt(ctx.pathParam("mealId"));
            ctx.json(mealPlanController.completeMeal(userId, planId, mealId, ctx.body()));
        });

        app.get("/api/meal-plans/{planId}/meals/day/{day}", ctx -> {
            Long userId = extractUserId(ctx.header("Authorization"), jwtUtil);
            int    planId = Integer.parseInt(ctx.pathParam("planId"));
            String day    = ctx.pathParam("day");
            ctx.json(mealPlanController.getMealsForDay(userId, planId, day));
        });

        app.get("/api/meal-plans/{planId}/meals/type/{type}", ctx -> {
            Long userId = extractUserId(ctx.header("Authorization"), jwtUtil);
            int    planId = Integer.parseInt(ctx.pathParam("planId"));
            String type   = ctx.pathParam("type");
            ctx.json(mealPlanController.getMealsByType(userId, planId, type));
        });

        // ── Social routes ─────────────────────────────────────────
        app.post("/api/social/posts", ctx -> {
            Long userId = extractUserId(ctx.header("Authorization"), jwtUtil);
            ctx.status(201).json(socialController.createPost(userId, ctx.body()));
        });

        app.get("/api/social/posts/{id}", ctx -> {
            long postId = Long.parseLong(ctx.pathParam("id"));
            ctx.json(socialController.getPost(postId));
        });

        app.put("/api/social/posts/{id}", ctx -> {
            Long userId = extractUserId(ctx.header("Authorization"), jwtUtil);
            long postId = Long.parseLong(ctx.pathParam("id"));
            ctx.json(socialController.updatePost(postId, userId, ctx.body()));
        });

        app.delete("/api/social/posts/{id}", ctx -> {
            Long userId = extractUserId(ctx.header("Authorization"), jwtUtil);
            long postId = Long.parseLong(ctx.pathParam("id"));
            socialController.deletePost(postId, userId);
            ctx.status(204);
        });

        app.get("/api/social/users/{userId}/posts", ctx -> {
            long userId = Long.parseLong(ctx.pathParam("userId"));
            ctx.json(socialController.getPostsByUser(userId));
        });

        app.get("/api/social/recipes/{recipeId}/posts", ctx -> {
            int recipeId = Integer.parseInt(ctx.pathParam("recipeId"));
            ctx.json(socialController.getPostsByRecipe(recipeId));
        });

        app.get("/api/social/feed", ctx -> {
            Long userId = extractUserId(ctx.header("Authorization"), jwtUtil);
            ctx.json(socialController.getFeed(userId));
        });

        app.post("/api/social/recipes/{recipeId}/rate", ctx -> {
            Long userId  = extractUserId(ctx.header("Authorization"), jwtUtil);
            int recipeId = Integer.parseInt(ctx.pathParam("recipeId"));
            ctx.status(201).json(socialController.rateRecipe(userId, recipeId, ctx.body()));
        });

        app.get("/api/social/recipes/{recipeId}/rating", ctx -> {
            Long userId  = extractUserId(ctx.header("Authorization"), jwtUtil);
            int recipeId = Integer.parseInt(ctx.pathParam("recipeId"));
            ctx.json(socialController.getRecipeRating(userId, recipeId));
        });

        app.get("/api/social/recipes/{recipeId}/rating/friends", ctx -> {
            Long userId  = extractUserId(ctx.header("Authorization"), jwtUtil);
            int recipeId = Integer.parseInt(ctx.pathParam("recipeId"));
            ctx.json(socialController.getFriendRatings(userId, recipeId));
        });

        app.get("/api/social/recipes/top-by-friends", ctx -> {
            Long userId = extractUserId(ctx.header("Authorization"), jwtUtil);
            int limit   = intParam(ctx.queryParam("limit"), 10);
            ctx.json(socialController.getTopRatedByFriends(userId, limit));
        });

        app.post("/api/social/friends/request", ctx -> {
            Long userId = extractUserId(ctx.header("Authorization"), jwtUtil);
            ctx.status(201).json(socialController.sendFriendRequest(userId, ctx.body()));
        });

        app.post("/api/social/friends/{friendshipId}/accept", ctx -> {
            Long userId       = extractUserId(ctx.header("Authorization"), jwtUtil);
            long friendshipId = Long.parseLong(ctx.pathParam("friendshipId"));
            socialController.acceptFriendRequest(friendshipId, userId);
            ctx.status(204);
        });

        app.post("/api/social/friends/{friendshipId}/decline", ctx -> {
            Long userId       = extractUserId(ctx.header("Authorization"), jwtUtil);
            long friendshipId = Long.parseLong(ctx.pathParam("friendshipId"));
            socialController.declineFriendRequest(friendshipId, userId);
            ctx.status(204);
        });

        app.delete("/api/social/friends/{friendshipId}", ctx -> {
            Long userId       = extractUserId(ctx.header("Authorization"), jwtUtil);
            long friendshipId = Long.parseLong(ctx.pathParam("friendshipId"));
            socialController.removeFriend(friendshipId, userId);
            ctx.status(204);
        });

        app.get("/api/social/friends", ctx -> {
            Long userId = extractUserId(ctx.header("Authorization"), jwtUtil);
            ctx.json(socialController.getFriends(userId));
        });

        app.get("/api/social/friends/requests/received", ctx -> {
            Long userId = extractUserId(ctx.header("Authorization"), jwtUtil);
            ctx.json(socialController.getPendingReceivedRequests(userId));
        });

        app.get("/api/social/friends/requests/sent", ctx -> {
            Long userId = extractUserId(ctx.header("Authorization"), jwtUtil);
            ctx.json(socialController.getPendingSentRequests(userId));
        });

        // ── Start ─────────────────────────────────────────────────
        app.start(port);
        System.out.println("Server running on http://localhost:" + port);
    }

    // ── Helpers ───────────────────────────────────────────────────

    private static Long extractUserId(String authorizationHeader, JWTUtil jwtUtil) {
        if (authorizationHeader == null || !authorizationHeader.startsWith("Bearer ")) {
            throw new IllegalArgumentException("Header Authorization inválido");
        }
        String token = authorizationHeader.substring("Bearer ".length()).trim();
        return jwtUtil.parseUserId(token);
    }

    private static int intParam(String raw, int defaultValue) {
        if (raw == null || raw.isBlank()) return defaultValue;
        try { return Integer.parseInt(raw.trim()); }
        catch (NumberFormatException e) {
            throw new IllegalArgumentException("Parâmetro numérico inválido: " + raw);
        }
    }

    private static int resolvePort() {
        String raw = System.getenv("PORT");
        if (raw == null || raw.isBlank()) raw = System.getenv("APP_PORT");
        if (raw == null || raw.isBlank()) return 7071;
        try {
            int parsed = Integer.parseInt(raw.trim());
            if (parsed < 1 || parsed > 65535)
                throw new IllegalArgumentException("PORT fora do intervalo válido: " + raw);
            return parsed;
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("PORT inválida: " + raw, e);
        }
    }
}