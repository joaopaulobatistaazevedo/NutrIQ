import { getAuthSession } from '../utils/authSession';
import { createJsonClient } from './httpClient';

const API_BASE_URL = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:7071';

const client = createJsonClient(API_BASE_URL, 15000);

const DAY_TO_OFFSET = {
  MONDAY: 0,
  TUESDAY: 1,
  WEDNESDAY: 2,
  THURSDAY: 3,
  FRIDAY: 4,
  SATURDAY: 5,
  SUNDAY: 6,
};

const OFFSET_TO_LABEL = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

const MEAL_TYPE_TO_SLOT = {
  BREAKFAST: 'Refeição',
  LUNCH: 'Refeição',
  DINNER: 'Refeição',
  MEAL: 'Refeição',
  SNACK: 'Snack',
};

const SLOT_ORDER = {
  Refeição: 0,
  Snack: 1,
};

function normalizeError(error) {
  const payload = error?.response?.data;

  if (typeof payload?.error === 'string' && payload.error.trim()) {
    return payload.error.trim();
  }

  if (typeof payload?.message === 'string' && payload.message.trim()) {
    return payload.message.trim();
  }

  if (typeof error?.message === 'string' && error.message.trim()) {
    return error.message.trim();
  }

  return 'Não foi possível carregar o plano alimentar.';
}

function authHeadersOrNull() {
  const token = String(getAuthSession()?.token || '').trim();
  if (!token) {
    return null;
  }
  return {
    Authorization: `Bearer ${token}`,
  };
}

function addDays(baseDate, days) {
  const next = new Date(baseDate);
  next.setDate(baseDate.getDate() + days);
  return next;
}

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeWeekStart(rawWeekStart) {
  if (typeof rawWeekStart === 'string' && rawWeekStart.trim()) {
    return rawWeekStart.trim();
  }

  if (Array.isArray(rawWeekStart) && rawWeekStart.length >= 3) {
    const year = Number(rawWeekStart[0]);
    const month = Number(rawWeekStart[1]);
    const day = Number(rawWeekStart[2]);
    if (Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(day)) {
      return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  return '';
}

function toUiPlan(plan) {
  const weekStartRaw = normalizeWeekStart(plan?.weekStart);
  if (!weekStartRaw) {
    return null;
  }

  const weekStartDate = new Date(`${weekStartRaw}T00:00:00`);
  if (Number.isNaN(weekStartDate.getTime())) {
    return null;
  }

  const grouped = new Map();
  const meals = Array.isArray(plan?.meals) ? plan.meals : [];

  meals.forEach((meal) => {
    const offset = DAY_TO_OFFSET[String(meal?.dayOfWeek || '').toUpperCase()];
    const slot = MEAL_TYPE_TO_SLOT[String(meal?.mealType || '').toUpperCase()];

    if (!Number.isInteger(offset) || !slot) {
      return;
    }

    const date = addDays(weekStartDate, offset);
    const dateIso = toIsoDate(date);

    if (!grouped.has(dateIso)) {
      grouped.set(dateIso, []);
    }

    grouped.get(dateIso).push({
      slot,
      title: String(meal?.recipeName || 'Refeição').trim() || 'Refeição',
      source: 'backend',
      recipe_id: meal?.recipeId,
      meal_id: meal?.id,
      completed: Boolean(meal?.completed),
      completed_at: meal?.completedAt || null,
    });
  });

  const days = Array.from({ length: 7 }).map((_, offset) => {
    const date = addDays(weekStartDate, offset);
    const dateIso = toIsoDate(date);
    const dayMeals = grouped.get(dateIso) || [];
    dayMeals.sort((a, b) => (SLOT_ORDER[a.slot] ?? 99) - (SLOT_ORDER[b.slot] ?? 99));

    return {
      date: dateIso,
      day_label: OFFSET_TO_LABEL[offset] || '',
      meals: dayMeals,
    };
  });

  const totalMeals = days.reduce((sum, day) => sum + (Array.isArray(day.meals) ? day.meals.length : 0), 0);
  if (totalMeals <= 0) {
    return null;
  }

  return {
    status: 'generated',
    source: 'backend_active_plan',
    week_start: weekStartRaw,
    total_cost: Number(plan?.totalCost) || 0,
    days,
  };
}

function mergePlans(plans) {
  if (!Array.isArray(plans) || plans.length <= 0) {
    return null;
  }

  const uiPlans = plans
    .map((plan) => toUiPlan(plan))
    .filter(Boolean)
    .sort((a, b) => String(a.week_start || '').localeCompare(String(b.week_start || '')));

  if (!uiPlans.length) {
    return null;
  }

  const byDate = new Map();
  uiPlans.forEach((plan) => {
    const dayList = Array.isArray(plan.days) ? plan.days : [];
    dayList.forEach((day) => {
      const dateKey = String(day?.date || '').trim();
      if (!dateKey) {
        return;
      }

      const meals = Array.isArray(day?.meals) ? day.meals : [];
      const existing = byDate.get(dateKey);
      if (!existing || (Array.isArray(existing.meals) && existing.meals.length <= 0 && meals.length > 0)) {
        byDate.set(dateKey, {
          date: dateKey,
          day_label: day?.day_label || '',
          meals,
        });
      }
    });
  });

  const todayIso = toIsoDate(new Date());
  const orderedDates = Array.from(byDate.keys()).sort();
  const futureDates = orderedDates.filter((date) => date >= todayIso);
  const selectedDates = futureDates.length > 0 ? futureDates : orderedDates;

  const days = selectedDates
    .map((dateKey) => byDate.get(dateKey))
    .filter((day) => Array.isArray(day?.meals) && day.meals.length > 0);

  if (!days.length) {
    return null;
  }

  return {
    status: 'generated',
    source: 'backend_multi_plan',
    week_start: uiPlans[0].week_start,
    total_cost: uiPlans.reduce((sum, plan) => sum + (Number(plan.total_cost) || 0), 0),
    days,
  };
}

export async function fetchActiveMealPlan() {
  const headers = authHeadersOrNull();
  if (!headers) {
    return null;
  }

  try {
    const { data } = await client.get('/api/meal-plans', { headers });
    const merged = mergePlans(data);
    if (merged) {
      return merged;
    }
  } catch (error) {
    const status = error?.response?.status;
    if (status && status !== 404 && status !== 400) {
      throw new Error(normalizeError(error));
    }
  }

  try {
    const { data } = await client.get('/api/meal-plans/active', { headers });
    return toUiPlan(data);
  } catch (error) {
    const status = error?.response?.status;
    if (status === 404 || status === 400) {
      return null;
    }
    throw new Error(normalizeError(error));
  }
}
