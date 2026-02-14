package alnak.business_logic.entities;

public enum PlanStatus
{
    ACTIVE, COMPLETED;

    public static PlanStatus from(String s) {
        return valueOf(s.toUpperCase());
    }
}
