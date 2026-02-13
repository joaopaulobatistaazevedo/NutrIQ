package alnak.controllers;

import alnak.dto.UpdateProfileRequest;
import alnak.dto.UserMeResponse;
import alnak.models.User;
import alnak.services.UserService;

import java.util.List;

public class UserController {
    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    public UserMeResponse me(Long userId) {
        User user = userService.getMe(userId);
        return UserMeResponse.from(user);
    }

    public UserMeResponse updateMyProfile(Long userId, UpdateProfileRequest request) {
        User updated = userService.updateProfile(userId, request);
        return UserMeResponse.from(updated);
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
