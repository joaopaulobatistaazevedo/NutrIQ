package alnak.services;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.cdimascio.dotenv.Dotenv;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Map;

public class PasswordResetEmailService {

    private static final Dotenv DOTENV = Dotenv.configure()
            .ignoreIfMissing()
            .load();

    private final HttpClient httpClient = HttpClient.newHttpClient();
    private final ObjectMapper objectMapper = new ObjectMapper();

    private final String brevoApiKey = readConfig("BREVO_API_KEY", null);
    private final String senderEmail = readConfig("BREVO_SENDER_EMAIL", null);
    private final String senderName = readConfig("BREVO_SENDER_NAME", "NutrIQ");
    private final String brevoEndpoint = readConfig("BREVO_SMTP_ENDPOINT", "https://api.brevo.com/v3/smtp/email");

    public boolean isConfigured() {
        return !isBlank(brevoApiKey) && !isBlank(senderEmail);
    }

    public boolean sendPasswordResetEmail(String recipientEmail, String resetUrl) {
        if (isBlank(recipientEmail) || isBlank(resetUrl)) {
            return false;
        }

        if (!isConfigured()) {
            System.out.printf("[PasswordReset] Brevo não configurado. Link para %s: %s%n", recipientEmail, resetUrl);
            return false;
        }

        Map<String, Object> payload = Map.of(
                "sender", Map.of(
                        "name", senderName,
                        "email", senderEmail
                ),
                "to", new Object[]{
                        Map.of("email", recipientEmail)
                },
                "subject", "NutrIQ - Recuperação de password",
                "htmlContent", buildHtml(resetUrl)
        );

        try {
            String body = objectMapper.writeValueAsString(payload);
            HttpRequest request = HttpRequest.newBuilder(URI.create(brevoEndpoint))
                    .header("accept", "application/json")
                    .header("content-type", "application/json")
                    .header("api-key", brevoApiKey)
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            int status = response.statusCode();
            if (status >= 200 && status < 300) {
                return true;
            }

            System.err.printf("[PasswordReset] Falha Brevo (%d): %s%n", status, response.body());
            return false;
        } catch (IOException | InterruptedException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            System.err.printf("[PasswordReset] Erro ao enviar email: %s%n", e.getMessage());
            return false;
        }
    }

    private String buildHtml(String resetUrl) {
        return """
                <div style="font-family:Arial,sans-serif;line-height:1.5">
                  <h2>Recuperação de password</h2>
                  <p>Recebemos um pedido para redefinir a tua password no NutrIQ.</p>
                  <p>
                    <a href="%s"
                       style="display:inline-block;padding:10px 16px;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:6px">
                      Redefinir password
                    </a>
                  </p>
                  <p>Se não foste tu, ignora este email.</p>
                </div>
                """.formatted(resetUrl);
    }

    private static String readConfig(String key, String fallback) {
        String envValue = System.getenv(key);
        if (!isBlank(envValue)) {
            return envValue.trim();
        }
        String dotenvValue = DOTENV.get(key);
        if (!isBlank(dotenvValue)) {
            return dotenvValue.trim();
        }
        return fallback;
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}

