package alnak.business_logic.entities;

public enum Goal {
    LOSE_WEIGHT, MAINTAIN, BULK;

    public static Goal from(String s) {
        return valueOf(s.toUpperCase());
    }
}
