package alnak.data.local;

import alnak.business_logic.entities.MealPlan;
import alnak.business_logic.entities.MealType;
import alnak.business_logic.entities.PlanStatus;

import java.sql.*;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

/**
 * List<MealPlan> backed by SQLite, ordered by created_at DESC.
 * Index 0 is always the most recent plan.
 * Loading a plan also loads its MealPlanMeals (with Recipe hydrated).
 */
public class MealPlanDAO extends AbstractList<MealPlan> {

    private final Connection conn;
    private final RecipeDAO recipeDAO;

    public MealPlanDAO() {
        this.conn      = LocalDatabase.getInstance().getConnection();
        this.recipeDAO = new RecipeDAO();
    }

    // ── AbstractList contract ─────────────────────────────────────

    @Override
    public int size() {
        try (Statement s = conn.createStatement();
             ResultSet rs = s.executeQuery("SELECT COUNT(*) FROM meal_plans")) {
            return rs.next() ? rs.getInt(1) : 0;
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    /** get(index) — 0-based, newest first. */
    @Override
    public MealPlan get(int index) {
        Objects.checkIndex(index, size());
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT * FROM meal_plans ORDER BY created_at DESC LIMIT 1 OFFSET ?")) {
            ps.setInt(1, index);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) throw new IndexOutOfBoundsException(index);
                MealPlan plan = mapPlan(rs);
                plan.setMeals(loadMeals(plan.getId()));
                return plan;
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    /** add(plan) → INSERT. */
    @Override
    public boolean add(MealPlan plan) {
        try (PreparedStatement ps = conn.prepareStatement(
                "INSERT INTO meal_plans (week_start, status) VALUES (?, ?)",
                Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, plan.getWeekStart() != null ? plan.getWeekStart().toString() : null);
            ps.setString(2, plan.getStatus() != null ? plan.getStatus().name() : PlanStatus.ACTIVE.name());
            ps.executeUpdate();
            try (ResultSet keys = ps.getGeneratedKeys()) {
                if (keys.next()) plan.setId(keys.getInt(1));
            }
            return true;
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    /** set(index, plan) → UPDATE the plan at that position. Returns the old value. */
    @Override
    public MealPlan set(int index, MealPlan plan) {
        MealPlan old = get(index);
        try (PreparedStatement ps = conn.prepareStatement(
                "UPDATE meal_plans SET week_start = ?, status = ? WHERE id = ?")) {
            ps.setString(1, plan.getWeekStart() != null ? plan.getWeekStart().toString() : null);
            ps.setString(2, plan.getStatus() != null ? plan.getStatus().name() : null);
            ps.setInt(3, old.getId());
            ps.executeUpdate();
            plan.setId(old.getId());
        } catch (SQLException e) { throw new RuntimeException(e); }
        return old;
    }

    /** remove(index) → DELETE (cascades to meal_plan_meals). Returns removed plan. */
    @Override
    public MealPlan remove(int index) {
        MealPlan old = get(index);
        try {
            conn.setAutoCommit(false);
            try (PreparedStatement ps = conn.prepareStatement(
                    "DELETE FROM meal_plans WHERE id = ?")) {
                // ON DELETE CASCADE handles meal_plan_meals
                ps.setInt(1, old.getId());
                ps.executeUpdate();
                conn.commit();
            } catch (SQLException e) { conn.rollback(); throw e; }
            finally { conn.setAutoCommit(true); }
        } catch (SQLException e) { throw new RuntimeException(e); }
        return old;
    }

    // ── Domain helpers ────────────────────────────────────────────

    /** The most recent active plan — equivalent to stream().filter(MealPlan::isActive).findFirst(). */
    public Optional<MealPlan> getActive() {
        try (Statement s = conn.createStatement();
             ResultSet rs = s.executeQuery(
                     "SELECT * FROM meal_plans WHERE status = 'ACTIVE' ORDER BY created_at DESC LIMIT 1")) {
            if (!rs.next()) return Optional.empty();
            MealPlan plan = mapPlan(rs);
            plan.setMeals(loadMeals(plan.getId()));
            return Optional.of(plan);
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    public void setStatus(int planId, PlanStatus status) {
        try (PreparedStatement ps = conn.prepareStatement(
                "UPDATE meal_plans SET status = ? WHERE id = ?")) {
            ps.setString(1, status.name());
            ps.setInt(2, planId);
            ps.executeUpdate();
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    // ── Meal rows within a plan ───────────────────────────────────

    public void addMeal(MealPlan.MealPlanMeal meal) {
        try (PreparedStatement ps = conn.prepareStatement("""
            INSERT INTO meal_plan_meals
              (meal_plan_id, recipe_id, day_of_week, meal_type, is_completed, photo_path, completed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, Statement.RETURN_GENERATED_KEYS)) {
            ps.setInt(1, meal.getMealPlanId());
            ps.setInt(2, meal.getRecipeId());
            ps.setInt(3, meal.getDayOfWeek().getValue());
            ps.setString(4, meal.getMealType().name());
            ps.setInt(5, meal.isCompleted() ? 1 : 0);
            ps.setString(6, meal.getPhotoPath());
            ps.setString(7, meal.getCompletedAt() != null ? meal.getCompletedAt().toString() : null);
            ps.executeUpdate();
            try (ResultSet keys = ps.getGeneratedKeys()) {
                if (keys.next()) meal.setId(keys.getInt(1));
            }
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    public void swapRecipe(int mealId, int newRecipeId) {
        try (PreparedStatement ps = conn.prepareStatement(
                "UPDATE meal_plan_meals SET recipe_id = ? WHERE id = ?")) {
            ps.setInt(1, newRecipeId);
            ps.setInt(2, mealId);
            ps.executeUpdate();
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    public void completeMeal(int mealId, String photoPath) {
        try (PreparedStatement ps = conn.prepareStatement("""
            UPDATE meal_plan_meals
            SET is_completed = 1, photo_path = ?, completed_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """)) {
            ps.setString(1, photoPath);
            ps.setInt(2, mealId);
            ps.executeUpdate();
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    public int completedMealCount() {
        try (Statement s = conn.createStatement();
             ResultSet rs = s.executeQuery(
                     "SELECT COUNT(*) FROM meal_plan_meals WHERE is_completed = 1")) {
            return rs.next() ? rs.getInt(1) : 0;
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    public List<String> photos() {
        try {
            List<String> result = new ArrayList<>();
            try (Statement s = conn.createStatement();
                 ResultSet rs = s.executeQuery(
                         "SELECT photo_path FROM meal_plan_meals WHERE photo_path IS NOT NULL ORDER BY completed_at DESC")) {
                while (rs.next()) result.add(rs.getString("photo_path"));
            }
            return result;
        } catch (SQLException e) { throw new RuntimeException(e); }
    }

    // ── Mappers ───────────────────────────────────────────────────

    private MealPlan mapPlan(ResultSet rs) throws SQLException {
        MealPlan p = new MealPlan();
        p.setId(rs.getInt("id"));
        String ws = rs.getString("week_start");
        if (ws != null) p.setWeekStart(LocalDate.parse(ws));
        String ca = rs.getString("created_at");
        if (ca != null) p.setCreatedAt(LocalDateTime.parse(ca.replace(" ", "T")));
        String st = rs.getString("status");
        if (st != null) p.setStatus(PlanStatus.from(st));
        return p;
    }

    private List<MealPlan.MealPlanMeal> loadMeals(int planId) throws SQLException {
        List<MealPlan.MealPlanMeal> result = new ArrayList<>();
        try (PreparedStatement ps = conn.prepareStatement("""
            SELECT * FROM meal_plan_meals
            WHERE meal_plan_id = ?
            ORDER BY day_of_week, meal_type
        """)) {
            ps.setInt(1, planId);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    MealPlan.MealPlanMeal m = new MealPlan.MealPlanMeal();
                    m.setId(rs.getInt("id"));
                    m.setMealPlanId(planId);
                    m.setRecipeId(rs.getInt("recipe_id"));
                    m.setDayOfWeek(DayOfWeek.of(rs.getInt("day_of_week")));
                    m.setMealType(MealType.from(rs.getString("meal_type")));
                    m.setCompleted(rs.getInt("is_completed") == 1);
                    m.setPhotoPath(rs.getString("photo_path"));
                    String ca = rs.getString("completed_at");
                    if (ca != null) m.setCompletedAt(LocalDateTime.parse(ca.replace(" ", "T")));
                    // Hydrate recipe
                    m.setRecipe(recipeDAO.get(m.getRecipeId()));
                    result.add(m);
                }
            }
        }
        return result;
    }
}
