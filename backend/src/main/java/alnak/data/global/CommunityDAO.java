package alnak.data.global;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

public class CommunityDAO {

    public record Community(long id, long ownerUserId, String name, LocalDateTime createdAt) {}
    public record CommunityInvite(long communityId, String communityName, long inviterId, String inviterName, LocalDateTime createdAt) {}

    private final Connection conn;

    public CommunityDAO() {
        this.conn = GlobalDatabase.getInstance().getConnection();
    }

    public Community createCommunity(long ownerUserId, String name) {
        String cleanName = normalizeName(name);
        try {
            conn.setAutoCommit(false);
            try {
                long communityId;
                LocalDateTime createdAt = LocalDateTime.now();
                try (PreparedStatement ps = conn.prepareStatement("""
                        INSERT INTO social_communities (owner_user_id, name)
                        VALUES (?, ?)
                        """, Statement.RETURN_GENERATED_KEYS)) {
                    ps.setLong(1, ownerUserId);
                    ps.setString(2, cleanName);
                    ps.executeUpdate();
                    try (ResultSet keys = ps.getGeneratedKeys()) {
                        if (!keys.next()) {
                            throw new IllegalStateException("Não foi possível criar comunidade.");
                        }
                        communityId = keys.getLong(1);
                    }
                }

                try (PreparedStatement ps = conn.prepareStatement("""
                        INSERT INTO social_community_members
                        (community_id, user_id, status, invited_by_user_id)
                        VALUES (?, ?, 'ACCEPTED', ?)
                        ON DUPLICATE KEY UPDATE status = 'ACCEPTED', invited_by_user_id = VALUES(invited_by_user_id)
                        """)) {
                    ps.setLong(1, communityId);
                    ps.setLong(2, ownerUserId);
                    ps.setLong(3, ownerUserId);
                    ps.executeUpdate();
                }

                conn.commit();
                return new Community(communityId, ownerUserId, cleanName, createdAt);
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

    public Community renameCommunity(long communityId, long ownerUserId, String nextName) {
        String cleanName = normalizeName(nextName);
        try (PreparedStatement ps = conn.prepareStatement("""
                UPDATE social_communities
                SET name = ?
                WHERE id = ? AND owner_user_id = ?
                """)) {
            ps.setString(1, cleanName);
            ps.setLong(2, communityId);
            ps.setLong(3, ownerUserId);
            int updated = ps.executeUpdate();
            if (updated == 0) {
                throw new SecurityException("Apenas o criador pode editar esta comunidade.");
            }
            return findCommunityById(communityId).orElseThrow(() -> new IllegalArgumentException("Comunidade não encontrada."));
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    public void inviteUser(long communityId, long inviterId, long invitedUserId) {
        if (inviterId == invitedUserId) {
            throw new IllegalArgumentException("Não é possível convidar-te a ti próprio.");
        }

        Community community = findCommunityById(communityId)
                .orElseThrow(() -> new IllegalArgumentException("Comunidade não encontrada."));
        if (community.ownerUserId() != inviterId) {
            throw new SecurityException("Só o criador da comunidade pode enviar convites.");
        }

        try (PreparedStatement ps = conn.prepareStatement("""
                INSERT INTO social_community_members
                (community_id, user_id, status, invited_by_user_id)
                VALUES (?, ?, 'PENDING', ?)
                ON DUPLICATE KEY UPDATE
                  status = IF(status = 'ACCEPTED', 'ACCEPTED', 'PENDING'),
                  invited_by_user_id = VALUES(invited_by_user_id)
                """)) {
            ps.setLong(1, communityId);
            ps.setLong(2, invitedUserId);
            ps.setLong(3, inviterId);
            ps.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    public void acceptInvite(long communityId, long userId) {
        try (PreparedStatement ps = conn.prepareStatement("""
                UPDATE social_community_members
                SET status = 'ACCEPTED'
                WHERE community_id = ? AND user_id = ? AND status = 'PENDING'
                """)) {
            ps.setLong(1, communityId);
            ps.setLong(2, userId);
            int updated = ps.executeUpdate();
            if (updated == 0) {
                throw new IllegalArgumentException("Convite não encontrado.");
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    public void declineInvite(long communityId, long userId) {
        try (PreparedStatement ps = conn.prepareStatement("""
                UPDATE social_community_members
                SET status = 'DECLINED'
                WHERE community_id = ? AND user_id = ? AND status = 'PENDING'
                """)) {
            ps.setLong(1, communityId);
            ps.setLong(2, userId);
            int updated = ps.executeUpdate();
            if (updated == 0) {
                throw new IllegalArgumentException("Convite não encontrado.");
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    public List<Community> listCommunitiesForUser(long userId) {
        try (PreparedStatement ps = conn.prepareStatement("""
                SELECT DISTINCT c.id, c.owner_user_id, c.name, c.created_at
                FROM social_communities c
                LEFT JOIN social_community_members m ON m.community_id = c.id
                WHERE c.owner_user_id = ?
                   OR (m.user_id = ? AND m.status = 'ACCEPTED')
                ORDER BY c.created_at DESC
                """)) {
            ps.setLong(1, userId);
            ps.setLong(2, userId);
            try (ResultSet rs = ps.executeQuery()) {
                List<Community> list = new ArrayList<>();
                while (rs.next()) {
                    list.add(mapCommunity(rs));
                }
                return list;
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    public List<Long> listAcceptedMemberIds(long communityId) {
        try (PreparedStatement ps = conn.prepareStatement("""
                SELECT user_id
                FROM social_community_members
                WHERE community_id = ? AND status = 'ACCEPTED'
                ORDER BY user_id ASC
                """)) {
            ps.setLong(1, communityId);
            try (ResultSet rs = ps.executeQuery()) {
                List<Long> ids = new ArrayList<>();
                while (rs.next()) {
                    ids.add(rs.getLong("user_id"));
                }
                return ids;
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    public List<Long> listPendingInviteUserIds(long communityId) {
        try (PreparedStatement ps = conn.prepareStatement("""
                SELECT user_id
                FROM social_community_members
                WHERE community_id = ? AND status = 'PENDING'
                ORDER BY user_id ASC
                """)) {
            ps.setLong(1, communityId);
            try (ResultSet rs = ps.executeQuery()) {
                List<Long> ids = new ArrayList<>();
                while (rs.next()) {
                    ids.add(rs.getLong("user_id"));
                }
                return ids;
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    public List<CommunityInvite> listPendingInvitesForUser(long userId) {
        try (PreparedStatement ps = conn.prepareStatement("""
                SELECT m.community_id,
                       c.name AS community_name,
                       m.invited_by_user_id,
                       COALESCE(u.name, CONCAT('Utilizador #', m.invited_by_user_id)) AS inviter_name,
                       m.created_at
                FROM social_community_members m
                JOIN social_communities c ON c.id = m.community_id
                LEFT JOIN users u ON u.id = m.invited_by_user_id
                WHERE m.user_id = ? AND m.status = 'PENDING'
                ORDER BY m.created_at DESC
                """)) {
            ps.setLong(1, userId);
            try (ResultSet rs = ps.executeQuery()) {
                List<CommunityInvite> invites = new ArrayList<>();
                while (rs.next()) {
                    Timestamp ts = rs.getTimestamp("created_at");
                    invites.add(new CommunityInvite(
                            rs.getLong("community_id"),
                            rs.getString("community_name"),
                            rs.getLong("invited_by_user_id"),
                            rs.getString("inviter_name"),
                            ts != null ? ts.toLocalDateTime() : null
                    ));
                }
                return invites;
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    public Optional<Community> findCommunityById(long communityId) {
        try (PreparedStatement ps = conn.prepareStatement("""
                SELECT id, owner_user_id, name, created_at
                FROM social_communities
                WHERE id = ?
                LIMIT 1
                """)) {
            ps.setLong(1, communityId);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return Optional.empty();
                }
                return Optional.of(mapCommunity(rs));
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    private Community mapCommunity(ResultSet rs) throws SQLException {
        Timestamp ts = rs.getTimestamp("created_at");
        return new Community(
                rs.getLong("id"),
                rs.getLong("owner_user_id"),
                rs.getString("name"),
                ts != null ? ts.toLocalDateTime() : null
        );
    }

    private String normalizeName(String name) {
        String clean = String.valueOf(name == null ? "" : name).trim();
        if (clean.length() < 2) {
            throw new IllegalArgumentException("O nome da comunidade deve ter pelo menos 2 caracteres.");
        }
        return clean;
    }
}
