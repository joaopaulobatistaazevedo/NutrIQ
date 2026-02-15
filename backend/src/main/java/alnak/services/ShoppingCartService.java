package alnak.services;

import alnak.data.local.ShoppingCartSnapshotDAO;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.Map;

public class ShoppingCartService {

    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};

    private final ShoppingCartSnapshotDAO shoppingCartSnapshotDAO;
    private final ObjectMapper mapper;

    public ShoppingCartService(ShoppingCartSnapshotDAO shoppingCartSnapshotDAO) {
        this.shoppingCartSnapshotDAO = shoppingCartSnapshotDAO;
        this.mapper = new ObjectMapper();
    }

    public Map<String, Object> getByUserId(long userId) {
        return shoppingCartSnapshotDAO.findByUserId(userId)
                .map(this::parseJson)
                .orElse(null);
    }

    public Map<String, Object> saveForUser(long userId, Map<String, Object> payload) {
        if (payload == null || payload.isEmpty()) {
            throw new IllegalArgumentException("Payload do carrinho é obrigatório.");
        }

        String json = toJson(payload);
        shoppingCartSnapshotDAO.save(userId, json);
        return payload;
    }

    private String toJson(Map<String, Object> payload) {
        try {
            return mapper.writeValueAsString(payload);
        } catch (Exception e) {
            throw new IllegalArgumentException("Payload de carrinho inválido.");
        }
    }

    private Map<String, Object> parseJson(String raw) {
        try {
            return mapper.readValue(raw, MAP_TYPE);
        } catch (Exception e) {
            throw new IllegalStateException("Carrinho persistido inválido na base de dados.");
        }
    }
}
