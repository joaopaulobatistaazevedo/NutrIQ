package alnak.controllers;

import alnak.dto.AuthResponse;
import alnak.dto.LoginRequest;
import alnak.dto.RegisterRequest;
import alnak.services.AuthService;

import java.util.Map;

public class AuthController {
    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    public AuthResponse register(RegisterRequest request) {
        return authService.register(request);
    }

    public AuthResponse login(LoginRequest request) {
        return authService.login(request);
    }

    public Map<String, String> forgotPassword(String email) {
        authService.requestPasswordReset(email);
        return Map.of("message", "Se o email existir, enviámos instruções para recuperar a password.");
    }

    public Map<String, String> resetPassword(String token, String newPassword) {
        authService.resetPassword(token, newPassword);
        return Map.of("message", "Password atualizada com sucesso.");
    }
}
