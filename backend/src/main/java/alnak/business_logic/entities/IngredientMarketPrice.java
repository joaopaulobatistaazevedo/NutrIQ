package alnak.business_logic.entities;

public class IngredientMarketPrice {
    private String ingredientName;
    private String ingredientNormalized;
    private String supermarket;
    private String productName;
    private String productUrl;
    private String imageUrl;
    private double price;
    private String currency = "EUR";
    private Double calories;
    private String source;
    private String note;
    private String scrapedAt;

    public String getIngredientName() {
        return ingredientName;
    }

    public void setIngredientName(String ingredientName) {
        this.ingredientName = ingredientName;
    }

    public String getIngredientNormalized() {
        return ingredientNormalized;
    }

    public void setIngredientNormalized(String ingredientNormalized) {
        this.ingredientNormalized = ingredientNormalized;
    }

    public String getSupermarket() {
        return supermarket;
    }

    public void setSupermarket(String supermarket) {
        this.supermarket = supermarket;
    }

    public String getProductName() {
        return productName;
    }

    public void setProductName(String productName) {
        this.productName = productName;
    }

    public String getProductUrl() {
        return productUrl;
    }

    public void setProductUrl(String productUrl) {
        this.productUrl = productUrl;
    }

    public String getImageUrl() {
        return imageUrl;
    }

    public void setImageUrl(String imageUrl) {
        this.imageUrl = imageUrl;
    }

    public double getPrice() {
        return price;
    }

    public void setPrice(double price) {
        this.price = price;
    }

    public String getCurrency() {
        return currency;
    }

    public void setCurrency(String currency) {
        this.currency = currency;
    }

    public Double getCalories() {
        return calories;
    }

    public void setCalories(Double calories) {
        this.calories = calories;
    }

    public String getSource() {
        return source;
    }

    public void setSource(String source) {
        this.source = source;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }

    public String getScrapedAt() {
        return scrapedAt;
    }

    public void setScrapedAt(String scrapedAt) {
        this.scrapedAt = scrapedAt;
    }
}
