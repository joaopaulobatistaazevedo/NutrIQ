package alnak.data.global;

import alnak.business_logic.entities.Post;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.sql.Types;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

public class PostDAO {

    private final Connection conn;

    public PostDAO() {
        this.conn = GlobalDatabase.getInstance().getConnection();
    }

    // ── Write ─────────────────────────────────────────────────────

    /**
     * Creates a new post and also upserts the rating into {@code user_recipe_ratings}
     * so the two tables stay in sync — all in one transaction.
     */
    public Post createPost(long userId, int recipeId, String picturePath,
                           String description, int rating) {
        validateRating(rating);
        try {
            conn.setAutoCommit(false);
            try {
                Post post = insertPost(userId, recipeId, picturePath, description, rating);
                upsertRating(userId, recipeId, rating);
                conn.commit();
                return post;
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

    /**
     * Update the description and/or rating of an existing post.
     * Also keeps {@code user_recipe_ratings} in sync when the rating changes.
     */
    public void updatePost(long postId, long requestingUserId,
                           String newDescription, int newRating) {
        validateRating(newRating);
        try {
            conn.setAutoCommit(false);
            try {
                // Fetch to verify ownership and get recipeId for rating sync
                Post existing = findById(postId)
                        .orElseThrow(() -> new IllegalArgumentException("Post not found: " + postId));
                if (existing.getUserId() != requestingUserId)
                    throw new SecurityException("User " + requestingUserId + " does not own post " + postId);

                try (PreparedStatement ps = conn.prepareStatement("""
                        UPDATE posts SET description = ?, rating = ? WHERE id = ?
                        """)) {
                    setNullableString(ps, 1, newDescription);
                    ps.setInt(2, newRating);
                    ps.setLong(3, postId);
                    ps.executeUpdate();
                }
                upsertRating(requestingUserId, existing.getRecipeId(), newRating);
                conn.commit();
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

    /**
     * Delete a post. Only the owner can delete their own post.
     */
    public void deletePost(long postId, long requestingUserId) {
        try (PreparedStatement ps = conn.prepareStatement(
                "DELETE FROM posts WHERE id = ? AND user_id = ?")) {
            ps.setLong(1, postId);
            ps.setLong(2, requestingUserId);
            int deleted = ps.executeUpdate();
            if (deleted == 0)
                throw new IllegalArgumentException(
                        "Post not found or user " + requestingUserId + " does not own post " + postId);
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    // ── Read ──────────────────────────────────────────────────────

    /**
     * Find a single post by id.
     */
    public Optional<Post> findById(long postId) {
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT * FROM posts WHERE id = ?")) {
            ps.setLong(1, postId);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) return Optional.empty();
                return Optional.of(mapPost(rs));
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    /**
     * All posts by a specific user, newest first.
     */
    public List<Post> findByUser(long userId) {
        return queryPosts(
                "SELECT * FROM posts WHERE user_id = ? ORDER BY created_at DESC",
                userId);
    }

    /**
     * All posts for a specific recipe, newest first.
     */
    public List<Post> findByRecipe(int recipeId) {
        return queryPosts(
                "SELECT * FROM posts WHERE recipe_id = ? ORDER BY created_at DESC",
                recipeId);
    }

    /**
     * Social feed: posts from {@code userId} and all their accepted friends,
     * newest first. Useful for a home/feed screen.
     */
    public List<Post> getFeedForUser(long userId) {
        String sql = """
                SELECT p.*
                FROM posts p
                WHERE p.user_id = ?
                   OR p.user_id IN (
                       SELECT CASE WHEN f.requester_id = ? THEN f.addressee_id
                                   ELSE f.requester_id END
                       FROM friendships f
                       WHERE (f.requester_id = ? OR f.addressee_id = ?)
                         AND f.status = 'ACCEPTED'
                   )
                ORDER BY p.created_at DESC
                """;
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setLong(1, userId);
            ps.setLong(2, userId);
            ps.setLong(3, userId);
            ps.setLong(4, userId);
            try (ResultSet rs = ps.executeQuery()) {
                List<Post> posts = new ArrayList<>();
                while (rs.next()) posts.add(mapPost(rs));
                return posts;
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    // ── Private helpers ───────────────────────────────────────────

    private Post insertPost(long userId, int recipeId, String picturePath,
                            String description, int rating) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement("""
                INSERT INTO posts (user_id, recipe_id, picture_path, description, rating)
                VALUES (?, ?, ?, ?, ?)
                """, Statement.RETURN_GENERATED_KEYS)) {
            ps.setLong(1, userId);
            ps.setInt(2, recipeId);
            ps.setString(3, picturePath);
            setNullableString(ps, 4, description);
            ps.setInt(5, rating);
            ps.executeUpdate();

            Post post = new Post();
            try (ResultSet keys = ps.getGeneratedKeys()) {
                if (keys.next()) post.setId(keys.getLong(1));
            }
            post.setUserId(userId);
            post.setRecipeId(recipeId);
            post.setPicturePath(picturePath);
            post.setDescription(description);
            post.setRating(rating);
            return post;
        }
    }

    /**
     * Insert or update the user's rating for a recipe.
     * Always reflects the most recent post rating.
     */
    private void upsertRating(long userId, int recipeId, int rating) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement("""
                INSERT INTO user_recipe_ratings (user_id, recipe_id, rating)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE rating = VALUES(rating)
                """)) {
            ps.setLong(1, userId);
            ps.setInt(2, recipeId);
            ps.setInt(3, rating);
            ps.executeUpdate();
        }
    }

    private List<Post> queryPosts(String sql, long param) {
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setLong(1, param);
            try (ResultSet rs = ps.executeQuery()) {
                List<Post> posts = new ArrayList<>();
                while (rs.next()) posts.add(mapPost(rs));
                return posts;
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    private Post mapPost(ResultSet rs) throws SQLException {
        Post post = new Post();
        post.setId(rs.getLong("id"));
        post.setUserId(rs.getLong("user_id"));
        post.setRecipeId(rs.getInt("recipe_id"));
        post.setPicturePath(rs.getString("picture_path"));
        post.setDescription(rs.getString("description"));
        post.setRating(rs.getInt("rating"));
        Timestamp ts = rs.getTimestamp("created_at");
        if (ts != null) post.setCreatedAt(ts.toLocalDateTime());
        return post;
    }

    // ── Kudos ─────────────────────────────────────────────────────

    /**
     * Toggle a kudo for a post: add if absent, remove if present.
     * Returns true if the kudo was added, false if it was removed.
     */
    public boolean toggleKudo(long postId, long userId) {
        // Check existence first
        try (PreparedStatement check = conn.prepareStatement(
                "SELECT 1 FROM post_kudos WHERE post_id = ? AND user_id = ?")) {
            check.setLong(1, postId);
            check.setLong(2, userId);
            try (ResultSet rs = check.executeQuery()) {
                if (rs.next()) {
                    // Remove
                    try (PreparedStatement del = conn.prepareStatement(
                            "DELETE FROM post_kudos WHERE post_id = ? AND user_id = ?")) {
                        del.setLong(1, postId);
                        del.setLong(2, userId);
                        del.executeUpdate();
                    }
                    return false;
                } else {
                    // Add
                    try (PreparedStatement ins = conn.prepareStatement(
                            "INSERT INTO post_kudos (post_id, user_id) VALUES (?, ?)")) {
                        ins.setLong(1, postId);
                        ins.setLong(2, userId);
                        ins.executeUpdate();
                    }
                    return true;
                }
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    /**
     * Returns a map of userId → createdAt for all kudos on a post.
     */
    public java.util.Map<Long, String> getKudosForPost(long postId) {
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT user_id, created_at FROM post_kudos WHERE post_id = ?")) {
            ps.setLong(1, postId);
            try (ResultSet rs = ps.executeQuery()) {
                java.util.Map<Long, String> map = new java.util.LinkedHashMap<>();
                while (rs.next()) {
                    Timestamp ts = rs.getTimestamp("created_at");
                    map.put(rs.getLong("user_id"), ts != null ? ts.toLocalDateTime().toString() : "");
                }
                return map;
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    // ── Comments ──────────────────────────────────────────────────

    /**
     * Add a comment to a post. Returns the new comment with its generated id.
     */
    public alnak.business_logic.entities.PostComment addComment(long postId, long userId, String text) {
        String clean = text == null ? "" : text.trim();
        if (clean.isEmpty()) throw new IllegalArgumentException("Comment text cannot be empty.");
        try (PreparedStatement ps = conn.prepareStatement(
                "INSERT INTO post_comments (post_id, user_id, text) VALUES (?, ?, ?)",
                Statement.RETURN_GENERATED_KEYS)) {
            ps.setLong(1, postId);
            ps.setLong(2, userId);
            ps.setString(3, clean);
            ps.executeUpdate();
            alnak.business_logic.entities.PostComment c = new alnak.business_logic.entities.PostComment();
            try (ResultSet keys = ps.getGeneratedKeys()) {
                if (keys.next()) c.setId(keys.getLong(1));
            }
            c.setPostId(postId);
            c.setUserId(userId);
            c.setText(clean);
            c.setCreatedAt(java.time.LocalDateTime.now());
            return c;
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    /**
     * Returns all comments for a post, oldest first.
     */
    public List<alnak.business_logic.entities.PostComment> getCommentsForPost(long postId) {
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT * FROM post_comments WHERE post_id = ? ORDER BY created_at ASC")) {
            ps.setLong(1, postId);
            try (ResultSet rs = ps.executeQuery()) {
                List<alnak.business_logic.entities.PostComment> list = new ArrayList<>();
                while (rs.next()) {
                    alnak.business_logic.entities.PostComment c = new alnak.business_logic.entities.PostComment();
                    c.setId(rs.getLong("id"));
                    c.setPostId(rs.getLong("post_id"));
                    c.setUserId(rs.getLong("user_id"));
                    c.setText(rs.getString("text"));
                    Timestamp ts = rs.getTimestamp("created_at");
                    if (ts != null) c.setCreatedAt(ts.toLocalDateTime());
                    list.add(c);
                }
                return list;
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    private void setNullableString(PreparedStatement ps, int index, String value) throws SQLException {
        if (value == null) ps.setNull(index, Types.VARCHAR);
        else ps.setString(index, value);
    }

    private void validateRating(int rating) {
        if (rating < 1 || rating > 5)
            throw new IllegalArgumentException("Rating must be between 1 and 5, got: " + rating);
    }
}