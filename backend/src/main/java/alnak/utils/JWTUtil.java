package alnak.utils;

public class JWTUtil {
    public String generateToken(Long userId) {
        return "stub-token-" + userId;
    }

    public Long parseUserId(String token) {
        if (token == null || !token.startsWith("stub-token-")) {
            throw new IllegalArgumentException("Token inválido");
        }
        String value = token.replace("stub-token-", "");
        return Long.parseLong(value);
    }
}
