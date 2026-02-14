package alnak.controllers;

import alnak.business_logic.entities.IngredientMarketPrice;
import alnak.dto.PriceImportResponse;
import alnak.services.PriceImportService;

import java.util.List;

public class PriceController {

    private final PriceImportService priceImportService;

    public PriceController(PriceImportService priceImportService) {
        this.priceImportService = priceImportService;
    }

    public PriceImportResponse importReport(String rawPayload) {
        return priceImportService.importScraperReport(rawPayload);
    }

    public List<IngredientMarketPrice> listPrices() {
        return priceImportService.listLatestPrices();
    }

    public List<IngredientMarketPrice> listIngredientPrices(String ingredientRaw) {
        return priceImportService.listIngredientPrices(ingredientRaw);
    }

    public IngredientMarketPrice cheapestIngredientPrice(String ingredientRaw) {
        return priceImportService.cheapestIngredientPrice(ingredientRaw);
    }
}
