package alnak.dto;

import alnak.business_logic.entities.Post;
import alnak.business_logic.entities.User;

public class UserStreakDTOs {

    public record RegisterMealPhotoRequest(
            String picturePath,
            String description,
            boolean shareOnNutriSocial,
            Integer recipeId,
            Integer rating
    ) {}

    public record RegisterMealPhotoResponse(
            Long userId,
            int streakCount,
            boolean sharedOnNutriSocial,
            Long postId
    ) {
        public static RegisterMealPhotoResponse from(User user, boolean shared, Post post) {
            int streak = 0;
            if (user != null && user.getProfile() != null) {
                streak = user.getProfile().getStreakCount();
            }
            return new RegisterMealPhotoResponse(
                    user != null ? user.getId() : null,
                    streak,
                    shared,
                    post != null ? post.getId() : null
            );
        }
    }
}
