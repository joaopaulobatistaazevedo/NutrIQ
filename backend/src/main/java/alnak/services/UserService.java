package alnak.services;

import alnak.business_logic.entities.Allergen;
import alnak.business_logic.entities.Goal;
import alnak.business_logic.entities.Sex;
import alnak.business_logic.entities.User;
import alnak.business_logic.entities.UserProfile;
import alnak.data.global.UserDAO;
import alnak.dto.UpdateProfileRequest;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;

public class UserService {

    private final UserDAO userDAO;

    public UserService() {
        this(new UserDAO());
    }

    public UserService(UserDAO userDAO) {
        this.userDAO = userDAO;
    }

    public User getMe(Long userId) {
        return userDAO.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("Utilizador não encontrado"));
    }

    public User updateProfile(Long userId, UpdateProfileRequest request) {
        User user = getMe(userId);

        UserProfile profile = user.getProfile();
        if (profile == null) {
            profile = new UserProfile();
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
            profile.replaceRestrictions(request.getRestrictions());
        }
        if (request.getAllergens() != null) {
            profile.replaceAllergens(parseAllergens(request.getAllergens()));
        }
        if (request.getMaxWeeklyBudget() != null) {
            profile.setMaxWeeklyBudget(request.getMaxWeeklyBudget());
        }
        if (request.getPicturePath() != null) {
            profile.setPicturePath(request.getPicturePath().trim());
        }

        if (canCalculateCalories(profile)) {
            profile.calculateDailyCalories();
        }

        userDAO.saveProfile(userId, profile);
        return getMe(userId);
    }

    public User recordMealPhoto(Long userId) {
        getMe(userId);
        userDAO.recordMealPhotoForStreak(userId);
        return getMe(userId);
    }

    public List<User> listUsers() {
        return userDAO.listUsers();
    }

    public User getById(Long userId) {
        return getMe(userId);
    }

    private Set<Allergen> parseAllergens(Set<String> allergensRaw) {
        Set<Allergen> allergens = EnumSet.noneOf(Allergen.class);
        for (String allergenRaw : allergensRaw) {
            String normalized = allergenRaw == null ? null : allergenRaw.trim();
            if (normalized == null || normalized.isEmpty()) {
                throw new IllegalArgumentException("Alergénio inválido: " + allergenRaw);
            }
            try {
                allergens.add(Allergen.from(normalized));
            } catch (IllegalArgumentException e) {
                throw new IllegalArgumentException("Alergénio inválido: " + allergenRaw);
            }
        }
        return allergens;
    }

    private boolean canCalculateCalories(UserProfile profile) {
        return profile.getAge() > 0
                && profile.getHeightCm() > 0
                && profile.getWeightKg() > 0
                && isDefined(profile.getSex())
                && isDefined(profile.getGoal());
    }

    private boolean isDefined(Sex sex) {
        return sex != null;
    }

    private boolean isDefined(Goal goal) {
        return goal != null;
    }
}
