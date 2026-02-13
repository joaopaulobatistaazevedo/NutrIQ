package alnak.business_logic.entities;

public enum Sex
{
    M, F, OTHER;

    public static Sex from(String s) {
        return valueOf(s.toUpperCase());
    }
}
