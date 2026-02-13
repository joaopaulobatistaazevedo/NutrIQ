package alnak;

import alnak.controllers.AuthController;
import alnak.controllers.UserController;
import alnak.dto.LoginRequest;
import alnak.dto.RegisterRequest;
import alnak.dto.UpdateProfileRequest;
import alnak.models.User;
import alnak.services.AuthService;
import alnak.services.UserService;
import alnak.utils.JWTUtil;
import io.javalin.Javalin;

import java.util.Map;

public class Main {
    public static void main(String[] args) {
        AuthService authService = new AuthService();
        UserService userService = new UserService();
        AuthController authController = new AuthController(authService);
        UserController userController = new UserController(userService);
        JWTUtil jwtUtil = new JWTUtil();

        Javalin app = Javalin.create(config -> config.plugins.enableCors(cors -> cors.add(it -> it.anyHost())));

        app.exception(IllegalArgumentException.class,
                (e, ctx) -> ctx.status(400).json(Map.of("error", e.getMessage())));

        app.post("/api/auth/register", ctx -> {
            RegisterRequest request = ctx.bodyAsClass(RegisterRequest.class);
            var response = authController.register(request);
            User createdUser = authService.getUserByEmail(request.getEmail());
            userService.putUser(createdUser);
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

        app.start(7070);
        System.out.println("Server running on http://localhost:7070");
    }

    private static Long extractUserId(String authorizationHeader, JWTUtil jwtUtil) {
        if (authorizationHeader == null || !authorizationHeader.startsWith("Bearer ")) {
            throw new IllegalArgumentException("Header Authorization inválido");
        }

        String token = authorizationHeader.substring("Bearer ".length()).trim();
        return jwtUtil.parseUserId(token);
    }
}
