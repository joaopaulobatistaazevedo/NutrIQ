package alnak.business_logic.entities;

import java.time.LocalDateTime;

public class PostComment {

    private long id;
    private long postId;
    private long userId;
    private String text;
    private LocalDateTime createdAt;

    public long getId()                        { return id; }
    public void setId(long id)                 { this.id = id; }

    public long getPostId()                    { return postId; }
    public void setPostId(long postId)         { this.postId = postId; }

    public long getUserId()                    { return userId; }
    public void setUserId(long userId)         { this.userId = userId; }

    public String getText()                    { return text; }
    public void setText(String text)           { this.text = text; }

    public LocalDateTime getCreatedAt()        { return createdAt; }
    public void setCreatedAt(LocalDateTime t)  { this.createdAt = t; }

    @Override
    public String toString() {
        return "PostComment{id=" + id + ", postId=" + postId
                + ", userId=" + userId + ", text='" + text + "'}";
    }
}