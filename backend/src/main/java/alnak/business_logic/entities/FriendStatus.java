package alnak.business_logic.entities;

public enum FriendStatus
{
    PENDING,
    ACCEPTED,
    DECLINED;

    public static FriendStatus from(String value) {
        if (value == null) throw new IllegalArgumentException("FriendStatus cannot be null");
        return switch (value.toUpperCase()) {
            case "PENDING"  -> PENDING;
            case "ACCEPTED" -> ACCEPTED;
            case "DECLINED" -> DECLINED;
            default -> throw new IllegalArgumentException("Unknown FriendStatus: " + value);
        };
    }
}