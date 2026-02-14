package alnak.controllers;

import alnak.business_logic.entities.Post;
import alnak.business_logic.entities.User;
import alnak.dto.UpdateProfileRequest;
import alnak.dto.UserMeResponse;
import alnak.dto.UserStreakDTOs.RegisterMealPhotoRequest;
import alnak.dto.UserStreakDTOs.RegisterMealPhotoResponse;
import alnak.services.SocialService;
import alnak.services.UserService;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.List;

public class UserController {
    private final UserService userService;
    private final SocialService socialService;
    private final ObjectMapper mapper;

    public UserController(UserService userService, SocialService socialService) {
        this.userService = userService;
        this.socialService = socialService;
        this.mapper = new ObjectMapper().findAndRegisterModules();
    }

    public UserMeResponse me(Long userId) {
        User user = userService.getMe(userId);
        return UserMeResponse.from(user);
    }

    public UserMeResponse updateMyProfile(Long userId, UpdateProfileRequest request) {
        User updated = userService.updateProfile(userId, request);
        return UserMeResponse.from(updated);
    }

    public RegisterMealPhotoResponse registerMealPhoto(Long userId, String body) throws Exception {
        RegisterMealPhotoRequest request = mapper.readValue(body, RegisterMealPhotoRequest.class);

        String picturePath = String.valueOf(request.picturePath() == null ? "" : request.picturePath()).trim();
        if (picturePath.isEmpty()) {
            throw new IllegalArgumentException("picturePath é obrigatório.");
        }

        User updatedUser = userService.recordMealPhoto(userId);

        boolean shouldShare = request.shareOnNutriSocial();
        Post createdPost = null;

        if (shouldShare) {
            Integer recipeId = request.recipeId();
            Integer rating = request.rating();
            if (recipeId == null || recipeId <= 0) {
                throw new IllegalArgumentException("recipeId é obrigatório para partilhar no NutriSocial.");
            }
            if (rating == null || rating < 1 || rating > 5) {
                throw new IllegalArgumentException("rating deve estar entre 1 e 5 para partilhar no NutriSocial.");
            }

            createdPost = socialService.createPost(
                    userId,
                    recipeId,
                    picturePath,
                    request.description(),
                    rating
            );
        }

        return RegisterMealPhotoResponse.from(updatedUser, shouldShare, createdPost);
    }

    public List<UserMeResponse> listUsers() {
        return userService.listUsers().stream()
                .map(UserMeResponse::from)
                .toList();
    }

    public UserMeResponse getById(Long userId) {
        return UserMeResponse.from(userService.getById(userId));
    }
}
