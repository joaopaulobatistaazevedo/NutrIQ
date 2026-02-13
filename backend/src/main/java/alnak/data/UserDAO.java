package alnak.data;

import alnak.business_logic.entities.UserProfile;

import java.sql.*;
import java.util.*;

/**
 * Manages the singleton user profile.
 * restrictions() and allergens() return live Set views backed by SQLite,
 * typed as Set<Restriction> and Set<Allergen> respectively.
 */
public class UserDAO {

    private final Connection conn;
    private final RestrictionSet restrictionSet;
    private final AllergenSet allergenSet;

    public UserDAO() {
        this.conn           = Database.getInstance().getConnection();
        this.restrictionSet = new RestrictionSet();
        this.allergenSet    = new AllergenSet();
    }

    // ── Profile ───────────────────────────────────────────────────

    public void saveProfile(UserProfile p) {
        try (PreparedStatement ps = conn.prepareStatement("""
            INSERT INTO user_profile
              (id, age, sex, height_cm, weight_kg, goal, daily_calories, budget_weekly)
            VALUES (1, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                age            = excluded.age,
                sex            = excluded.sex,
                height_cm      = excluded.height_cm,
                weight_kg      = excluded.weight_kg,
                goal           = excluded.goal,
                daily_calories = excluded.daily_calories,
                budget_weekly  = excluded.budget_weekly
        """)) {
            ps.setInt(1, p.getAge());
            ps.setString(2, p.getSex() != null ? p.getSex().name() : null);
            ps.setInt(3, p.getHeightCm());
            ps.setDouble(4, p.getWeightKg());
            ps.setString(5, p.getGoal() != null ? p.getGoal().name() : null);
            ps.setInt(6, p.getDailyCalories());
            ps.setDouble(7, p.getBudgetWeekly());
            ps.executeUpdate();
        } catch (SQLException e) { throw new RuntimeException(e); }

        // Persist restrictions and allergens from the profile object
        restrictionSet.clear();
        restrictionSet.addAll(p.getRestrictions());
        allergenSet.clear();
        allergenSet.addAll(p.getAllergens());
    }

    public Optional<UserProfile> getProfile() {
        try (Statement s = conn.createStatement();
             ResultSet rs = s.executeQuery("SELECT * FROM user_profile WHERE id = 1")) {
            if (!rs.next()) return Optional.empty();
            UserProfile p = new UserProfile();
            p.setAge(rs.getInt("age"));
            String sex = rs.getString("sex");
            if (sex != null) p.setSex(Sex.from(sex));
            p.setHeightCm(rs.getInt("height_cm"));
            p.setWeightKg(rs.getDouble("weight_kg"));
            String goal = rs.getString("goal");
            if (goal != null) p.setGoal(Goal.from(goal));
            p.setDailyCalories(rs.getInt("daily_calories"));
            p.setBudgetWeekly(rs.getDouble("budget_weekly"));
            // Load live sets into the profile
            p.setRestrictions(new HashSet<>(restrictionSet));
            p.setAllergens(new HashSet<>(allergenSet));
            return Optional.of(p);
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    // ── Collection views ──────────────────────────────────────────

    /** Live Set<Restriction> view — mutations persist immediately to the DB. */
    public Set<Restriction> restrictions() { return restrictionSet; }

    /** Live Set<Allergen> view — mutations persist immediately to the DB. */
    public Set<Allergen> allergens()       { return allergenSet; }

    // ── Inner Set: Restrictions ───────────────────────────────────

    private class RestrictionSet extends AbstractSet<Restriction> {

        @Override
        public int size() {
            try (Statement s = conn.createStatement();
                 ResultSet rs = s.executeQuery("SELECT COUNT(*) FROM user_restrictions")) {
                return rs.next() ? rs.getInt(1) : 0;
            } catch (SQLException e) { throw new RuntimeException(e); }
        }

        @Override
        public Iterator<Restriction> iterator() {
            try {
                List<Restriction> snap = new ArrayList<>();
                try (Statement s = conn.createStatement();
                     ResultSet rs = s.executeQuery("SELECT restriction FROM user_restrictions")) {
                    while (rs.next()) snap.add(Restriction.from(rs.getString(1)));
                }
                return snap.iterator();
            } catch (SQLException e) { throw new RuntimeException(e); }
        }

        @Override
        public boolean add(Restriction value) {
            if (contains(value)) return false;
            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT OR IGNORE INTO user_restrictions (restriction) VALUES (?)")) {
                ps.setString(1, value.name());
                return ps.executeUpdate() > 0;
            } catch (SQLException e) { throw new RuntimeException(e); }
        }

        @Override
        public boolean remove(Object o) {
            if (!(o instanceof Restriction r)) return false;
            try (PreparedStatement ps = conn.prepareStatement(
                    "DELETE FROM user_restrictions WHERE restriction = ?")) {
                ps.setString(1, r.name());
                return ps.executeUpdate() > 0;
            } catch (SQLException e) { throw new RuntimeException(e); }
        }

        @Override
        public boolean contains(Object o) {
            if (!(o instanceof Restriction r)) return false;
            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT 1 FROM user_restrictions WHERE restriction = ?")) {
                ps.setString(1, r.name());
                try (ResultSet rs = ps.executeQuery()) { return rs.next(); }
            } catch (SQLException e) { throw new RuntimeException(e); }
        }

        @Override
        public void clear() {
            try (Statement s = conn.createStatement()) {
                s.executeUpdate("DELETE FROM user_restrictions");
            } catch (SQLException e) { throw new RuntimeException(e); }
        }
    }

