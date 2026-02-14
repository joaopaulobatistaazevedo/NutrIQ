package alnak.business_logic.entities;

public enum Unit {
    // Weight
    G, KG, OZ, LB,
    // Volume
    ML, L, TSP, TBSP, CUP,
    // Count
    UNIT,
    // Loose
    PINCH, SLICE, BUNCH;

    public static Unit from(String s) {
        return valueOf(s.toUpperCase());
    }
}
