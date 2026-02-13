package alnak.dto;

import alnak.models.User;
import alnak.models.UserProfile;

public class UserMeResponse {
    private Long id;
    private String name;
    private String email;
    private UserProfile profile;

    public static UserMeResponse from(User user) {
        UserMeResponse response = new UserMeResponse();
        response.setId(user.getId());
        response.setName(user.getName());
        response.setEmail(user.getEmail());
        response.setProfile(user.getProfile());
        return response;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public UserProfile getProfile() {
        return profile;
    }

    public void setProfile(UserProfile profile) {
        this.profile = profile;
    }
}
