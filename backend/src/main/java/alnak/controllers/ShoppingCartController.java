package alnak.controllers;

import alnak.services.ShoppingCartService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.Map;

public class ShoppingCartController {

    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};

    private final ShoppingCartService shoppingCartService;
    private final ObjectMapper mapper;

    public ShoppingCartController(ShoppingCartService shoppingCartService) {
        this.shoppingCartService = shoppingCartService;
        this.mapper = new ObjectMapper();
    }

    public Map<String, Object> getMyCart(Long userId) {
        requireUserId(userId);
        return shoppingCartService.getByUserId(userId);
    }

    public Map<String, Object> saveMyCart(Long userId, String body) throws Exception {
        requireUserId(userId);
        Map<String, Object> payload = mapper.readValue(body, MAP_TYPE);
        return shoppingCartService.saveForUser(userId, payload);
    }

    private void requireUserId(Long userId) {
        if (userId == null || userId <= 0) {
            throw new SecurityException("Autenticação necessária para carrinho.");
        }
    }
}
