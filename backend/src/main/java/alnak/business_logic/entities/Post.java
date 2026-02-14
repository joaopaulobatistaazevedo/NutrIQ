package alnak.business_logic.entities;

import java.time.LocalDateTime;

public class Post {

    private long id;
    private long userId;         // author
    private int recipeId;        // recipe used
    private Recipe recipe;       // hydrated on load
    private String picturePath;  // path or URL to the picture
    private String description;  // optional
    private int rating;          // 1–5
    private LocalDateTime createdAt;

    // ── Getters & Setters ─────────────────────────────────────────

    public long getId()                        { return id; }
    public void setId(long id)                 { this.id = id; }

    public long getUserId()                    { return userId; }
    public void setUserId(long userId)         { this.userId = userId; }

    public int getRecipeId()                   { return recipeId; }
    public void setRecipeId(int recipeId)      { this.recipeId = recipeId; }

    public Recipe getRecipe()                  { return recipe; }
    public void setRecipe(Recipe recipe)       { this.recipe = recipe; }

    public String getPicturePath()             { return picturePath; }
    public void setPicturePath(String p)       { this.picturePath = p; }

    public String getDescription()             { return description; }
    public void setDescription(String d)       { this.description = d; }

    public int getRating()                     { return rating; }
    public void setRating(int rating) {
        if (rating < 1 || rating > 5)
            throw new IllegalArgumentException("Rating must be between 1 and 5");
        this.rating = rating;
    }

    public LocalDateTime getCreatedAt()        { return createdAt; }
    public void setCreatedAt(LocalDateTime t)  { this.createdAt = t; }

    @Override
    public String toString() {
        return "Post{id=" + id + ", userId=" + userId + ", recipeId=" + recipeId
                + ", rating=" + rating + ", createdAt=" + createdAt + "}";
    }
}
