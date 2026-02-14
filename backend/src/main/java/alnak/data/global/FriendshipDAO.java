package alnak.data.global;

import alnak.business_logic.entities.Friendship;
import alnak.business_logic.entities.FriendStatus;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

public class FriendshipDAO {

    private final Connection conn;

    public FriendshipDAO() {
        this.conn = GlobalDatabase.getInstance().getConnection();
    }

    // ── Write ─────────────────────────────────────────────────────

    /**
     * Send a friend request. Throws if one already exists in either direction.
     */
    public Friendship sendRequest(long requesterId, long addresseeId) {
        if (requesterId == addresseeId)
            throw new IllegalArgumentException("Cannot send a friend request to yourself.");

        try (PreparedStatement ps = conn.prepareStatement("""
                INSERT INTO friendships (requester_id, addressee_id, status)
                VALUES (?, ?, 'PENDING')
                """, Statement.RETURN_GENERATED_KEYS)) {
            ps.setLong(1, requesterId);
            ps.setLong(2, addresseeId);
            ps.executeUpdate();

            Friendship f = new Friendship();
            try (ResultSet keys = ps.getGeneratedKeys()) {
                if (keys.next()) f.setId(keys.getLong(1));
            }
            f.setRequesterId(requesterId);
            f.setAddresseeId(addresseeId);
            f.setStatus(FriendStatus.PENDING);
            return f;
        } catch (SQLException e) {
            if (isDuplicateEntry(e))
                throw new IllegalArgumentException(
                        "A friend request already exists between these users.");
            throw new RuntimeException(e);
        }
    }

    /**
     * Accept a pending request. Only the addressee can accept.
     */
    public void acceptRequest(long friendshipId, long requestingUserId) {
        Friendship f = findById(friendshipId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "Friend request not found: " + friendshipId));

        if (f.getAddresseeId() != requestingUserId)
            throw new SecurityException(
                    "User " + requestingUserId + " cannot accept this request.");
        if (f.getStatus() != FriendStatus.PENDING)
            throw new IllegalStateException("Request is not pending.");

        updateStatus(friendshipId, FriendStatus.ACCEPTED);
    }

    /**
     * Decline or cancel a pending request.
     * The addressee can decline; the requester can cancel.
     */
    public void declineOrCancelRequest(long friendshipId, long requestingUserId) {
        Friendship f = findById(friendshipId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "Friend request not found: " + friendshipId));

        boolean isParty = f.getRequesterId() == requestingUserId
                || f.getAddresseeId() == requestingUserId;
        if (!isParty)
            throw new SecurityException(
                    "User " + requestingUserId + " is not part of this friendship.");

        updateStatus(friendshipId, FriendStatus.DECLINED);
    }

    /**
     * Remove an accepted friendship (unfriend).
     */
    public void removeFriendship(long friendshipId, long requestingUserId) {
        Friendship f = findById(friendshipId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "Friendship not found: " + friendshipId));

        boolean isParty = f.getRequesterId() == requestingUserId
                || f.getAddresseeId() == requestingUserId;
        if (!isParty)
            throw new SecurityException(
                    "User " + requestingUserId + " is not part of this friendship.");

        try (PreparedStatement ps = conn.prepareStatement(
                "DELETE FROM friendships WHERE id = ?")) {
            ps.setLong(1, friendshipId);
            ps.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    // ── Read ──────────────────────────────────────────────────────

    public Optional<Friendship> findById(long friendshipId) {
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT * FROM friendships WHERE id = ?")) {
            ps.setLong(1, friendshipId);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) return Optional.empty();
                return Optional.of(mapFriendship(rs));
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    /**
     * All accepted friends of a user (both directions).
     */
    public List<Long> findFriendIds(long userId) {
        String sql = """
                SELECT CASE WHEN requester_id = ? THEN addressee_id
                            ELSE requester_id END AS friend_id
                FROM friendships
                WHERE (requester_id = ? OR addressee_id = ?)
                  AND status = 'ACCEPTED'
                """;
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setLong(1, userId);
            ps.setLong(2, userId);
            ps.setLong(3, userId);
            try (ResultSet rs = ps.executeQuery()) {
                List<Long> ids = new ArrayList<>();
                while (rs.next()) ids.add(rs.getLong("friend_id"));
                return ids;
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    /**
     * Pending requests received by a user (they need to act on these).
     */
    public List<Friendship> findPendingReceived(long userId) {
        return queryFriendships(
                "SELECT * FROM friendships WHERE addressee_id = ? AND status = 'PENDING' ORDER BY created_at DESC",
                userId);
    }

    /**
     * Pending requests sent by a user (awaiting the other side).
     */
    public List<Friendship> findPendingSent(long userId) {
        return queryFriendships(
                "SELECT * FROM friendships WHERE requester_id = ? AND status = 'PENDING' ORDER BY created_at DESC",
                userId);
    }

    /**
     * Check whether two users are already accepted friends.
     */
    public boolean areFriends(long userA, long userB) {
        try (PreparedStatement ps = conn.prepareStatement("""
                SELECT 1 FROM friendships
                WHERE ((requester_id = ? AND addressee_id = ?)
                    OR (requester_id = ? AND addressee_id = ?))
                  AND status = 'ACCEPTED'
                """)) {
            ps.setLong(1, userA);
            ps.setLong(2, userB);
            ps.setLong(3, userB);
            ps.setLong(4, userA);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next();
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    // ── Private helpers ───────────────────────────────────────────

    private void updateStatus(long friendshipId, FriendStatus status) {
        try (PreparedStatement ps = conn.prepareStatement(
                "UPDATE friendships SET status = ? WHERE id = ?")) {
            ps.setString(1, status.name());
            ps.setLong(2, friendshipId);
            ps.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    private List<Friendship> queryFriendships(String sql, long param) {
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setLong(1, param);
            try (ResultSet rs = ps.executeQuery()) {
                List<Friendship> result = new ArrayList<>();
                while (rs.next()) result.add(mapFriendship(rs));
                return result;
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    private Friendship mapFriendship(ResultSet rs) throws SQLException {
        Friendship f = new Friendship();
        f.setId(rs.getLong("id"));
        f.setRequesterId(rs.getLong("requester_id"));
        f.setAddresseeId(rs.getLong("addressee_id"));
        f.setStatus(FriendStatus.valueOf(rs.getString("status")));
        Timestamp ts = rs.getTimestamp("created_at");
        if (ts != null) f.setCreatedAt(ts.toLocalDateTime());
        return f;
    }

    private boolean isDuplicateEntry(SQLException e) {
        return e.getErrorCode() == 1062 ||
                (e.getMessage() != null && e.getMessage().toLowerCase().contains("duplicate"));
    }
}