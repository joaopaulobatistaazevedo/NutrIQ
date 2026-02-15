import Layout from '../components/Layout';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  Flame,
  Wallet,
  CheckCircle2,
  ArrowRight,
  Clock3,
  Sun,
  ChevronRight,
  Target,
} from 'lucide-react';
import { fetchMyProfile } from '../services/userService';
import { listLatestPrices } from '../services/priceService';
import { fetchActiveMealPlan } from '../services/mealPlanService';
import { fetchRecipeById } from '../services/recipeService';
import { PROFILE_KEY, WEEKLY_PLAN_KEY } from '../constants/storageKeys';
import { getAuthSession } from '../utils/authSession';
import { resolveAccountId, scopedKey } from '../utils/accountScope';
import '../styles/dashboard.css';

const fade = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
  viewport: { once: true, amount: 0.1 },
};

const WEEK_DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const SLOT_ORDER = {
  Refeição: 0,
  Snack: 1,
};

const SLOT_META = {
  Refeição: {
    icon: null,
    fallbackMinutes: 25,
    fallbackImage: 'https://picsum.photos/seed/meal-nutriq/1200/800',
  },
  Snack: {
    icon: Sun,
    fallbackMinutes: 10,
    fallbackImage: 'https://picsum.photos/seed/snack-nutriq/1200/800',
  },
};

function toName(value) {
  const clean = String(value || '').trim();
  if (!clean) {
    return 'Utilizador';
  }
  return clean.split(/\s+/)[0];
}

function toNumberOr(defaultValue, value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function formatEuro(value) {
  return Number(value || 0).toLocaleString('pt-PT', {
    style: 'currency',
    currency: 'EUR',
  });
}

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildWeeklyCalories(goal) {
  return WEEK_DAYS.map((day) => ({ day, real: 0, meta: goal }));
}

function formatMinutes(totalMinutes) {
  const minutes = Math.max(0, Math.round(Number(totalMinutes) || 0));
  return `${minutes} min`;
}

function extractSourceUrl(recipe) {
  const candidates = [recipe?.sourceUrl, recipe?.source_url, recipe?.url];

  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return value;
    }
  }

  const description = String(recipe?.description || '');
  const match = description.match(/https?:\/\/[^\s|)]+/i);
  if (!match?.[0]) {
    return '';
  }

  return match[0].replace(/[.,;!?]+$/, '');
}

function parseStorage(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function normalizeIngredient(value) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }

  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDecimal(value) {
  const token = String(value || '').trim().replace(',', '.');
  const parsed = Number(token);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function parseFractionOrDecimal(token) {
  const value = String(token || '').trim();
  if (!value) {
    return NaN;
  }
  const fraction = value.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fraction) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    if (denominator > 0) {
      return numerator / denominator;
    }
  }
  return parseDecimal(value);
}

const UNIT_TO_BASE = {
  g: { baseUnit: 'g', factor: 1 },
  gr: { baseUnit: 'g', factor: 1 },
  grama: { baseUnit: 'g', factor: 1 },
  gramas: { baseUnit: 'g', factor: 1 },
  kg: { baseUnit: 'g', factor: 1000 },
  ml: { baseUnit: 'ml', factor: 1 },
  l: { baseUnit: 'ml', factor: 1000 },
  lt: { baseUnit: 'ml', factor: 1000 },
  cl: { baseUnit: 'ml', factor: 10 },
  dl: { baseUnit: 'ml', factor: 100 },
  unit: { baseUnit: 'un', factor: 1 },
  un: { baseUnit: 'un', factor: 1 },
  unid: { baseUnit: 'un', factor: 1 },
  unidade: { baseUnit: 'un', factor: 1 },
  unidades: { baseUnit: 'un', factor: 1 },
  ovo: { baseUnit: 'un', factor: 1 },
  ovos: { baseUnit: 'un', factor: 1 },
  dente: { baseUnit: 'un', factor: 1 },
  dentes: { baseUnit: 'un', factor: 1 },
};

function normalizeUnitToken(rawUnit) {
  return String(rawUnit || '')
    .trim()
    .toLowerCase()
    .replace(/[.\-_]/g, '')
    .replace(/\s+/g, '');
}

function toBaseQuantity(quantity, rawUnit) {
  const numeric = Number(quantity);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  const mapping = UNIT_TO_BASE[normalizeUnitToken(rawUnit)];
  if (!mapping) {
    return null;
  }

  return {
    baseUnit: mapping.baseUnit,
    quantity: numeric * mapping.factor,
  };
}

