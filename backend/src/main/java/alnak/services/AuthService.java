package alnak.services;

import alnak.dto.AuthResponse;
import alnak.dto.LoginRequest;
import alnak.dto.RegisterRequest;
import alnak.models.User;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

public class AuthService {
    private final AtomicLong idSequence = new AtomicLong(1);
    private final Map<String, User> usersByEmail = new HashMap<>();

    public AuthResponse register(RegisterRequest request) {
        if (request.getEmail() == null || request.getPassword() == null) {
            throw new IllegalArgumentException("Email e password são obrigatórios");
        }
        if (usersByEmail.containsKey(request.getEmail())) {
            throw new IllegalArgumentException("Email já registado");
        }

        User user = new User();
        user.setId(idSequence.getAndIncrement());
        user.setName(request.getName());
        user.setEmail(request.getEmail());
        user.setPasswordHash(request.getPassword());
        usersByEmail.put(user.getEmail(), user);

        return new AuthResponse(user.getId(), "stub-token-" + user.getId());
    }

    public AuthResponse login(LoginRequest request) {
        User user = usersByEmail.get(request.getEmail());
        if (user == null) {
            throw new IllegalArgumentException("Credenciais inválidas");
        }
        if (!user.getPasswordHash().equals(request.getPassword())) {
            throw new IllegalArgumentException("Credenciais inválidas");
        }

        return new AuthResponse(user.getId(), "stub-token-" + user.getId());
    }

    public User getUserByEmail(String email) {
        return usersByEmail.get(email);
    }
}