    // ── Inner Set: Allergens ──────────────────────────────────────

    private class AllergenSet extends AbstractSet<Allergen> {

        @Override
        public int size() {
            try (Statement s = conn.createStatement();
                 ResultSet rs = s.executeQuery("SELECT COUNT(*) FROM user_allergens")) {
                return rs.next() ? rs.getInt(1) : 0;
            } catch (SQLException e) { throw new RuntimeException(e); }
        }

        @Override
        public Iterator<Allergen> iterator() {
            try {
                List<Allergen> snap = new ArrayList<>();
                try (Statement s = conn.createStatement();
                     ResultSet rs = s.executeQuery("SELECT allergen FROM user_allergens")) {
                    while (rs.next()) snap.add(Allergen.from(rs.getString(1)));
                }
                return snap.iterator();
            } catch (SQLException e) { throw new RuntimeException(e); }
        }

        @Override
        public boolean add(Allergen value) {
            if (contains(value)) return false;
            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT OR IGNORE INTO user_allergens (allergen) VALUES (?)")) {
                ps.setString(1, value.name());
                return ps.executeUpdate() > 0;
            } catch (SQLException e) { throw new RuntimeException(e); }
        }

        @Override
        public boolean remove(Object o) {
            if (!(o instanceof Allergen a)) return false;
            try (PreparedStatement ps = conn.prepareStatement(
                    "DELETE FROM user_allergens WHERE allergen = ?")) {
                ps.setString(1, a.name());
                return ps.executeUpdate() > 0;
            } catch (SQLException e) { throw new RuntimeException(e); }
        }

        @Override
        public boolean contains(Object o) {
            if (!(o instanceof Allergen a)) return false;
            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT 1 FROM user_allergens WHERE allergen = ?")) {
                ps.setString(1, a.name());
                try (ResultSet rs = ps.executeQuery()) { return rs.next(); }
            } catch (SQLException e) { throw new RuntimeException(e); }
        }

        @Override
        public void clear() {
            try (Statement s = conn.createStatement()) {
                s.executeUpdate("DELETE FROM user_allergens");
            } catch (SQLException e) { throw new RuntimeException(e); }
        }
    }
}
