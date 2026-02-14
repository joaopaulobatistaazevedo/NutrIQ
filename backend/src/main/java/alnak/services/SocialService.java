package alnak.services;

import alnak.business_logic.entities.Friendship;
import alnak.business_logic.entities.FriendStatus;
import alnak.business_logic.entities.Post;
import alnak.business_logic.entities.Recipe;
import alnak.data.global.FriendshipDAO;
import alnak.data.global.GlobalRecipeDAO;
import alnak.data.global.PostDAO;
import alnak.data.global.UserDAO;
import alnak.data.local.RecipeDAO;
import alnak.business_logic.entities.User;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Handles all social operations: posts, friend requests, ratings, and feed.
 *
 * Recipe sync responsibility: every write path that involves a recipe
 * (create post, rate recipe) first ensures the recipe exists in the
 * global MySQL mirror via {@link GlobalRecipeDAO}. This keeps the two
 * databases consistent without requiring a separate sync job for these flows.
 */
public class SocialService {
    public record FriendUserSummary(long id, String name, String email) {}
    public record UserSearchSuggestion(long id, String name, String email, String relationStatus) {}

    private final PostDAO postDAO;
    private final FriendshipDAO friendshipDAO;
    private final GlobalRecipeDAO globalRecipeDAO;
    private final UserDAO userDAO;
    private final RecipeDAO localRecipeDAO;   // source of truth for recipe content

    public SocialService(PostDAO postDAO,
                         FriendshipDAO friendshipDAO,
                         GlobalRecipeDAO globalRecipeDAO,
                         UserDAO userDAO,
                         RecipeDAO localRecipeDAO) {
        this.postDAO          = postDAO;
        this.friendshipDAO    = friendshipDAO;
        this.globalRecipeDAO  = globalRecipeDAO;
        this.userDAO          = userDAO;
        this.localRecipeDAO   = localRecipeDAO;
    }

    // ── Posts ─────────────────────────────────────────────────────

    /**
     * Create a post for a recipe.
     * Syncs the recipe to the global DB first so the FK always resolves.
     *
     * @param userId      the authenticated author
     * @param recipeId    must exist in local SQLite or in global recipes
     * @param picturePath path or URL to the uploaded picture
     * @param description optional caption
     * @param rating      1–5
     */
    public Post createPost(long userId, int recipeId,
                           String picturePath, String description, int rating) {
        Recipe recipe = requireRecipe(recipeId);
        Recipe localRecipe = localRecipeDAO.get(recipeId);
        if (localRecipe != null) {
            globalRecipeDAO.syncRecipe(localRecipe);   // ensure global mirror is up to date
            recipe = localRecipe;
        }

        Post post = postDAO.createPost(userId, recipeId, picturePath, description, rating);
        post.setRecipe(recipe);               // hydrate for the caller's convenience
        return post;
    }

    /**
     * Update the description and/or rating of an existing post.
     * Only the post owner can do this.
     */
    public Post updatePost(long postId, long requestingUserId,
                           String newDescription, int newRating) {
        postDAO.updatePost(postId, requestingUserId, newDescription, newRating);
        return postDAO.findById(postId)
                .map(this::hydratePost)
                .orElseThrow(() -> new IllegalStateException(
                        "Post disappeared after update: " + postId));
    }

    /**
     * Delete a post. Only the post owner can delete it.
     */
    public void deletePost(long postId, long requestingUserId) {
        postDAO.deletePost(postId, requestingUserId);
    }

    /**
     * Get a single post by id, with recipe hydrated.
     */
    public Post getPost(long postId) {
        return postDAO.findById(postId)
                .map(this::hydratePost)
                .orElseThrow(() -> new IllegalArgumentException(
                        "Post not found: " + postId));
    }

    /**
     * All posts by a specific user, newest first.
     */
    public List<Post> getPostsByUser(long userId) {
        return postDAO.findByUser(userId).stream()
                .map(this::hydratePost)
                .toList();
    }