function parseSelectionNote(note) {
  const raw = String(note || '').trim();
  if (!raw) {
    return null;
  }

  const match = raw.match(
    /selecionado por quantidade:\s*([0-9.,]+)\s*x\s*de\s*([0-9.,]+)\s*([a-zA-Z]+)\s*para\s*([0-9.,]+)\s*([a-zA-Z]+)/i,
  );
  if (!match) {
    return null;
  }

  const packs = parseDecimal(match[1]);
  const packQty = parseDecimal(match[2]);
  const requiredQty = parseDecimal(match[4]);
  if (!Number.isFinite(packs) || !Number.isFinite(packQty) || !Number.isFinite(requiredQty)) {
    return null;
  }

  const convertedPack = toBaseQuantity(packQty, match[3]);
  const convertedRequired = toBaseQuantity(requiredQty, match[5]);
  if (!convertedPack || !convertedRequired || convertedPack.baseUnit !== convertedRequired.baseUnit) {
    return null;
  }

  return {
    baseUnit: convertedPack.baseUnit,
    purchasedBaseQty: packs * convertedPack.quantity,
    requiredBaseQty: convertedRequired.quantity,
  };
}

function parseUnitPriceHint(productName) {
  const text = String(productName || '');
  if (!text) {
    return null;
  }

  const match = text.match(
    /(\d+(?:[.,]\d+)?)\s*€\s*\/\s*(kg|g|gr|grama|gramas|l|lt|ml|cl|dl|un|unid|unidade|unidades)\b/i,
  );
  if (!match) {
    return null;
  }

  const unitPrice = parseDecimal(match[1]);
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    return null;
  }

  const converted = toBaseQuantity(1, match[2]);
  if (!converted) {
    return null;
  }

  return {
    baseUnit: converted.baseUnit,
    rawUnitPrice: unitPrice,
    eurPerBaseUnit: unitPrice / converted.quantity,
  };
}

function parsePackQuantity(productName) {
  const text = String(productName || '');
  if (!text) {
    return null;
  }

  const multi = text.match(
    /(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kg|g|gr|grama|gramas|l|lt|ml|cl|dl|un|unid|unidade|unidades|ovo|ovos|dente|dentes)\b/i,
  );
  if (multi) {
    const packs = parseDecimal(multi[1]);
    const qty = parseDecimal(multi[2]);
    const converted = toBaseQuantity(qty, multi[3]);
    if (Number.isFinite(packs) && converted) {
      return {
        baseUnit: converted.baseUnit,
        quantity: packs * converted.quantity,
      };
    }
  }

  const single = text.match(
    /(\d+(?:[.,]\d+)?)\s*(kg|g|gr|grama|gramas|l|lt|ml|cl|dl|un|unid|unidade|unidades|ovo|ovos|dente|dentes)\b/i,
  );
  if (!single) {
    return null;
  }

  const qty = parseDecimal(single[1]);
  const converted = toBaseQuantity(qty, single[2]);
  if (!converted) {
    return null;
  }

  return {
    baseUnit: converted.baseUnit,
    quantity: converted.quantity,
  };
}

function derivePricingBasis(entry) {
  const price = Number(entry?.price);
  if (!Number.isFinite(price) || price <= 0) {
    return null;
  }

  const unitHint = parseUnitPriceHint(entry?.productName);
  if (unitHint && Math.abs(unitHint.rawUnitPrice - price) <= Math.max(0.05, unitHint.rawUnitPrice * 0.2)) {
    return {
      baseUnit: unitHint.baseUnit,
      eurPerBaseUnit: unitHint.eurPerBaseUnit,
    };
  }

  const noteInfo = parseSelectionNote(entry?.note);
  if (noteInfo && Number.isFinite(noteInfo.purchasedBaseQty) && noteInfo.purchasedBaseQty > 0) {
    return {
      baseUnit: noteInfo.baseUnit,
      eurPerBaseUnit: price / noteInfo.purchasedBaseQty,
    };
  }

  const packInfo = parsePackQuantity(entry?.productName);
  if (packInfo && Number.isFinite(packInfo.quantity) && packInfo.quantity > 0) {
    return {
      baseUnit: packInfo.baseUnit,
      eurPerBaseUnit: price / packInfo.quantity,
    };
  }

  return null;
}

