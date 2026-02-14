package alnak.services;

import alnak.business_logic.entities.IngredientMarketPrice;
import alnak.data.IngredientMarketPriceDAO;
import alnak.dto.PriceImportResponse;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class PriceImportService {

    private final IngredientMarketPriceDAO priceDAO;
    private final ObjectMapper mapper;

    public PriceImportService(IngredientMarketPriceDAO priceDAO) {
        this.priceDAO = priceDAO;
        this.mapper = new ObjectMapper();
    }

    public PriceImportResponse importScraperReport(String rawPayload) {
        JsonNode root = parsePayload(rawPayload);
        JsonNode grouped = root.path("results_by_market");
        if (!grouped.isObject()) {
            throw new IllegalArgumentException(
                    "Payload inválido: campo 'results_by_market' ausente ou inválido."
            );
        }

        int marketsProcessed = 0;
        int totalEntries = 0;
        int skippedEntries = 0;
        int invalidEntries = 0;
        Map<String, IngredientMarketPrice> deduped = new LinkedHashMap<>();

        Iterator<Map.Entry<String, JsonNode>> marketFields = grouped.fields();
        while (marketFields.hasNext()) {
            Map.Entry<String, JsonNode> marketField = marketFields.next();
            String marketName = normalizeBlankToNull(marketField.getKey());
            JsonNode marketItems = marketField.getValue();

            if (!marketItems.isArray()) {
                invalidEntries++;
                continue;
            }

            marketsProcessed++;
            for (JsonNode item : marketItems) {
                totalEntries++;

                boolean found = item.path("found").asBoolean(false);
                Double price = asNullableDouble(item.get("price"));
                if (!found || price == null) {
                    skippedEntries++;
                    continue;
                }

                JsonNode ingredientNode = item.path("ingredient");
                String ingredientName = normalizeBlankToNull(ingredientNode.path("name").asText(null));
                String normalizedIngredient = normalizeBlankToNull(
                        ingredientNode.path("normalized_name").asText(null)
                );

                if (normalizedIngredient == null && ingredientName != null) {
                    normalizedIngredient = normalizeIngredient(ingredientName);
                }

                String supermarket = normalizeBlankToNull(item.path("supermarket").asText(null));
                if (supermarket == null) {
                    supermarket = marketName;
                }

                if (normalizedIngredient == null || supermarket == null) {
                    invalidEntries++;
                    continue;
                }

                IngredientMarketPrice entry = new IngredientMarketPrice();
                entry.setIngredientNormalized(normalizedIngredient);
                entry.setIngredientName(ingredientName != null ? ingredientName : normalizedIngredient);
                entry.setSupermarket(supermarket);
                entry.setProductName(normalizeBlankToNull(item.path("product_name").asText(null)));
                entry.setProductUrl(normalizeBlankToNull(item.path("product_url").asText(null)));
                entry.setPrice(price);
                entry.setCurrency(resolveCurrency(item));
                entry.setCalories(asNullableDouble(item.get("calories")));
                entry.setSource(normalizeBlankToNull(item.path("source").asText(null)));
                entry.setNote(normalizeBlankToNull(item.path("note").asText(null)));

                String dedupeKey = normalizedIngredient + "||" + supermarket.toLowerCase();
                deduped.put(dedupeKey, entry);
            }
        }

        List<IngredientMarketPrice> toPersist = new ArrayList<>(deduped.values());
        int importedEntries = priceDAO.upsertBatch(toPersist);

        return new PriceImportResponse(
                marketsProcessed,
                totalEntries,
                deduped.size(),
                importedEntries,
                skippedEntries,
                invalidEntries
        );
    }

    public List<IngredientMarketPrice> listLatestPrices() {
        return priceDAO.listAll();
    }

    public List<IngredientMarketPrice> listIngredientPrices(String ingredientRaw) {
        String normalized = normalizeIngredient(ingredientRaw);
        if (normalized == null) {
            throw new IllegalArgumentException("Ingrediente inválido");
        }
        return priceDAO.findByIngredientNormalized(normalized);
    }

    public IngredientMarketPrice cheapestIngredientPrice(String ingredientRaw) {
        String normalized = normalizeIngredient(ingredientRaw);
        if (normalized == null) {
            throw new IllegalArgumentException("Ingrediente inválido");
        }
        return priceDAO.findCheapestByIngredientNormalized(normalized)
                .orElseThrow(() -> new IllegalArgumentException(
                        "Sem preços importados para o ingrediente: " + ingredientRaw
                ));
    }

    private JsonNode parsePayload(String rawPayload) {
        if (rawPayload == null || rawPayload.isBlank()) {
            throw new IllegalArgumentException("Payload JSON é obrigatório.");
        }
        try {
            return mapper.readTree(rawPayload);
        } catch (IOException e) {
            throw new IllegalArgumentException("Payload JSON inválido: " + e.getMessage(), e);
        }
    }

    private String resolveCurrency(JsonNode item) {
        String value = normalizeBlankToNull(item.path("currency").asText(null));
        return value != null ? value : "EUR";
    }

    private Double asNullableDouble(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        if (node.isNumber()) {
            return node.doubleValue();
        }
        if (node.isTextual()) {
            String value = normalizeBlankToNull(node.asText());
            if (value == null) {
                return null;
            }
            try {
                return Double.parseDouble(value.replace(",", "."));
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }

    private String normalizeBlankToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String normalizeIngredient(String value) {
        String candidate = normalizeBlankToNull(value);
        if (candidate == null) {
            return null;
        }

        String decomposed = Normalizer.normalize(candidate, Normalizer.Form.NFKD);
        String withoutMarks = decomposed.replaceAll("\\p{M}+", "");
        String compact = withoutMarks
                .toLowerCase()
                .replaceAll("[^a-z0-9\\s]", " ")
                .replaceAll("\\s+", " ")
                .trim();

        return compact.isEmpty() ? null : compact;
    }
}