    /**
     * All posts for a specific recipe, newest first.
     */
    public List<Post> getPostsByRecipe(int recipeId) {
        return postDAO.findByRecipe(recipeId).stream()
                .map(this::hydratePost)
                .toList();
    }

    /**
     * Social feed: the user's own posts + posts from accepted friends, newest first.
     */
    public List<Post> getFeed(long userId) {
        return postDAO.getFeedForUser(userId).stream()
                .map(this::hydratePost)
                .toList();
    }

    // ── Ratings ───────────────────────────────────────────────────

    /**
     * Rate a recipe directly (without creating a post).
     * Syncs the recipe to the global DB first.
     *
     * @param userId   the authenticated user
     * @param recipeId must exist in local SQLite or in global recipes
     * @param rating   1–5
     */
    public void rateRecipe(long userId, int recipeId, int rating) {
        Recipe localRecipe = localRecipeDAO.get(recipeId);
        if (localRecipe != null) {
            globalRecipeDAO.syncRecipe(localRecipe);
        } else {
            requireRecipe(recipeId);
        }
        globalRecipeDAO.rateRecipe(userId, recipeId, rating);
    }

    /**
     * Validates that a recipe id exists in local SQLite or global MySQL.
     */
    public void ensureRecipeExists(int recipeId) {
        requireRecipe(recipeId);
    }

    /**
     * Returns the given user's rating for a recipe, if they've rated it.
     */
    public Optional<Integer> getUserRating(long userId, int recipeId) {
        return globalRecipeDAO.getUserRating(userId, recipeId);
    }

    /**
     * Returns the global average rating for a recipe.
     */
    public Optional<Double> getAverageRating(int recipeId) {
        return globalRecipeDAO.getAverageRating(recipeId);
    }

    /**
     * Returns the average rating that accepted friends of {@code userId}
     * have given to {@code recipeId}.
     */
    public Optional<Double> getAverageFriendRating(long userId, int recipeId) {
        return globalRecipeDAO.getAverageFriendRating(userId, recipeId);
    }

    /**
     * Returns a map of friendId → rating for all friends who have rated
     * a given recipe.
     */
    public Map<Long, Integer> getFriendRatingsForRecipe(long userId, int recipeId) {
        return globalRecipeDAO.getFriendRatingsForRecipe(userId, recipeId);
    }

    /**
     * Top N recipe ids rated highest by a user's friends.
     * Useful for a "friends recommend" section.
     */
    public List<Integer> getTopRatedByFriends(long userId, int limit) {
        if (limit <= 0) throw new IllegalArgumentException("Limit must be positive.");
        return globalRecipeDAO.getTopRatedByFriends(userId, limit);
    }

    // ── Friends ───────────────────────────────────────────────────

    /**
     * Send a friend request from {@code requesterId} to {@code addresseeId}.
     */
    public Friendship sendFriendRequest(long requesterId, long addresseeId) {
        userDAO.findById(addresseeId)
                .orElseThrow(() -> new IllegalArgumentException("Utilizador não encontrado: " + addresseeId));
        return friendshipDAO.sendRequest(requesterId, addresseeId);
    }

    /**
     * Accept a pending friend request.
     * Only the addressee (the one who received the request) can accept.
     */
    public void acceptFriendRequest(long friendshipId, long requestingUserId) {
        friendshipDAO.acceptRequest(friendshipId, requestingUserId);
    }

    /**
     * Decline or cancel a friend request.
     * Both the addressee (decline) and the requester (cancel) can call this.
     */
    public void declineFriendRequest(long friendshipId, long requestingUserId) {
        friendshipDAO.declineOrCancelRequest(friendshipId, requestingUserId);
    }

    /**
     * Remove an accepted friendship (unfriend).
     */
    public void removeFriend(long friendshipId, long requestingUserId) {
        friendshipDAO.removeFriendship(friendshipId, requestingUserId);
    }

    /**
     * Returns the ids of all accepted friends of a user.
     */
    public List<Long> getFriendIds(long userId) {
        return friendshipDAO.findFriendIds(userId);
    }