function deriveCaloriesPerBase(entry, basis) {
  const calories = Number(entry?.calories);
  if (!Number.isFinite(calories) || calories <= 0 || !basis?.baseUnit) {
    return null;
  }

  if (basis.baseUnit === 'g' || basis.baseUnit === 'ml') {
    return calories / 100;
  }

  return null;
}

function buildPriceIndex(prices) {
  const index = new Map();

  prices.forEach((entry) => {
    const normalized = normalizeIngredient(entry?.ingredientNormalized || entry?.ingredientName);
    const basis = derivePricingBasis(entry);
    if (!normalized || !basis) {
      return;
    }

    const previous = index.get(normalized);
    if (!previous || basis.eurPerBaseUnit < previous.basis.eurPerBaseUnit) {
      index.set(normalized, {
        basis: {
          ...basis,
          caloriesPerBaseUnit: deriveCaloriesPerBase(entry, basis),
        },
      });
    }
  });

  return index;
}

function cleanIngredientName(rawValue) {
  const cleaned = String(rawValue || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\bq\.?b\.?\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[,;:\-]+/, '')
    .replace(/[,;:\-]+$/, '')
    .trim();
  return cleaned;
}

function parseIngredientToken(rawToken) {
  const token = cleanIngredientName(rawToken);
  if (!token) {
    return null;
  }

  const start = token.match(/^(\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!start) {
    return {
      name: token,
      quantity: null,
      unit: null,
    };
  }

  const quantity = parseFractionOrDecimal(start[1]);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return {
      name: token,
      quantity: null,
      unit: null,
    };
  }

  let remainder = String(start[2] || '').trim();
  let unit = null;

  const unitMatch = remainder.match(
    /^(kg|g|gr|grama|gramas|ml|l|lt|cl|dl|un|unid|unidade|unidades|ovo|ovos|dente|dentes)\b\s*/i,
  );
  if (unitMatch) {
    unit = unitMatch[1];
    remainder = remainder.slice(unitMatch[0].length).trim();
  }

  remainder = remainder.replace(/^(de|da|do)\s+/i, '').trim();
  const name = cleanIngredientName(remainder);
  if (!name) {
    return null;
  }

  return {
    name,
    quantity,
    unit,
  };
}

function extractIngredientsFromDescription(recipe) {
  const description = String(recipe?.description || '');
  const match = description.match(/\bingredientes?\s*:\s*(.+)$/i);
  if (!match?.[1]) {
    return [];
  }

  const chunk = match[1].split('|', 1)[0] || '';
  const tokens = chunk.split(/[;,]/);
  return tokens
    .map((token) => parseIngredientToken(token))
    .filter((entry) => entry && entry.name);
}

function extractIngredientLines(meal, recipe) {
  const mealIngredients = Array.isArray(meal?.ingredients) ? meal.ingredients : [];
  if (mealIngredients.length > 0) {
    return mealIngredients
      .map((entry) => {
        if (entry && typeof entry === 'object') {
          const name = cleanIngredientName(entry.name || entry.ingredientName);
          if (!name) {
            return null;
          }
          const quantity = Number(entry.quantity);
          return {
            name,
            quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : null,
            unit: entry.unit || null,
          };
        }
        return parseIngredientToken(entry);
      })
      .filter((entry) => entry && entry.name);
  }

  const recipeIngredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
  if (recipeIngredients.length > 0) {
    return recipeIngredients
      .map((entry) => {
        const name = cleanIngredientName(entry?.ingredientName || entry?.name);
        if (!name) {
          return null;
        }
        const quantity = Number(entry?.quantity);
        return {
          name,
          quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : null,
          unit: entry?.unit || null,
        };
      })
      .filter((entry) => entry && entry.name);
  }

  return extractIngredientsFromDescription(recipe);
}

function resolveFallbackCost(meal, recipe) {
  const candidates = [
    meal?.cost_per_serving_eur,
    meal?.costPerServing,
    meal?.cost,
    recipe?.costPerServing,
  ];

  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return 0;
}

function resolveFallbackCalories(meal, recipe) {
  const candidates = [
    meal?.calories_per_serving,
    meal?.caloriesPerServing,
    meal?.kcal,
    recipe?.nutritionalInfo?.calories,
  ];

  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return 0;
}

