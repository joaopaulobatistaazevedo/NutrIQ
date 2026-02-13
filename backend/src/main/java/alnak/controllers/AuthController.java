package alnak.controllers;

import alnak.dto.AuthResponse;
import alnak.dto.LoginRequest;
import alnak.dto.RegisterRequest;
import alnak.services.AuthService;

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
}