    /**
     * Returns public friend summaries to support the social UI.
     */
    public List<FriendUserSummary> getFriendSummaries(long userId) {
        return friendshipDAO.findFriendIds(userId).stream()
                .map(userDAO::findById)
                .flatMap(Optional::stream)
                .map(this::toFriendSummary)
                .toList();
    }

    /**
     * Search users by name/email to send friend requests from the UI.
     * Includes relation status between requester and each match.
     */
    public List<UserSearchSuggestion> searchUsersForFriendRequest(long requesterId, String query, int limit) {
        String cleanQuery = query == null ? "" : query.trim();
        if (cleanQuery.length() < 2) {
            return List.of();
        }

        int normalizedLimit = Math.max(1, Math.min(20, limit));
        List<User> candidates = userDAO.searchUsersByNameOrEmail(cleanQuery, normalizedLimit * 3);

        return candidates.stream()
                .filter(candidate -> candidate.getId() != null && candidate.getId() != requesterId)
                .map(candidate -> new UserSearchSuggestion(
                        candidate.getId(),
                        safe(candidate.getName(), "Utilizador #" + candidate.getId()),
                        safe(candidate.getEmail(), ""),
                        relationStatus(requesterId, candidate.getId())
                ))
                .limit(normalizedLimit)
                .toList();
    }

    /**
     * Pending friend requests received by this user (inbox).
     */
    public List<Friendship> getPendingReceivedRequests(long userId) {
        return friendshipDAO.findPendingReceived(userId);
    }

    /**
     * Pending friend requests sent by this user (outbox).
     */
    public List<Friendship> getPendingSentRequests(long userId) {
        return friendshipDAO.findPendingSent(userId);
    }

    /**
     * Whether two users are currently accepted friends.
     */
    public boolean areFriends(long userA, long userB) {
        return friendshipDAO.areFriends(userA, userB);
    }

    // ── Private helpers ───────────────────────────────────────────

    /**
     * Fetches the recipe from local SQLite first, then global MySQL.
     * Used to validate recipeId before any global DB write.
     */
    private Recipe requireRecipe(int recipeId) {
        Recipe recipe = localRecipeDAO.get(recipeId);
        if (recipe != null) {
            return recipe;
        }
        return globalRecipeDAO.getRecipeById(recipeId)
                .orElseThrow(() -> new IllegalArgumentException("Receita não encontrada: " + recipeId));
    }

    /**
     * Attaches the local recipe to a post so callers get the full object graph.
     * Silently skips hydration if the recipe has since been deleted locally.
     */
    private Post hydratePost(Post post) {
        Recipe recipe = localRecipeDAO.get(post.getRecipeId());
        if (recipe == null) {
            recipe = globalRecipeDAO.getRecipeById(post.getRecipeId()).orElse(null);
        }
        if (recipe != null) post.setRecipe(recipe);
        return post;
    }

    private FriendUserSummary toFriendSummary(User user) {
        long id = user.getId() != null ? user.getId() : 0L;
        return new FriendUserSummary(
                id,
                safe(user.getName(), "Utilizador #" + id),
                safe(user.getEmail(), "")
        );
    }

    private String relationStatus(long requesterId, long addresseeId) {
        Optional<Friendship> relation = friendshipDAO.findBetween(requesterId, addresseeId);
        if (relation.isEmpty()) {
            return "NONE";
        }

        Friendship friendship = relation.get();
        FriendStatus status = friendship.getStatus();
        if (status == FriendStatus.ACCEPTED) {
            return "FRIEND";
        }
        if (status == FriendStatus.PENDING) {
            return friendship.getRequesterId() == requesterId ? "REQUEST_SENT" : "REQUEST_RECEIVED";
        }
        return "NONE";
    }

    private String safe(String value, String fallback) {
        String clean = value == null ? "" : value.trim();
        return clean.isEmpty() ? fallback : clean;
    }
}