function estimateMealMetrics(meal, recipe, priceIndex) {
  const fallbackCost = resolveFallbackCost(meal, recipe);
  const fallbackCalories = resolveFallbackCalories(meal, recipe);
  const ingredientLines = extractIngredientLines(meal, recipe);
  const servings = Math.max(1, Number(recipe?.servings) || 1);

  let quantifiedLines = 0;
  let matchedCostLines = 0;
  let matchedCaloriesLines = 0;
  let proportionalCost = 0;
  let proportionalCalories = 0;

  ingredientLines.forEach((line) => {
    if (!Number.isFinite(Number(line?.quantity)) || Number(line.quantity) <= 0) {
      return;
    }

    const perServing = Number(line.quantity) / servings;
    const converted = toBaseQuantity(perServing, line.unit);
    if (!converted) {
      return;
    }

    quantifiedLines += 1;
    const priceData = priceIndex.get(normalizeIngredient(line.name));
    if (!priceData?.basis || priceData.basis.baseUnit !== converted.baseUnit) {
      return;
    }

    matchedCostLines += 1;
    proportionalCost += converted.quantity * priceData.basis.eurPerBaseUnit;

    if (Number.isFinite(priceData.basis.caloriesPerBaseUnit)) {
      matchedCaloriesLines += 1;
      proportionalCalories += converted.quantity * priceData.basis.caloriesPerBaseUnit;
    }
  });

  let cost = fallbackCost;
  if (matchedCostLines > 0) {
    const coverage = matchedCostLines / Math.max(1, quantifiedLines);
    if (fallbackCost <= 0 || coverage >= 0.6) {
      cost = proportionalCost;
    }
  }

  let kcal = fallbackCalories;
  if (matchedCaloriesLines > 0) {
    const coverage = matchedCaloriesLines / Math.max(1, quantifiedLines);
    if (fallbackCalories <= 0 || coverage >= 0.8) {
      kcal = proportionalCalories;
    }
  }

  return {
    cost: Math.max(0, Number.isFinite(cost) ? cost : 0),
    kcal: Math.max(0, Number.isFinite(kcal) ? kcal : 0),
  };
}

function mealLookupKeys(date, meal) {
  const safeDate = String(date || '').trim();
  const slot = normalizeIngredient(meal?.slot || meal?.period);
  const title = normalizeIngredient(meal?.title || meal?.name);
  const recipeId = Number(meal?.recipe_id ?? meal?.recipeId ?? 0);
  const keys = [];

  if (!safeDate || !slot) {
    return keys;
  }

  if (Number.isInteger(recipeId) && recipeId > 0) {
    keys.push(`${safeDate}|${slot}|id:${recipeId}`);
  }
  if (title) {
    keys.push(`${safeDate}|${slot}|title:${title}`);
  }
  return keys;
}

function buildStoredMealLookup(weeklyPlan) {
  const lookup = new Map();
  const days = Array.isArray(weeklyPlan?.days) ? weeklyPlan.days : [];

  days.forEach((day) => {
    const date = String(day?.date || '').trim();
    const meals = Array.isArray(day?.meals) ? day.meals : [];
    meals.forEach((meal) => {
      mealLookupKeys(date, meal).forEach((key) => {
        lookup.set(key, meal);
      });
    });
  });

  return lookup;
}

function mergeStoredMeal(meal, storedLookup) {
  const keys = mealLookupKeys(meal?.date, meal);
  for (const key of keys) {
    if (storedLookup.has(key)) {
      return { ...storedLookup.get(key), ...meal };
    }
  }
  return meal;
}

function loadStoredWeeklyPlan() {
  const profile = parseStorage(PROFILE_KEY, null);
  const accountId = resolveAccountId(profile);
  return parseStorage(scopedKey(WEEKLY_PLAN_KEY, accountId), null);
}

