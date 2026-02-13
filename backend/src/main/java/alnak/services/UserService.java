package alnak.services;

import alnak.business_logic.entities.UserProfile;
import alnak.dto.UpdateProfileRequest;
import alnak.business_logic.entities.User;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class UserService {
    private final Map<Long, User> usersById = new HashMap<>();

    public User getMe(Long userId) {
        User user = usersById.get(userId);
        if (user == null) {
            throw new IllegalArgumentException("Utilizador não encontrado");
        }
        return user;
    }

    public User updateProfile(Long userId, UpdateProfileRequest request) {
        User user = getMe(userId);

        UserProfile profile = user.getProfile();
        if (profile == null) {
            profile = new UserProfile();
            user.setProfile(profile);
        }

        if (request.getAge() != null) {
            profile.setAge(request.getAge());
        }
        if (request.getSex() != null) {
            profile.setSex(request.getSex());
        }
        if (request.getHeightCm() != null) {
            profile.setHeightCm(request.getHeightCm());
        }
        if (request.getWeightKg() != null) {
            profile.setWeightKg(request.getWeightKg());
        }
        if (request.getGoal() != null) {
            profile.setGoal(request.getGoal());
        }
        if (request.getRestrictions() != null) {
            if (request.getRestrictions().isEmpty()) {
                profile.getRestrictions().clear();
            } else {
                profile.getRestrictions().addAll(request.getRestrictions());
            }
        }
        if (request.getAllergens() != null) {
            if (request.getAllergens().isEmpty()) {
                profile.getAllergens().clear();
            } else {
                profile.getAllergens().addAll(request.getAllergens());
            }
        }
        if (request.getMaxWeeklyBudget() != null) {
            profile.setMaxWeeklyBudget(request.getMaxWeeklyBudget());
        }

        return user;
    }

    public void putUser(User user) {
        usersById.put(user.getId(), user);
    }

    public List<User> listUsers() {
        return new ArrayList<>(usersById.values());
    }

    public User getById(Long userId) {
        return getMe(userId);
    }
}
