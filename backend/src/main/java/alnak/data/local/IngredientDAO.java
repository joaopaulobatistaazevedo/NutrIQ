package alnak.data.local;

import alnak.business_logic.entities.Allergen;
import alnak.business_logic.entities.Ingredient;
import alnak.business_logic.entities.Unit;

import java.sql.*;
import java.util.*;

/**
 * Map<Integer, Ingredient> backed by SQLite.
 * Keys are ingredient ids.
 */
public class IngredientDAO extends AbstractMap<Integer, Ingredient> {

    private final Connection conn;

    public IngredientDAO() {
        this.conn = LocalDatabase.getInstance().getConnection();
    }

    // ── AbstractMap contract ──────────────────────────────────────

    @Override
    public Set<Entry<Integer, Ingredient>> entrySet() {
        try {
            Set<Entry<Integer, Ingredient>> entries = new LinkedHashSet<>();
            try (Statement stmt = conn.createStatement();
                 ResultSet rs = stmt.executeQuery("SELECT * FROM ingredients ORDER BY name")) {
                while (rs.next()) {
                    Ingredient i = mapIngredient(rs);
                    loadAllergens(i);
                    entries.add(new SimpleImmutableEntry<>(i.getId(), i));
                }
            }
            return entries;
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    @Override
    public Ingredient get(Object key) {
        if (!(key instanceof Integer id)) return null;
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT * FROM ingredients WHERE id = ?")) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) return null;
                Ingredient i = mapIngredient(rs);
                loadAllergens(i);
                return i;
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    @Override
    public Ingredient put(Integer key, Ingredient ingredient) {
        Ingredient previous = key != null && key > 0 ? get(key) : null;
        try {
            if (previous == null) insert(ingredient);
            else { ingredient.setId(key); update(ingredient); }
        } catch (SQLException e) { throw new RuntimeException(e); }
        return previous;
    }

    /** Convenience — INSERT without a key. Populates id on the passed object. */
    public Ingredient put(Ingredient ingredient) {
        try { insert(ingredient); return ingredient; }
        catch (SQLException e) { throw new RuntimeException(e); }
    }

    @Override
    public Ingredient remove(Object key) {
        if (!(key instanceof Integer id)) return null;
        Ingredient previous = get(id);
        if (previous != null) {
            try (PreparedStatement ps = conn.prepareStatement(
                    "DELETE FROM ingredients WHERE id = ?")) {
                ps.setInt(1, id);
                ps.executeUpdate();
            } catch (SQLException e) { throw new RuntimeException(e); }
        }
        return previous;
    }

    @Override
    public boolean containsKey(Object key) {
        if (!(key instanceof Integer id)) return false;
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT 1 FROM ingredients WHERE id = ?")) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) { return rs.next(); }
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    // ── Domain helpers ────────────────────────────────────────────

    /** Find by exact normalized name — used for scraper deduplication. */
    public Optional<Ingredient> findByName(String name) {
        String normalized = name.toLowerCase().replaceAll("[^a-z0-9 ]", "").trim();
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT * FROM ingredients WHERE normalized_name = ?")) {
            ps.setString(1, normalized);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) return Optional.empty();
                Ingredient i = mapIngredient(rs);
                loadAllergens(i);
                return Optional.of(i);
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    /** All ingredients whose normalized name contains the query. */
    public List<Ingredient> search(String query) {
        try {
            List<Ingredient> result = new ArrayList<>();
            String normalized = query.toLowerCase().replaceAll("[^a-z0-9 ]", "").trim();
            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT * FROM ingredients WHERE normalized_name LIKE ? ORDER BY name")) {
                ps.setString(1, "%" + normalized + "%");
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        Ingredient i = mapIngredient(rs);
                        loadAllergens(i);
                        result.add(i);
                    }
                }
            }
            return result;
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    /** All ingredients in a given category (MEAT, PRODUCE, DAIRY…). */
    public List<Ingredient> byCategory(String category) {
        try {
            List<Ingredient> result = new ArrayList<>();
            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT * FROM ingredients WHERE category = ? ORDER BY name")) {
                ps.setString(1, category.toUpperCase());
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        Ingredient i = mapIngredient(rs);
                        loadAllergens(i);
                        result.add(i);
                    }
                }
            }
            return result;
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    // ── Private helpers ───────────────────────────────────────────

    private void insert(Ingredient i) throws SQLException {
        String sql = """
            INSERT INTO ingredients (name, normalized_name, price_per_unit, unit, category)
            VALUES (?, ?, ?, ?, ?)
        """;
        try (PreparedStatement ps = conn.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, i.getName());
            ps.setString(2, i.getNormalizedName());
            ps.setDouble(3, i.getPricePerUnit());
            ps.setString(4, i.getUnit() != null ? i.getUnit().name() : null);
            ps.setString(5, i.getCategory());
            ps.executeUpdate();
            try (ResultSet keys = ps.getGeneratedKeys()) {
                if (keys.next()) i.setId(keys.getInt(1));
            }
        }
        saveAllergens(i);
    }

    private void update(Ingredient i) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement("""
            UPDATE ingredients SET name=?, normalized_name=?, price_per_unit=?, unit=?, category=?
            WHERE id=?
        """)) {
            ps.setString(1, i.getName());
            ps.setString(2, i.getNormalizedName());
            ps.setDouble(3, i.getPricePerUnit());
            ps.setString(4, i.getUnit() != null ? i.getUnit().name() : null);
            ps.setString(5, i.getCategory());
            ps.setInt(6, i.getId());
            ps.executeUpdate();
        }
        try (PreparedStatement ps = conn.prepareStatement(
                "DELETE FROM ingredient_allergens WHERE ingredient_id = ?")) {
            ps.setInt(1, i.getId());
            ps.executeUpdate();
        }
        saveAllergens(i);
    }

    private void saveAllergens(Ingredient i) throws SQLException {
        if (i.getAllergens() == null || i.getAllergens().isEmpty()) return;
        try (PreparedStatement ps = conn.prepareStatement(
                "INSERT OR IGNORE INTO ingredient_allergens (ingredient_id, allergen) VALUES (?, ?)")) {
            for (Allergen a : i.getAllergens()) {
                ps.setInt(1, i.getId());
                ps.setString(2, a.name());
                ps.addBatch();
            }
            ps.executeBatch();
        }
    }

    private void loadAllergens(Ingredient i) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT allergen FROM ingredient_allergens WHERE ingredient_id = ?")) {
            ps.setInt(1, i.getId());
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) i.addAllergen(Allergen.from(rs.getString(1)));
            }
        }
    }

    private Ingredient mapIngredient(ResultSet rs) throws SQLException {
        Ingredient i = new Ingredient();
        i.setId(rs.getInt("id"));
        i.setName(rs.getString("name"));
        String unit = rs.getString("unit");
        if (unit != null) i.setUnit(Unit.from(unit));
        i.setPricePerUnit(rs.getDouble("price_per_unit"));
        i.setCategory(rs.getString("category"));
        return i;
    }
}