const CalorieRing = ({ consumed, goal }) => {
  const safeGoal = Math.max(1, goal);
  const pct = Math.min((consumed / safeGoal) * 100, 100);
  const radius = 70;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (pct / 100) * circ;

  return (
    <div className="cal-ring">
      <svg viewBox="0 0 160 160" className="cal-ring-svg">
        <circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="10"
        />
        <motion.circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke="url(#ringGrad)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          whileInView={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          viewport={{ once: true }}
          transform="rotate(-90 80 80)"
        />
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>
      </svg>
      <div className="cal-ring-inner">
        <strong>{consumed}</strong>
        <span>/ {goal} kcal</span>
      </div>
    </div>
  );
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [activeMeal, setActiveMeal] = useState(0);
  const [todayMeals, setTodayMeals] = useState([]);
  const [dashboardData, setDashboardData] = useState({
    userName: 'Utilizador',
    dailyGoal: 2150,
    consumedCalories: 0,
    weeklyBudget: 0,
    estimatedWeeklySpend: 0,
    weeklyCalories: buildWeeklyCalories(2150),
    goal: '',
    streakCount: 0,
    weeklyCompletedMeals: 0,
    weeklyTotalMeals: 0,
    weeklyAdherencePct: 0,
  });

  useEffect(() => {
    let isMounted = true;

    const run = async () => {
      const token = getAuthSession()?.token;
      if (!token) {
        return;
      }

      try {
        const [apiUser, prices, activePlan] = await Promise.all([
          fetchMyProfile(token),
          listLatestPrices(),
          fetchActiveMealPlan().catch(() => null),
        ]);

        const profile = apiUser?.profile || {};
        const dailyGoal = Math.max(1200, Math.round(toNumberOr(2150, profile?.dailyCalories)));
        const storedWeeklyPlan = loadStoredWeeklyPlan();
        const storedMealLookup = buildStoredMealLookup(storedWeeklyPlan);
        const priceIndex = buildPriceIndex(prices);

        const planDays = Array.isArray(activePlan?.days) ? activePlan.days : [];
        const flatMeals = planDays.flatMap((day) => (Array.isArray(day?.meals)
          ? day.meals.map((meal) => mergeStoredMeal(
            { ...meal, date: day.date, dayLabel: day.day_label },
            storedMealLookup,
          ))
          : []));

        const uniqueRecipeIds = Array.from(
          new Set(
            flatMeals
              .map((meal) => Number(meal?.recipe_id))
              .filter((id) => Number.isInteger(id) && id > 0),
          ),
        );

        const recipeEntries = await Promise.all(
          uniqueRecipeIds.map(async (id) => {
            try {
              const recipe = await fetchRecipeById(id);
              return [id, recipe];
            } catch {
              return [id, null];
            }
          }),
        );
        const recipeById = new Map(recipeEntries);

        const weeklyCalories = WEEK_DAYS.map((dayLabel) => {
          const dayMeals = flatMeals.filter((meal) => meal?.dayLabel === dayLabel);
          const real = Math.round(dayMeals.reduce((sum, meal) => {
            if (!meal?.completed) {
              return sum;
            }
            const recipe = recipeById.get(Number(meal?.recipe_id));
            const metrics = estimateMealMetrics(meal, recipe, priceIndex);
            return sum + toNumberOr(0, metrics.kcal);
          }, 0));
          return { day: dayLabel, real, meta: dailyGoal };
        });

        const todayIso = toIsoDate(new Date());
        const mealsForToday = flatMeals
          .filter((meal) => meal?.date === todayIso)
          .sort((a, b) => (SLOT_ORDER[a.slot] ?? 99) - (SLOT_ORDER[b.slot] ?? 99))
          .map((meal) => {
            const recipe = recipeById.get(Number(meal?.recipe_id));
            const slot = String(meal?.slot || '').trim() || 'Refeição';
            const meta = SLOT_META[slot] || SLOT_META.Snack;
            const metrics = estimateMealMetrics(meal, recipe, priceIndex);
            const kcal = Math.round(toNumberOr(0, metrics.kcal));
            const cost = toNumberOr(0, metrics.cost);
            const totalTime = toNumberOr(meta.fallbackMinutes, recipe?.totalTimeMin);

            return {
              period: slot,
              icon: meta.icon,
              name: String(meal?.title || 'Refeição').trim() || 'Refeição',
              time: formatMinutes(totalTime),
              kcal,
              costValue: cost,
              cost: formatEuro(cost),
              image: String(recipe?.imageUrl || '').trim() || meta.fallbackImage,
              sourceUrl: extractSourceUrl(recipe),
              completed: Boolean(meal?.completed),
            };
          });

        const weeklyTotalMeals = flatMeals.length;
        const weeklyCompletedMeals = flatMeals.filter((meal) => Boolean(meal?.completed)).length;
        const weeklyAdherencePct =
          weeklyTotalMeals > 0 ? Math.round((weeklyCompletedMeals / weeklyTotalMeals) * 100) : 0;

        const completedMeals = flatMeals.filter((meal) => Boolean(meal?.completed));
        const completedMealsCost = completedMeals.reduce((sum, meal) => {
          const recipe = recipeById.get(Number(meal?.recipe_id));
          const metrics = estimateMealMetrics(meal, recipe, priceIndex);
          return sum + toNumberOr(0, metrics.cost);
        }, 0);
        const estimatedWeeklySpend = completedMealsCost;

        if (!isMounted) {
          return;
        }

        setDashboardData({
          userName: toName(apiUser?.name),
          dailyGoal,
          consumedCalories: Math.round(
            mealsForToday.reduce((sum, meal) => (
              meal?.completed ? sum + toNumberOr(0, meal.kcal) : sum
            ), 0),
          ),
          weeklyBudget: Math.max(0, toNumberOr(0, profile?.budgetWeekly)),
          estimatedWeeklySpend,
          weeklyCalories,
          goal: String(profile?.goal || '').trim(),
          streakCount: Math.max(0, Math.round(toNumberOr(0, profile?.streakCount))),
          weeklyCompletedMeals,
          weeklyTotalMeals,
          weeklyAdherencePct,
        });
        setTodayMeals(mealsForToday);
      } catch {
        if (isMounted) {
          setTodayMeals([]);
        }
      }
    };

    void run();
    return () => {
      isMounted = false;
    };
  }, []);

  const meals = todayMeals;
  const activeMealData = meals[activeMeal] || null;
  const MealIcon = activeMealData?.icon || null;
  const completedCount = meals.filter((meal) => Boolean(meal.completed)).length;
  const completedPct = meals.length ? (completedCount / meals.length) * 100 : 0;
  const consumedKcal = meals.reduce((sum, meal) => (
    meal?.completed ? sum + toNumberOr(0, meal.kcal) : sum
  ), 0);
  const isActiveMealCompleted = Boolean(activeMealData?.completed);

  useEffect(() => {
    if (!meals.length) {
      setActiveMeal(0);
      return;
    }

    if (activeMeal >= meals.length) {
      setActiveMeal(0);
    }
  }, [activeMeal, meals.length]);

  const budgetPercent = useMemo(() => {
    if (dashboardData.weeklyBudget <= 0 || dashboardData.estimatedWeeklySpend <= 0) {
      return 0;
    }
    return Math.min(100, Math.round((dashboardData.estimatedWeeklySpend / dashboardData.weeklyBudget) * 100));
  }, [dashboardData.estimatedWeeklySpend, dashboardData.weeklyBudget]);

  const weeklySummaryTitle = useMemo(() => {
    if (dashboardData.weeklyAdherencePct >= 80) {
      return 'Estás com ótimo ritmo';
    }
    if (dashboardData.weeklyAdherencePct >= 50) {
      return 'Boa consistência esta semana';
    }
    return 'Semana em recuperação';
  }, [dashboardData.weeklyAdherencePct]);

  const weeklySummaryText = useMemo(() => {
    const mealsText = `${dashboardData.weeklyCompletedMeals}/${dashboardData.weeklyTotalMeals || 0} refeições concluídas`;

    if (dashboardData.weeklyBudget > 0 && dashboardData.estimatedWeeklySpend > 0) {
      const balance = dashboardData.weeklyBudget - dashboardData.estimatedWeeklySpend;
      if (balance >= 0) {
        return `${mealsText} e custo ${formatEuro(Math.abs(balance))} abaixo do orçamento semanal.`;
      }
      return `${mealsText} e custo ${formatEuro(Math.abs(balance))} acima do orçamento semanal.`;
    }

    return `${mealsText}. Define um orçamento no perfil para acompanhares melhor os gastos semanais.`;
  }, [
    dashboardData.weeklyBudget,
    dashboardData.weeklyCompletedMeals,
    dashboardData.weeklyTotalMeals,
    dashboardData.estimatedWeeklySpend,
  ]);

  const openActiveMealRecipe = () => {
    const sourceUrl = String(activeMealData?.sourceUrl || '').trim();
    if (sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://')) {
      window.open(sourceUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    navigate('/recipes');
  };

  const openChatbotForPlan = () => {
    window.dispatchEvent(
      new CustomEvent('nutribot:open-chat', {
        detail: {
          focusInput: true,
          seedMessage: 'Quero gerar um novo plano alimentar.',
        },
      }),
    );
  };

  const handleCompleteActiveMeal = () => {
    if (!activeMealData) {
      return;
    }

    const willComplete = !isActiveMealCompleted;
    const kcalDelta = Math.round(toNumberOr(0, activeMealData.kcal)) * (willComplete ? 1 : -1);
    const costDelta = toNumberOr(0, activeMealData.costValue) * (willComplete ? 1 : -1);
    const todayDayLabel = WEEK_DAYS[(new Date().getDay() + 6) % 7];

    setTodayMeals((previous) => previous.map((meal, index) => (
      index === activeMeal
        ? { ...meal, completed: willComplete }
        : meal
    )));

    setDashboardData((previous) => {
      const totalMeals = Math.max(0, toNumberOr(0, previous.weeklyTotalMeals));
      const currentCompleted = Math.max(0, toNumberOr(0, previous.weeklyCompletedMeals));
      const nextCompletedMeals = Math.min(totalMeals, Math.max(0, currentCompleted + (willComplete ? 1 : -1)));
      const nextAdherence = totalMeals > 0 ? Math.round((nextCompletedMeals / totalMeals) * 100) : 0;

      const nextWeeklyCalories = Array.isArray(previous.weeklyCalories)
        ? previous.weeklyCalories.map((entry) => (
          entry?.day === todayDayLabel
            ? { ...entry, real: Math.max(0, Math.round(toNumberOr(0, entry.real) + kcalDelta)) }
            : entry
        ))
        : previous.weeklyCalories;

      return {
        ...previous,
        consumedCalories: Math.max(0, Math.round(toNumberOr(0, previous.consumedCalories) + kcalDelta)),
        estimatedWeeklySpend: Math.max(0, toNumberOr(0, previous.estimatedWeeklySpend) + costDelta),
        weeklyCompletedMeals: nextCompletedMeals,
        weeklyAdherencePct: nextAdherence,
        weeklyCalories: nextWeeklyCalories,
      };
    });
  };

  return (
    <Layout>
      <div className="page dash">
        <div className="container-xl">
          <motion.section className="dash-hero card" {...fade}>
            <div className="dash-hero-noise" />
            <div className="dash-hero-blob blob-1" />
            <div className="dash-hero-blob blob-2" />

            <div className="dash-hero-content">
              <div className="dash-hero-left">
                <span className="dash-streak-pill">
                  <Flame size={17} /> Streak {dashboardData.streakCount} dias
                </span>
                <h1>Boa tarde, {dashboardData.userName}</h1>
                <p>
                  Estás no caminho certo. Planea as tuas refeições de forma simples, com os carrinhos de compras
                  automáticos.
                </p>
                <motion.button
                  className="dash-hero-cta"
                  whileHover={{ scale: 1.03, boxShadow: '0 0 30px rgba(52,211,153,0.4)' }}
                  whileTap={{ scale: 0.97 }}
                  onClick={openChatbotForPlan}
                >
                  Gerar Novo Plano <ArrowRight size={16} />
                </motion.button>
              </div>

              <div className="dash-hero-right">
                <div className="dash-hero-meters">
                  <CalorieRing consumed={dashboardData.consumedCalories} goal={dashboardData.dailyGoal} />
                </div>
              </div>
            </div>
          </motion.section>

          <motion.section className="dash-meals" {...fade}>
            <div className="dash-meals-head">
              <h2>Refeições de hoje</h2>
              <span className="dash-meals-total">{consumedKcal} kcal total</span>
            </div>

            <div className="dash-meal-tabs">
              {meals.map((meal, i) => {
                const Icon = meal.icon;
                return (
                  <button
                    key={`${meal.period}-${i}`}
                    className={`dash-meal-tab ${activeMeal === i ? 'active' : ''}`}
                    onClick={() => setActiveMeal(i)}
                  >
                    {Icon ? <Icon size={16} /> : null}
                    <span>{meal.period}</span>
                  </button>
                );
              })}
            </div>

            {!activeMealData ? (
              <div className="dash-meal-card">
                <h3>Sem refeições planeadas para hoje</h3>
                <div className="dash-meal-actions">
                  <button type="button" className="dash-meal-view" onClick={openChatbotForPlan}>
                    Gerar plano no chatbot <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  className="dash-meal-card"
                  key={activeMeal}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.25 }}
                >
                  <img
                    src={activeMealData.image}
                    alt={activeMealData.name}
                    loading="lazy"
                    className="dash-meal-image"
                  />
                  {MealIcon ? (
                    <div className="dash-meal-icon">
                      <MealIcon size={24} />
                    </div>
                  ) : null}
                  <h3>{activeMealData.name}</h3>
                  <div className="dash-meal-meta">
                    <span>
                      <Clock3 size={13} /> {activeMealData.time}
                    </span>
                    <span>
                      <Flame size={13} /> {activeMealData.kcal} kcal
                    </span>
                    <span>{activeMealData.cost}</span>
                  </div>
                  <div className="dash-meal-actions">
                    <button type="button" className="dash-meal-view" onClick={openActiveMealRecipe}>
                      Ver receita completa <ChevronRight size={15} />
                    </button>
                    <button
                      type="button"
                      className={`dash-meal-complete ${isActiveMealCompleted ? 'done' : ''}`}
                      onClick={handleCompleteActiveMeal}
                    >
                      <CheckCircle2 size={14} />
                      <span>{isActiveMealCompleted ? 'Desmarcar refeição' : 'Marcar como comida'}</span>
                    </button>
                  </div>
                </motion.div>
              </AnimatePresence>
            )}

            <div className="dash-meal-progress">
              <div className="dash-meal-progress-track">
                <motion.div
                  className="dash-meal-progress-fill"
                  initial={false}
                  animate={{ width: `${completedPct}%` }}
                  transition={{ duration: 0.35, ease: 'easeOut' }}
                />
              </div>
              <span>
                {completedCount} de {meals.length} concluídas
              </span>
            </div>
          </motion.section>

          <div className="dash-summary-stack">
            <motion.section className="dash-insight" {...fade}>
              <div className="dash-insight-head">
                <div className="dash-insight-content">
                  <span className="dash-insight-badge">Resumo semanal</span>
                  <h2>{weeklySummaryTitle}</h2>
                  <p>{weeklySummaryText}</p>
                </div>
                <div className="dash-insight-art">
                  <img
                    src="https://picsum.photos/seed/summary-nutriq/520/360"
                    alt="Prato saudável"
                    loading="lazy"
                    className="dash-insight-image"
                  />
                </div>
              </div>

              <div className="dash-insight-bento">
                <motion.div className="bento-cell bento-budget" {...fade}>
                  <Wallet size={20} />
                  <strong>{formatEuro(dashboardData.estimatedWeeklySpend)}</strong>
                  <span>gasto esta semana</span>
                  <div className="bento-budget-bar">
                    <motion.div
                      initial={{ width: 0 }}
                      whileInView={{ width: `${budgetPercent}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                      viewport={{ once: true }}
                    />
                  </div>
                  <span className="bento-budget-label">
                    {dashboardData.weeklyBudget > 0 ? `${budgetPercent}% do orçamento` : 'Orçamento não definido'}
                  </span>
                </motion.div>

                <motion.div className="bento-cell bento-score" {...fade}>
                  <Target size={20} />
                  <strong>
                    {dashboardData.weeklyAdherencePct}
                    <span className="score-pct">%</span>
                  </strong>
                  <span>adesão semanal</span>
                </motion.div>

                <motion.div className="bento-cell bento-meals-done" {...fade}>
                  <CheckCircle2 size={20} />
                  <strong>
                    {dashboardData.weeklyCompletedMeals}
                    <span className="score-sep">/</span>
                    {dashboardData.weeklyTotalMeals}
                  </strong>
                  <span>refeições concluídas</span>
                </motion.div>
              </div>
            </motion.section>

            <motion.section className="dash-chart-section" {...fade}>
              <div className="dash-chart-noise" />
              <div className="dash-chart-head">
                <div>
                  <h2>Calorias vs objetivo</h2>
                  <span>Últimos 7 dias</span>
                </div>
                <div className="dash-chart-legend">
                  <span className="legend-real" />
                  Real
                  <span className="legend-meta" />
                  Meta
                </div>
              </div>
              <div className="dash-chart-canvas">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dashboardData.weeklyCalories}>
                    <defs>
                      <linearGradient id="calGradDark" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(148,163,184,0.25)" vertical={false} />
                    <XAxis
                      dataKey="day"
                      tick={{ fill: '#cbd5e1', fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: '#94a3b8', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={34}
                      domain={['dataMin - 100', 'dataMax + 100']}
                    />
                    <Tooltip
                      cursor={{ stroke: '#34d399', strokeWidth: 1 }}
                      contentStyle={{
                        background: '#f8fafc',
                        border: '1px solid #d9e2ec',
                        borderRadius: '12px',
                        color: '#0f172a',
                      }}
                      labelStyle={{ color: '#475569' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="meta"
                      stroke="#94a3b8"
                      strokeWidth={1.5}
                      strokeDasharray="6 4"
                      fill="transparent"
                      name="Meta"
                    />
                    <Area
                      type="monotone"
                      dataKey="real"
                      stroke="#34d399"
                      strokeWidth={2.5}
                      fill="url(#calGradDark)"
                      name="Real"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </motion.section>
          </div>
        </div>
      </div>
    </Layout>
  );
}
