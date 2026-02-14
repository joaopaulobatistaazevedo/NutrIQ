package alnak.services;

import alnak.business_logic.entities.User;
import alnak.data.UserDAO;
import alnak.dto.AuthResponse;
import alnak.dto.LoginRequest;
import alnak.dto.RegisterRequest;
import alnak.utils.JWTUtil;

import java.util.Optional;

public class AuthService {

    private final UserDAO userDAO;
    private final JWTUtil jwtUtil;

    public AuthService() {
        this(new UserDAO(), new JWTUtil());
    }

    public AuthService(UserDAO userDAO, JWTUtil jwtUtil) {
        this.userDAO = userDAO;
        this.jwtUtil = jwtUtil;
    }

    public AuthResponse register(RegisterRequest request) {
        String email = normalizeEmail(request.getEmail());
        String password = requirePassword(request.getPassword());

        if (userDAO.findByEmail(email).isPresent()) {
            throw new IllegalArgumentException("Email já registado");
        }

        User user = userDAO.createUser(sanitizeName(request.getName()), email, password);
        return new AuthResponse(user.getId(), jwtUtil.generateToken(user.getId()));
    }

    public AuthResponse login(LoginRequest request) {
        String email = normalizeEmail(request.getEmail());
        String password = requirePassword(request.getPassword());

        Optional<User> maybeUser = userDAO.findByEmail(email);
        if (maybeUser.isEmpty()) {
            throw new IllegalArgumentException("Credenciais inválidas");
        }

        User user = maybeUser.get();
        if (!user.getPasswordHash().equals(password)) {
            throw new IllegalArgumentException("Credenciais inválidas");
        }

        return new AuthResponse(user.getId(), jwtUtil.generateToken(user.getId()));
    }

    public User getUserByEmail(String email) {
        return userDAO.findByEmail(normalizeEmail(email)).orElse(null);
    }

    private String normalizeEmail(String email) {
        if (email == null || email.isBlank()) {
            throw new IllegalArgumentException("Email é obrigatório");
        }
        return email.trim().toLowerCase();
    }

    private String requirePassword(String password) {
        if (password == null || password.isBlank()) {
            throw new IllegalArgumentException("Password é obrigatória");
        }
        return password;
    }

    private String sanitizeName(String name) {
        if (name == null) return null;
        String trimmed = name.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
