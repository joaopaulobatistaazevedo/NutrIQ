package alnak;

import alnak.controllers.AuthController;
import alnak.controllers.PriceController;
import alnak.controllers.RecipeController;
import alnak.controllers.UserController;
import alnak.data.global.GlobalRecipeDAO;
import alnak.data.local.IngredientMarketPriceDAO;
import alnak.data.global.UserDAO;
import alnak.dto.LoginRequest;
import alnak.dto.RegisterRequest;
import alnak.dto.UpdateProfileRequest;
import alnak.services.AuthService;
import alnak.services.PriceImportService;
import alnak.services.RecipeService;
import alnak.services.UserService;
import alnak.utils.JWTUtil;
import io.javalin.Javalin;

import java.util.Map;

public class Main {
    public static void main(String[] args) {
        int port = resolvePort();

        UserDAO userDAO = new UserDAO();
        JWTUtil jwtUtil = new JWTUtil();
        AuthService authService = new AuthService(userDAO, jwtUtil);
        UserService userService = new UserService(userDAO);
        IngredientMarketPriceDAO ingredientMarketPriceDAO = new IngredientMarketPriceDAO();
        PriceImportService priceImportService = new PriceImportService(ingredientMarketPriceDAO);
        GlobalRecipeDAO globalRecipeDAO = new GlobalRecipeDAO();
        RecipeService recipeService = new RecipeService(globalRecipeDAO);
        AuthController authController = new AuthController(authService);
        UserController userController = new UserController(userService);
        PriceController priceController = new PriceController(priceImportService);
        RecipeController recipeController = new RecipeController(recipeService);

        Javalin app = Javalin.create(config -> config.plugins.enableCors(cors -> cors.add(it -> it.anyHost())));

        app.exception(IllegalArgumentException.class,
                (e, ctx) -> ctx.status(400).json(Map.of("error", e.getMessage())));

        app.post("/api/auth/register", ctx -> {
            RegisterRequest request = ctx.bodyAsClass(RegisterRequest.class);
            var response = authController.register(request);
            ctx.status(201).json(response);
        });

        app.post("/api/auth/login", ctx -> {
            LoginRequest request = ctx.bodyAsClass(LoginRequest.class);
            var response = authController.login(request);
            ctx.json(response);
        });

        app.get("/api/users/me", ctx -> {
            Long userId = extractUserId(ctx.header("Authorization"), jwtUtil);
            ctx.json(userController.me(userId));
        });

        app.put("/api/users/me/profile", ctx -> {
            Long userId = extractUserId(ctx.header("Authorization"), jwtUtil);
            UpdateProfileRequest request = ctx.bodyAsClass(UpdateProfileRequest.class);
            ctx.json(userController.updateMyProfile(userId, request));
        });

        app.get("/api/debug/users", ctx -> ctx.json(userController.listUsers()));

        app.get("/api/debug/users/{id}", ctx -> {
            Long userId = Long.parseLong(ctx.pathParam("id"));
            ctx.json(userController.getById(userId));
        });

        app.post("/api/prices/import", ctx -> {
            var response = priceController.importReport(ctx.body());
            ctx.status(201).json(response);
        });

        app.get("/api/prices", ctx -> ctx.json(priceController.listPrices()));

        app.get("/api/prices/{ingredient}/cheapest", ctx -> {
            String ingredient = ctx.pathParam("ingredient");
            ctx.json(priceController.cheapestIngredientPrice(ingredient));
        });

        app.get("/api/prices/{ingredient}", ctx -> {
            String ingredient = ctx.pathParam("ingredient");
            ctx.json(priceController.listIngredientPrices(ingredient));
        });

        app.get("/api/recipes", ctx -> {
            String mealType = ctx.queryParam("mealType");
            Integer limit = parseOptionalPositiveInt(ctx.queryParam("limit"));
            ctx.json(recipeController.listRecipes(limit, mealType));
        });

        app.start(port);
        System.out.println("Server running on http://localhost:" + port);
    }

    private static Long extractUserId(String authorizationHeader, JWTUtil jwtUtil) {
        if (authorizationHeader == null || !authorizationHeader.startsWith("Bearer ")) {
            throw new IllegalArgumentException("Header Authorization inválido");
        }

        String token = authorizationHeader.substring("Bearer ".length()).trim();
        return jwtUtil.parseUserId(token);
    }

    private static Integer parseOptionalPositiveInt(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            int parsed = Integer.parseInt(raw.trim());
            if (parsed <= 0) {
                throw new IllegalArgumentException("limit deve ser > 0");
            }
            return parsed;
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("limit invalido: " + raw);
        }
    }

    private static int resolvePort() {
        String raw = System.getenv("PORT");
        if (raw == null || raw.isBlank()) {
            raw = System.getenv("APP_PORT");
        }
        if (raw == null || raw.isBlank()) {
            return 7070;
        }
        try {
            int parsed = Integer.parseInt(raw.trim());
            if (parsed < 1 || parsed > 65535) {
                throw new IllegalArgumentException("PORT fora do intervalo válido: " + raw);
            }
            return parsed;
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("PORT inválida: " + raw, e);
        }
    }
}
