package alnak.data.global;

import alnak.business_logic.entities.Allergen;
import alnak.business_logic.entities.Goal;
import alnak.business_logic.entities.Restriction;
import alnak.business_logic.entities.Sex;
import alnak.business_logic.entities.User;
import alnak.business_logic.entities.UserProfile;

import java.sql.Connection;
import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Types;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

public class UserDAO {

    private final Connection conn;

    public UserDAO() {
        this.conn = GlobalDatabase.getInstance().getConnection();
    }

    private void upsertProfile(Long userId, UserProfile p) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement("""
            INSERT INTO user_profiles
              (user_id, age, sex, height_cm, weight_kg, goal, daily_calories, budget_weekly, streak_count, last_meal_photo_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                age                  = VALUES(age),
                sex                  = VALUES(sex),
                height_cm            = VALUES(height_cm),
                weight_kg            = VALUES(weight_kg),
                goal                 = VALUES(goal),
                daily_calories       = VALUES(daily_calories),
                budget_weekly        = VALUES(budget_weekly),
                streak_count         = VALUES(streak_count),
                last_meal_photo_date = VALUES(last_meal_photo_date)
        """)) {
            ps.setLong(1, userId);
            ps.setInt(2, p.getAge());
            setNullableString(ps, 3, p.getSex() != null ? p.getSex().name() : null);
            ps.setInt(4, p.getHeightCm());
            ps.setDouble(5, p.getWeightKg());
            setNullableString(ps, 6, p.getGoal() != null ? p.getGoal().name() : null);
            ps.setInt(7, p.getDailyCalories());
            ps.setDouble(8, p.getBudgetWeekly());
            ps.setInt(9, Math.max(0, p.getStreakCount()));
            setNullableDate(ps, 10, p.getLastMealPhotoDate());
            ps.executeUpdate();
        }
    }

    public User createUser(String name, String email, String passwordHash) {
        try (PreparedStatement ps = conn.prepareStatement(
                "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
                Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, name);
            ps.setString(2, email);
            ps.setString(3, passwordHash);
            ps.executeUpdate();

            User user = new User();
            try (ResultSet keys = ps.getGeneratedKeys()) {
                if (keys.next()) {
                    user.setId(keys.getLong(1));
                }
            }
            user.setName(name);
            user.setEmail(email);
            user.setPasswordHash(passwordHash);
            return user;
        } catch (SQLException e) {
            if (isUniqueConstraintViolation(e)) {
                throw new IllegalArgumentException("Email já registado");
            }
            throw new RuntimeException(e);
        }
    }

    public Optional<User> findByEmail(String email) {
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT id, name, email, password_hash FROM users WHERE email = ?")) {
            ps.setString(1, email);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) return Optional.empty();
                User user = mapCoreUser(rs);
                attachProfile(user);
                return Optional.of(user);
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    public Optional<User> findById(Long userId) {
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT id, name, email, password_hash FROM users WHERE id = ?")) {
            ps.setLong(1, userId);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) return Optional.empty();
                User user = mapCoreUser(rs);
                attachProfile(user);
                return Optional.of(user);
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    public List<User> listUsers() {
        try {
            List<User> users = new ArrayList<>();
            try (Statement s = conn.createStatement();
                 ResultSet rs = s.executeQuery("SELECT id, name, email, password_hash FROM users ORDER BY id")) {
                while (rs.next()) {
                    User user = mapCoreUser(rs);
                    attachProfile(user);
                    users.add(user);
                }
            }
            return users;
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    public void saveProfile(Long userId, UserProfile profile) {
        try {
            conn.setAutoCommit(false);
            try {
                upsertProfile(userId, profile);
                replaceRestrictions(userId, profile.getRestrictions());
                replaceAllergens(userId, profile.getAllergens());
                conn.commit();
            } catch (SQLException e) {
                conn.rollback();
                throw e;
            } finally {
                conn.setAutoCommit(true);
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    public int recordMealPhotoForStreak(Long userId) {
        try {
            conn.setAutoCommit(false);
            try {
                LocalDate today = LocalDate.now();
                int currentStreak = 0;
                LocalDate lastPhotoDate = null;

                try (PreparedStatement ps = conn.prepareStatement(
                        "SELECT streak_count, last_meal_photo_date FROM user_profiles WHERE user_id = ? FOR UPDATE")) {
                    ps.setLong(1, userId);
                    try (ResultSet rs = ps.executeQuery()) {
                        if (rs.next()) {
                            currentStreak = rs.getInt("streak_count");
                            Date last = rs.getDate("last_meal_photo_date");
                            if (last != null) {
                                lastPhotoDate = last.toLocalDate();
                            }
                        }
                    }
                }

                int updatedStreak = calculateUpdatedStreak(currentStreak, lastPhotoDate, today);

                try (PreparedStatement ps = conn.prepareStatement("""
                        INSERT INTO user_profiles (user_id, streak_count, last_meal_photo_date)
                        VALUES (?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                            streak_count = VALUES(streak_count),
                            last_meal_photo_date = VALUES(last_meal_photo_date)
                        """)) {
                    ps.setLong(1, userId);
                    ps.setInt(2, updatedStreak);
                    ps.setDate(3, Date.valueOf(today));
                    ps.executeUpdate();
                }

                conn.commit();
                return updatedStreak;
            } catch (SQLException e) {
                conn.rollback();
                throw e;
            } finally {
                conn.setAutoCommit(true);
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    public Optional<UserProfile> getProfile(Long userId) {
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT age, sex, height_cm, weight_kg, goal, daily_calories, budget_weekly, streak_count, last_meal_photo_date FROM user_profiles WHERE user_id = ?")) {
            ps.setLong(1, userId);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) return Optional.empty();

                UserProfile p = new UserProfile();
                if (rs.getObject("age") != null) p.setAge(rs.getInt("age"));
                String sex = rs.getString("sex");
                if (sex != null) p.setSex(Sex.from(sex));
                if (rs.getObject("height_cm") != null) p.setHeightCm(rs.getInt("height_cm"));
                if (rs.getObject("weight_kg") != null) p.setWeightKg(rs.getDouble("weight_kg"));
                String goal = rs.getString("goal");
                if (goal != null) p.setGoal(Goal.from(goal));
                if (rs.getObject("daily_calories") != null) p.setDailyCalories(rs.getInt("daily_calories"));
                if (rs.getObject("budget_weekly") != null) p.setBudgetWeekly(rs.getDouble("budget_weekly"));
                if (rs.getObject("streak_count") != null) p.setStreakCount(rs.getInt("streak_count"));
                Date lastPhotoDate = rs.getDate("last_meal_photo_date");
                if (lastPhotoDate != null) p.setLastMealPhotoDate(lastPhotoDate.toLocalDate());
                p.setRestrictions(loadRestrictions(userId));
                p.setAllergens(loadAllergens(userId));
                return Optional.of(p);
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    private User mapCoreUser(ResultSet rs) throws SQLException {
        User user = new User();
        user.setId(rs.getLong("id"));
        user.setName(rs.getString("name"));
        user.setEmail(rs.getString("email"));
        user.setPasswordHash(rs.getString("password_hash"));
        return user;
    }

    private void attachProfile(User user) {
        getProfile(user.getId()).ifPresent(user::setProfile);
    }

    private void replaceRestrictions(Long userId, Set<Restriction> restrictions) throws SQLException {
        try (PreparedStatement delete = conn.prepareStatement(
                "DELETE FROM user_profile_restrictions WHERE user_id = ?")) {
            delete.setLong(1, userId);
            delete.executeUpdate();
        }
        if (restrictions == null || restrictions.isEmpty()) return;
        try (PreparedStatement insert = conn.prepareStatement(
                "INSERT INTO user_profile_restrictions (user_id, restriction) VALUES (?, ?)")) {
            for (Restriction restriction : restrictions) {
                insert.setLong(1, userId);
                insert.setString(2, restriction.name());
                insert.addBatch();
            }
            insert.executeBatch();
        }
    }

    private void replaceAllergens(Long userId, Set<Allergen> allergens) throws SQLException {
        try (PreparedStatement delete = conn.prepareStatement(
                "DELETE FROM user_profile_allergens WHERE user_id = ?")) {
            delete.setLong(1, userId);
            delete.executeUpdate();
        }
        if (allergens == null || allergens.isEmpty()) return;
        try (PreparedStatement insert = conn.prepareStatement(
                "INSERT INTO user_profile_allergens (user_id, allergen) VALUES (?, ?)")) {
            for (Allergen allergen : allergens) {
                insert.setLong(1, userId);
                insert.setString(2, allergen.name());
                insert.addBatch();
            }
            insert.executeBatch();
        }
    }

    private Set<Restriction> loadRestrictions(Long userId) throws SQLException {
        Set<Restriction> restrictions = EnumSet.noneOf(Restriction.class);
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT restriction FROM user_profile_restrictions WHERE user_id = ?")) {
            ps.setLong(1, userId);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    restrictions.add(Restriction.from(rs.getString("restriction")));
                }
            }
        }
        return restrictions;
    }

    private Set<Allergen> loadAllergens(Long userId) throws SQLException {
        Set<Allergen> allergens = EnumSet.noneOf(Allergen.class);
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT allergen FROM user_profile_allergens WHERE user_id = ?")) {
            ps.setLong(1, userId);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    allergens.add(Allergen.from(rs.getString("allergen")));
                }
            }
        }
        return allergens;
    }

    private int calculateUpdatedStreak(int currentStreak, LocalDate lastPhotoDate, LocalDate today) {
        if (lastPhotoDate == null) {
            return Math.max(1, currentStreak);
        }

        if (lastPhotoDate.isEqual(today)) {
            return Math.max(currentStreak, 1);
        }

        if (lastPhotoDate.isEqual(today.minusDays(1))) {
            return Math.max(currentStreak, 0) + 1;
        }

        return 1;
    }

    private void setNullableString(PreparedStatement ps, int index, String value) throws SQLException {
        if (value == null) {
            ps.setNull(index, Types.VARCHAR);
            return;
        }
        ps.setString(index, value);
    }

    private void setNullableDate(PreparedStatement ps, int index, LocalDate value) throws SQLException {
        if (value == null) {
            ps.setNull(index, Types.DATE);
            return;
        }
        ps.setDate(index, Date.valueOf(value));
    }

    private boolean isUniqueConstraintViolation(SQLException e) {
        return e.getErrorCode() == 1062 ||
                (e.getMessage() != null && e.getMessage().toLowerCase().contains("duplicate"));
    }
}
