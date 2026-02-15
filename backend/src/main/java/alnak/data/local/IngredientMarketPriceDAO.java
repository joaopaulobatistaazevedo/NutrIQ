package alnak.data.local;

import alnak.business_logic.entities.IngredientMarketPrice;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

public class IngredientMarketPriceDAO {

    private final Connection conn;

    public IngredientMarketPriceDAO() {
        this.conn = LocalDatabase.getInstance().getConnection();
    }

    public synchronized int upsertBatch(List<IngredientMarketPrice> items) {
        if (items == null || items.isEmpty()) {
            return 0;
        }

        final String sql = """
            INSERT INTO ingredient_market_prices (
                ingredient_normalized, supermarket, ingredient_name, product_name, product_url,
                image_url, price, currency, calories, source, note
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(ingredient_normalized, supermarket) DO UPDATE SET
                ingredient_name = excluded.ingredient_name,
                product_name = excluded.product_name,
                product_url = excluded.product_url,
                image_url = excluded.image_url,
                price = excluded.price,
                currency = excluded.currency,
                calories = excluded.calories,
                source = excluded.source,
                note = excluded.note,
                scraped_at = CURRENT_TIMESTAMP
        """;

        try {
            conn.setAutoCommit(false);
            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                for (IngredientMarketPrice item : items) {
                    ps.setString(1, item.getIngredientNormalized());
                    ps.setString(2, item.getSupermarket());
                    setNullableString(ps, 3, item.getIngredientName());
                    setNullableString(ps, 4, item.getProductName());
                    setNullableString(ps, 5, item.getProductUrl());
                    setNullableString(ps, 6, item.getImageUrl());
                    ps.setDouble(7, item.getPrice());
                    setNullableString(ps, 8, item.getCurrency());
                    setNullableDouble(ps, 9, item.getCalories());
                    setNullableString(ps, 10, item.getSource());
                    setNullableString(ps, 11, item.getNote());
                    ps.addBatch();
                }
                int[] result = ps.executeBatch();
                conn.commit();
                return result.length;
            } catch (SQLException e) {
                conn.rollback();
                throw e;
            } finally {
                conn.setAutoCommit(true);
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    public List<IngredientMarketPrice> listAll() {
        final String sql = """
            SELECT ingredient_name, ingredient_normalized, supermarket, product_name, product_url,
                   image_url, price, currency, calories, source, note, scraped_at
            FROM ingredient_market_prices
            ORDER BY ingredient_normalized, supermarket
        """;

        try (PreparedStatement ps = conn.prepareStatement(sql);
             ResultSet rs = ps.executeQuery()) {
            List<IngredientMarketPrice> items = new ArrayList<>();
            while (rs.next()) {
                items.add(mapRow(rs));
            }
            return items;
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    public List<IngredientMarketPrice> findByIngredientNormalized(String ingredientNormalized) {
        final String sql = """
            SELECT ingredient_name, ingredient_normalized, supermarket, product_name, product_url,
                   image_url, price, currency, calories, source, note, scraped_at
            FROM ingredient_market_prices
            WHERE ingredient_normalized = ?
            ORDER BY price ASC, supermarket ASC
        """;

        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, ingredientNormalized);
            try (ResultSet rs = ps.executeQuery()) {
                List<IngredientMarketPrice> items = new ArrayList<>();
                while (rs.next()) {
                    items.add(mapRow(rs));
                }
                return items;
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    public Optional<IngredientMarketPrice> findCheapestByIngredientNormalized(String ingredientNormalized) {
        final String sql = """
            SELECT ingredient_name, ingredient_normalized, supermarket, product_name, product_url,
                   image_url, price, currency, calories, source, note, scraped_at
            FROM ingredient_market_prices
            WHERE ingredient_normalized = ?
            ORDER BY price ASC, supermarket ASC
            LIMIT 1
        """;

        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, ingredientNormalized);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return Optional.empty();
                }
                return Optional.of(mapRow(rs));
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    private IngredientMarketPrice mapRow(ResultSet rs) throws SQLException {
        IngredientMarketPrice item = new IngredientMarketPrice();
        item.setIngredientName(rs.getString("ingredient_name"));
        item.setIngredientNormalized(rs.getString("ingredient_normalized"));
        item.setSupermarket(rs.getString("supermarket"));
        item.setProductName(rs.getString("product_name"));
        item.setProductUrl(rs.getString("product_url"));
        item.setImageUrl(rs.getString("image_url"));
        item.setPrice(rs.getDouble("price"));
        item.setCurrency(rs.getString("currency"));

        Object caloriesObj = rs.getObject("calories");
        if (caloriesObj != null) {
            item.setCalories(rs.getDouble("calories"));
        }

        item.setSource(rs.getString("source"));
        item.setNote(rs.getString("note"));

        item.setScrapedAt(rs.getString("scraped_at"));
        return item;
    }

    private void setNullableString(PreparedStatement ps, int idx, String value) throws SQLException {
        if (value == null) {
            ps.setNull(idx, Types.VARCHAR);
            return;
        }
        ps.setString(idx, value);
    }

    private void setNullableDouble(PreparedStatement ps, int idx, Double value) throws SQLException {
        if (value == null) {
            ps.setNull(idx, Types.REAL);
            return;
        }
        ps.setDouble(idx, value);
    }
}
