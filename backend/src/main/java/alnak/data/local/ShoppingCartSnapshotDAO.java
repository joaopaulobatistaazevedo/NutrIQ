package alnak.data.local;

import java.sql.*;
import java.util.Optional;

public class ShoppingCartSnapshotDAO {

    private final Connection conn;

    public ShoppingCartSnapshotDAO() {
        this.conn = LocalDatabase.getInstance().getConnection();
    }

    public void save(long userId, String payloadJson) {
        try {
            ensureLocalUserExists(userId);
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }

        try (PreparedStatement ps = conn.prepareStatement("""
            INSERT INTO shopping_cart_snapshots (user_id, payload_json, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id)
            DO UPDATE SET payload_json = excluded.payload_json,
                          updated_at = CURRENT_TIMESTAMP
        """)) {
            ps.setLong(1, userId);
            ps.setString(2, payloadJson);
            ps.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    private void ensureLocalUserExists(long userId) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement("""
            INSERT INTO users (id, name, email, password_hash, created_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO NOTHING
        """)) {
            ps.setLong(1, userId);
            ps.setString(2, "User " + userId);
            ps.setString(3, "user-" + userId + "@local.shopping-cart");
            ps.setString(4, "local-only");
            ps.executeUpdate();
        }
    }

    public Optional<String> findByUserId(long userId) {
        try (PreparedStatement ps = conn.prepareStatement("""
            SELECT payload_json
            FROM shopping_cart_snapshots
            WHERE user_id = ?
            LIMIT 1
        """)) {
            ps.setLong(1, userId);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return Optional.empty();
                }
                return Optional.ofNullable(rs.getString("payload_json"));
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }
}
