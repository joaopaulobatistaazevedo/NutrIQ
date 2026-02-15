package alnak.dto;

import alnak.business_logic.entities.Friendship;
import alnak.business_logic.entities.Post;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

// ── Post DTOs ─────────────────────────────────────────────────────────────────

/** Body for POST /api/social/posts */
public class SocialDTOs {

    public record CreatePostRequest(
            int recipeId,
            String picturePath,
            String description,
            int rating
    ) {}

    /** Body for PUT /api/social/posts/{id} */
    public record UpdatePostRequest(
            String description,
            int rating
    ) {}

    /** Full post response — includes recipe name for convenience */
    public record PostResponse(
            long id,
            long userId,
            int recipeId,
            String recipeName,
            String recipeImageUrl,
            String picturePath,
            String description,
            int rating,
            LocalDateTime createdAt
    ) {
        public static PostResponse from(Post post) {
            String recipeName = post.getRecipe() != null ? post.getRecipe().getName() : null;
            String recipeImageUrl = post.getRecipe() != null ? post.getRecipe().getImageUrl() : null;
            return new PostResponse(
                    post.getId(),
                    post.getUserId(),
                    post.getRecipeId(),
                    recipeName,
                    recipeImageUrl,
                    post.getPicturePath(),
                    post.getDescription(),
                    post.getRating(),
                    post.getCreatedAt()
            );
        }

        public static List<PostResponse> fromList(List<Post> posts) {
            return posts.stream().map(PostResponse::from).toList();
        }
    }

    // ── Recipe rating DTOs ────────────────────────────────────────

    /** Body for POST /api/social/recipes/{recipeId}/rate */
    public record RateRecipeRequest(int rating) {}

    public record RecipeRatingResponse(
            int recipeId,
            int userRating,
            Double averageRating,
            Double averageFriendRating,
            Map<Long, Integer> friendRatings
    ) {}

    // ── Friendship DTOs ───────────────────────────────────────────

    /** Body for POST /api/social/friends/request */
    public record FriendRequestBody(long addresseeId) {}

    public record FriendshipResponse(
            long id,
            long requesterId,
            long addresseeId,
            String status,
            LocalDateTime createdAt
    ) {
        public static FriendshipResponse from(Friendship f) {
            return new FriendshipResponse(
                    f.getId(),
                    f.getRequesterId(),
                    f.getAddresseeId(),
                    f.getStatus().name(),
                    f.getCreatedAt()
            );
        }

        public static List<FriendshipResponse> fromList(List<Friendship> list) {
            return list.stream().map(FriendshipResponse::from).toList();
        }
    }

    public record FriendUserResponse(
            long id,
            String name,
            String email
    ) {}

    public record FriendListResponse(
            List<Long> friendIds,
            List<FriendUserResponse> friends,
            int count
    ) {}

    public record UserSearchResponse(
            long id,
            String name,
            String email,
            String relationStatus
    ) {}

    // ── Kudo & Comment DTOs ───────────────────────────────────────

    /** Body for POST /api/social/posts/{id}/comments */
    public record AddCommentRequest(String text) {}

    public record CommentResponse(
            long id,
            long postId,
            long userId,
            String text,
            LocalDateTime createdAt
    ) {
        public static CommentResponse from(alnak.business_logic.entities.PostComment c) {
            return new CommentResponse(c.getId(), c.getPostId(), c.getUserId(),
                    c.getText(), c.getCreatedAt());
        }

        public static List<CommentResponse> fromList(
                List<alnak.business_logic.entities.PostComment> list) {
            return list.stream().map(CommentResponse::from).toList();
        }
    }

    /** Response after toggling a kudo. */
    public record KudoToggleResponse(long postId, boolean added, Map<Long, String> kudosByUser) {}

    /** Full interactions snapshot for one post — returned by GET /api/social/posts/{id}/interactions */
    public record PostInteractionsResponse(
            long postId,
            Map<Long, String> kudosByUser,
            List<CommentResponse> comments
    ) {}

    // ── Feed ──────────────────────────────────────────────────────

    public record FeedResponse(
            List<PostResponse> posts,
            int count
    ) {}
}
