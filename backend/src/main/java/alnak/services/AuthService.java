package alnak.services;

import alnak.business_logic.entities.User;
import alnak.data.global.UserDAO;
import alnak.dto.AuthResponse;
import alnak.dto.LoginRequest;
import alnak.dto.RegisterRequest;
import alnak.utils.JWTUtil;
import io.github.cdimascio.dotenv.Dotenv;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.Optional;

public class AuthService {

    private static final Dotenv DOTENV = Dotenv.configure()
            .ignoreIfMissing()
            .load();

    private final UserDAO userDAO;
    private final JWTUtil jwtUtil;
    private final PasswordResetEmailService passwordResetEmailService;
    private final SecureRandom secureRandom;
    private final String passwordResetBaseUrl;
    private final int resetTokenTtlMinutes;

    public AuthService() {
        this(new UserDAO(), new JWTUtil(), new PasswordResetEmailService());
    }

    public AuthService(UserDAO userDAO, JWTUtil jwtUtil) {
        this(userDAO, jwtUtil, new PasswordResetEmailService());
    }

    public AuthService(UserDAO userDAO, JWTUtil jwtUtil, PasswordResetEmailService passwordResetEmailService) {
        this.userDAO = userDAO;
        this.jwtUtil = jwtUtil;
        this.passwordResetEmailService = passwordResetEmailService;
        this.secureRandom = new SecureRandom();
        this.passwordResetBaseUrl = readConfig("PASSWORD_RESET_URL_BASE", "http://localhost:5173/reset-password");
        this.resetTokenTtlMinutes = parsePositiveInt(readConfig("PASSWORD_RESET_TOKEN_TTL_MINUTES", "30"), 30);
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

    public void requestPasswordReset(String email) {
        String normalizedEmail = normalizeEmail(email);
        Optional<User> maybeUser = userDAO.findByEmail(normalizedEmail);
        if (maybeUser.isEmpty()) {
            return;
        }

        User user = maybeUser.get();
        String token = generateResetToken();
        String tokenHash = sha256Hex(token);
        LocalDateTime expiresAt = LocalDateTime.now().plusMinutes(resetTokenTtlMinutes);

        userDAO.createPasswordResetToken(user.getId(), tokenHash, expiresAt);

        String resetUrl = buildResetUrl(token);
        boolean sent = passwordResetEmailService.sendPasswordResetEmail(normalizedEmail, resetUrl);
        if (!sent) {
            System.out.printf("[PasswordReset] Link gerado para %s: %s%n", normalizedEmail, resetUrl);
        }
    }

    public void resetPassword(String token, String newPassword) {
        String cleanToken = requireResetToken(token);
        String cleanPassword = requireResetPassword(newPassword);

        String tokenHash = sha256Hex(cleanToken);
        Long userId = userDAO.consumePasswordResetToken(tokenHash)
                .orElseThrow(() -> new IllegalArgumentException("Token de recuperação inválido ou expirado."));

        userDAO.updatePasswordHash(userId, cleanPassword);
        userDAO.invalidateUnusedPasswordResetTokens(userId);
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

    private String requireResetPassword(String password) {
        String clean = requirePassword(password);
        if (clean.length() < 6) {
            throw new IllegalArgumentException("A nova password deve ter pelo menos 6 caracteres.");
        }
        return clean;
    }

    private String requireResetToken(String token) {
        if (token == null || token.isBlank()) {
            throw new IllegalArgumentException("Token de recuperação é obrigatório.");
        }
        return token.trim();
    }

    private String sanitizeName(String name) {
        if (name == null) return null;
        String trimmed = name.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String generateResetToken() {
        byte[] bytes = new byte[32];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String buildResetUrl(String token) {
        String separator = passwordResetBaseUrl.contains("?") ? "&" : "?";
        return passwordResetBaseUrl + separator + "token=" + URLEncoder.encode(token, StandardCharsets.UTF_8);
    }

    private String sha256Hex(String raw) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(raw.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 não disponível.", e);
        }
    }

    private static int parsePositiveInt(String value, int fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        try {
            int parsed = Integer.parseInt(value.trim());
            return parsed > 0 ? parsed : fallback;
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    private static String readConfig(String key, String fallback) {
        String env = System.getenv(key);
        if (env != null && !env.isBlank()) {
            return env.trim();
        }
        String dot = DOTENV.get(key);
        if (dot != null && !dot.isBlank()) {
            return dot.trim();
        }
        return fallback;
    }
}
