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
            String picturePath,
            String description,
            int rating,
            LocalDateTime createdAt
    ) {
        public static PostResponse from(Post post) {
            String recipeName = post.getRecipe() != null ? post.getRecipe().getName() : null;
            return new PostResponse(
                    post.getId(),
                    post.getUserId(),
                    post.getRecipeId(),
                    recipeName,
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

    // ── Feed ──────────────────────────────────────────────────────

    public record FeedResponse(
            List<PostResponse> posts,
            int count
    ) {}
}
