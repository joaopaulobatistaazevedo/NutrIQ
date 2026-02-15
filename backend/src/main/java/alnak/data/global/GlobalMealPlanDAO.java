package alnak.data.global;

import alnak.business_logic.entities.MealPlan;
import alnak.business_logic.entities.MealType;
import alnak.business_logic.entities.PlanStatus;

import java.sql.Connection;
import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.DayOfWeek;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

public class GlobalMealPlanDAO {

    private final Connection conn;

    public GlobalMealPlanDAO() {
        this.conn = GlobalDatabase.getInstance().getConnection();
    }

    public void addPlan(long userId, MealPlan plan) {
        try (PreparedStatement ps = conn.prepareStatement(
                "INSERT INTO meal_plans (user_id, week_start, status) VALUES (?, ?, ?)",
                Statement.RETURN_GENERATED_KEYS)) {
            ps.setLong(1, userId);
            ps.setString(2, plan.getWeekStart() != null ? plan.getWeekStart().toString() : null);
            ps.setString(3, plan.getStatus() != null ? plan.getStatus().name() : PlanStatus.ACTIVE.name());
            ps.executeUpdate();
            try (ResultSet keys = ps.getGeneratedKeys()) {
                if (keys.next()) {
                    plan.setId(keys.getInt(1));
                }
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to add meal plan", e);
        }
    }

    public List<MealPlan> listPlans(long userId) {
        try {
            List<MealPlan> plans = new ArrayList<>();
            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT * FROM meal_plans WHERE user_id = ? ORDER BY created_at DESC")) {
                ps.setLong(1, userId);
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        MealPlan plan = mapPlan(rs);
                        plan.setMeals(loadMeals(plan.getId()));
                        plans.add(plan);
                    }
                }
            }
            return plans;
        } catch (SQLException e) {
            throw new RuntimeException("Failed to list meal plans", e);
        }
    }

    public Optional<MealPlan> getPlanById(long userId, int planId) {
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT * FROM meal_plans WHERE id = ? AND user_id = ?")) {
            ps.setInt(1, planId);
            ps.setLong(2, userId);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return Optional.empty();
                }
                MealPlan plan = mapPlan(rs);
                plan.setMeals(loadMeals(plan.getId()));
                return Optional.of(plan);
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to get meal plan", e);
        }
    }

    public Optional<MealPlan> getActive(long userId) {
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT * FROM meal_plans WHERE user_id = ? AND status = 'ACTIVE' ORDER BY created_at DESC LIMIT 1")) {
            ps.setLong(1, userId);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return Optional.empty();
                }
                MealPlan plan = mapPlan(rs);
                plan.setMeals(loadMeals(plan.getId()));
                return Optional.of(plan);
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to get active meal plan", e);
        }
    }

    public void setStatus(long userId, int planId, PlanStatus status) {
        try (PreparedStatement ps = conn.prepareStatement(
                "UPDATE meal_plans SET status = ? WHERE id = ? AND user_id = ?")) {
            ps.setString(1, status.name());
            ps.setInt(2, planId);
            ps.setLong(3, userId);
            int updated = ps.executeUpdate();
            if (updated == 0) {
                throw new IllegalArgumentException("Plano de refeições não encontrado: " + planId);
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to update plan status", e);
        }
    }

    public void deletePlan(long userId, int planId) {
        try (PreparedStatement ps = conn.prepareStatement(
                "DELETE FROM meal_plans WHERE id = ? AND user_id = ?")) {
            ps.setInt(1, planId);
            ps.setLong(2, userId);
            int deleted = ps.executeUpdate();
            if (deleted == 0) {
                throw new IllegalArgumentException("Plano de refeições não encontrado: " + planId);
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to delete meal plan", e);
        }
    }

    public void addMeal(long userId, MealPlan.MealPlanMeal meal) {
        Objects.requireNonNull(meal, "meal");
        ensurePlanOwnership(userId, meal.getMealPlanId());

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
                if (keys.next()) {
                    meal.setId(keys.getInt(1));
                }
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to add meal to plan", e);
        }
    }

    public void removeMeal(long userId, int planId, int mealId) {
        ensurePlanOwnership(userId, planId);
        try (PreparedStatement ps = conn.prepareStatement(
                "DELETE FROM meal_plan_meals WHERE id = ? AND meal_plan_id = ?")) {
            ps.setInt(1, mealId);
            ps.setInt(2, planId);
            int deleted = ps.executeUpdate();
            if (deleted == 0) {
                throw new IllegalArgumentException("Refeição não encontrada: " + mealId);
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to remove meal", e);
        }
    }

    public void swapRecipe(long userId, int planId, int mealId, int newRecipeId) {
        ensurePlanOwnership(userId, planId);
        try (PreparedStatement ps = conn.prepareStatement(
                "UPDATE meal_plan_meals SET recipe_id = ? WHERE id = ? AND meal_plan_id = ?")) {
            ps.setInt(1, newRecipeId);
            ps.setInt(2, mealId);
            ps.setInt(3, planId);
            int updated = ps.executeUpdate();
            if (updated == 0) {
                throw new IllegalArgumentException("Refeição não encontrada: " + mealId);
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to swap meal recipe", e);
        }
    }

    public void completeMeal(long userId, int planId, int mealId, String photoPath) {
        ensurePlanOwnership(userId, planId);
        try (PreparedStatement ps = conn.prepareStatement("""
            UPDATE meal_plan_meals
            SET is_completed = 1, photo_path = ?, completed_at = CURRENT_TIMESTAMP
            WHERE id = ? AND meal_plan_id = ?
        """)) {
            ps.setString(1, photoPath);
            ps.setInt(2, mealId);
            ps.setInt(3, planId);
            int updated = ps.executeUpdate();
            if (updated == 0) {
                throw new IllegalArgumentException("Refeição não encontrada: " + mealId);
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to complete meal", e);
        }
    }

    private void ensurePlanOwnership(long userId, int planId) {
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT 1 FROM meal_plans WHERE id = ? AND user_id = ?")) {
            ps.setInt(1, planId);
            ps.setLong(2, userId);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    throw new IllegalArgumentException("Plano de refeições não encontrado: " + planId);
                }
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to verify plan ownership", e);
        }
    }

    private MealPlan mapPlan(ResultSet rs) throws SQLException {
        MealPlan p = new MealPlan();
        p.setId(rs.getInt("id"));

        Date weekStart = rs.getDate("week_start");
        if (weekStart != null) {
            p.setWeekStart(weekStart.toLocalDate());
        }

        Timestamp createdAt = rs.getTimestamp("created_at");
        if (createdAt != null) {
            p.setCreatedAt(createdAt.toLocalDateTime());
        }

        String st = rs.getString("status");
        if (st != null) {
            p.setStatus(PlanStatus.from(st));
        }
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

                    Timestamp completedAt = rs.getTimestamp("completed_at");
                    if (completedAt != null) {
                        m.setCompletedAt(completedAt.toLocalDateTime());
                    }
                    result.add(m);
                }
            }
        }
        return result;
    }
}
