package alnak.business_logic.entities;

import java.time.LocalDateTime;

public class Friendship {

    private long id;
    private long requesterId;
    private long addresseeId;
    private FriendStatus status;
    private LocalDateTime createdAt;

    public long getId()                            { return id; }
    public void setId(long id)                     { this.id = id; }
    public long getRequesterId()                   { return requesterId; }
    public void setRequesterId(long requesterId)   { this.requesterId = requesterId; }
    public long getAddresseeId()                   { return addresseeId; }
    public void setAddresseeId(long addresseeId)   { this.addresseeId = addresseeId; }
    public FriendStatus getStatus()            { return status; }
    public void setStatus(FriendStatus status) { this.status = status; }
    public LocalDateTime getCreatedAt()            { return createdAt; }
    public void setCreatedAt(LocalDateTime t)      { this.createdAt = t; }

    @Override
    public String toString() {
        return "Friendship{id=" + id + ", requester=" + requesterId
                + ", addressee=" + addresseeId + ", status=" + status + "}";
    }
}