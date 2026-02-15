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
  Sunrise,
  Sun,
  Moon,
  ChevronRight,
  Target,
} from 'lucide-react';
import { fetchMyProfile } from '../services/userService';
import { listLatestPrices } from '../services/priceService';
import { fetchActiveMealPlan } from '../services/mealPlanService';
import { fetchRecipeById } from '../services/recipeService';
import { getAuthSession } from '../utils/authSession';
import '../styles/dashboard.css';

const fade = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
  viewport: { once: true, amount: 0.1 },
};

const WEEK_DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const SLOT_ORDER = {
  'Pequeno-almoço': 0,
  Almoço: 1,
  Jantar: 2,
  Snack: 3,
};

const SLOT_META = {
  'Pequeno-almoço': { icon: Sunrise, fallbackMinutes: 15, fallbackImage: 'https://picsum.photos/seed/breakfast-nutriq/1200/800' },
  Almoço: { icon: Sun, fallbackMinutes: 25, fallbackImage: 'https://picsum.photos/seed/lunch-nutriq/1200/800' },
  Jantar: { icon: Moon, fallbackMinutes: 20, fallbackImage: 'https://picsum.photos/seed/dinner-nutriq/1200/800' },
  Snack: { icon: Sun, fallbackMinutes: 10, fallbackImage: 'https://picsum.photos/seed/snack-nutriq/1200/800' },
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
  const candidates = [
    recipe?.sourceUrl,
    recipe?.source_url,
    recipe?.url,
  ];

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

function estimateWeeklySpend(prices) {
  const cheapestByIngredient = new Map();

  prices.forEach((entry) => {
    const ingredient = String(entry?.ingredientNormalized || '').trim();
    const price = Number(entry?.price);

    if (!ingredient || !Number.isFinite(price)) {
      return;
    }

    const previous = cheapestByIngredient.get(ingredient);
    if (previous === undefined || price < previous) {
      cheapestByIngredient.set(ingredient, price);
    }
  });

  return Array.from(cheapestByIngredient.values()).reduce((total, value) => total + value, 0);
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
        <circle cx="80" cy="80" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
        <motion.circle
          cx="80" cy="80" r={radius} fill="none"
          stroke="url(#ringGrad)" strokeWidth="10"
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
      <div className="cal-ring-inner"><strong>{consumed}</strong><span>/ {goal} kcal</span></div>
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
        const estimatedSpendByPrices = estimateWeeklySpend(prices);

        const planDays = Array.isArray(activePlan?.days) ? activePlan.days : [];
        const flatMeals = planDays.flatMap((day) => (Array.isArray(day?.meals)
          ? day.meals.map((meal) => ({ ...meal, date: day.date, dayLabel: day.day_label }))
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
            const recipe = recipeById.get(Number(meal?.recipe_id));
            return sum + toNumberOr(0, recipe?.nutritionalInfo?.calories);
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
            const kcal = Math.round(toNumberOr(0, recipe?.nutritionalInfo?.calories));
            const cost = toNumberOr(0, recipe?.costPerServing);
            const totalTime = toNumberOr(meta.fallbackMinutes, recipe?.totalTimeMin);

            return {
              period: slot,
              icon: meta.icon,
              name: String(meal?.title || 'Refeição').trim() || 'Refeição',
              time: formatMinutes(totalTime),
              kcal,
              cost: formatEuro(cost),
              image: String(recipe?.imageUrl || '').trim() || meta.fallbackImage,
              sourceUrl: extractSourceUrl(recipe),
              completed: Boolean(meal?.completed),
            };
          });

        const weeklyTotalMeals = flatMeals.length;
        const weeklyCompletedMeals = flatMeals.filter((meal) => Boolean(meal?.completed)).length;
        const weeklyAdherencePct = weeklyTotalMeals > 0
          ? Math.round((weeklyCompletedMeals / weeklyTotalMeals) * 100)
          : 0;

        const weeklyPlanCost = toNumberOr(0, activePlan?.total_cost);
        const estimatedWeeklySpend = weeklyPlanCost > 0 ? weeklyPlanCost : estimatedSpendByPrices;

        if (!isMounted) {
          return;
        }

        setDashboardData({
          userName: toName(apiUser?.name),
          dailyGoal,
          consumedCalories: Math.round(mealsForToday.reduce((sum, meal) => sum + toNumberOr(0, meal.kcal), 0)),
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
  const MealIcon = activeMealData?.icon || Sunrise;
  const completedCount = meals.filter((meal) => Boolean(meal.completed)).length;
  const completedPct = meals.length ? (completedCount / meals.length) * 100 : 0;
  const consumedKcal = meals.reduce((sum, meal) => sum + toNumberOr(0, meal.kcal), 0);
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

  const macros = useMemo(() => {
    if (dashboardData.goal === 'BULK') {
      return [
        { label: 'Proteína', value: 140, max: 170, color: '#60a5fa' },
        { label: 'Hidratos', value: 280, max: 340, color: '#fbbf24' },
        { label: 'Gordura', value: 75, max: 90, color: '#f472b6' },
      ];
    }

    if (dashboardData.goal === 'LOSE_WEIGHT') {
      return [
        { label: 'Proteína', value: 130, max: 160, color: '#60a5fa' },
        { label: 'Hidratos', value: 180, max: 240, color: '#fbbf24' },
        { label: 'Gordura', value: 55, max: 75, color: '#f472b6' },
      ];
    }

    return [
      { label: 'Proteína', value: 120, max: 150, color: '#60a5fa' },
      { label: 'Hidratos', value: 230, max: 280, color: '#fbbf24' },
      { label: 'Gordura', value: 65, max: 80, color: '#f472b6' },
    ];
  }, [dashboardData.goal]);

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
    window.dispatchEvent(new CustomEvent('nutribot:open-chat', {
      detail: {
        focusInput: true,
        seedMessage: 'Quero gerar um novo plano alimentar.',
      },
    }));
  };

  const waterDrank = 1.5;
  const waterGoal = 3;
  const hydrationPct = Math.min((waterDrank / waterGoal) * 100, 100);

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
                <span className="dash-streak-pill"><Flame size={17} /> Streak {dashboardData.streakCount} dias</span>
                <h1>Boa tarde, {dashboardData.userName}</h1>
                <p>Estás no caminho certo. Planea as tuas refeições de forma simples, com os carrinhos de compras automáticos.</p>
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
                <motion.div
                  className="dash-hydration-card"
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: 'easeOut', delay: 0.1 }}
                  viewport={{ once: true }}
                >
                  <div className="hydration-body">
                    <div className="water-bottle" role="img" aria-label={`${waterDrank.toFixed(1)} litros de ${waterGoal} litros`}>
                      <div className="water-bottle-top" />
                      <div className="water-bottle-neck" />
                      <div className="water-bottle-body">
                        <motion.div
                          className="water-bottle-fill"
                          initial={{ height: 0 }}
                          whileInView={{ height: `${hydrationPct}%` }}
                          transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
                          viewport={{ once: true }}
                        />
                        <div className="water-bottle-rings" />
                        <div className="water-bottle-gloss" />
                        <div className="water-bottle-reading">
                          <strong>{waterDrank.toFixed(1)}L</strong>
                          <span>/ {waterGoal}L</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>
                <div className="dash-hero-macros">
                  {macros.map((m) => (
                    <div className="macro-bar" key={m.label}>
                    <div className="macro-bar-head">
                      <span>{m.label}</span>
                      <span>{m.value}g</span>
                      </div>
                    <div className="macro-bar-track">
                      <motion.div
                        className="macro-bar-fill"
                        style={{ background: m.color }}
                        initial={{ width: 0 }}
                        whileInView={{ width: `${(m.value / m.max) * 100}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 }}
                        viewport={{ once: true }}
                      />
                    </div>
                  </div>
                  ))}
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
                  <Icon size={16} />
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
                  <img src={activeMealData.image} alt={activeMealData.name} loading="lazy" className="dash-meal-image" />
                  <div className="dash-meal-icon"><MealIcon size={24} /></div>
                  <h3>{activeMealData.name}</h3>
                  <div className="dash-meal-meta">
                    <span><Clock3 size={13} /> {activeMealData.time}</span>
                    <span><Flame size={13} /> {activeMealData.kcal} kcal</span>
                    <span>{activeMealData.cost}</span>
                  </div>
                  <div className="dash-meal-actions">
                    <button type="button" className="dash-meal-view" onClick={openActiveMealRecipe}>Ver receita completa <ChevronRight size={15} /></button>
                  <button
                    type="button"
                    className={`dash-meal-complete ${isActiveMealCompleted ? 'done' : ''}`}
                    disabled
                  >
                    <CheckCircle2 size={14} />
                    <span>{isActiveMealCompleted ? 'Marcada como comida' : 'Por concluir'}</span>
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
              <span>{completedCount} de {meals.length} concluídas</span>
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
                <img src="https://picsum.photos/seed/summary-nutriq/520/360" alt="Prato saudável" loading="lazy" className="dash-insight-image" />
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
                <strong>{dashboardData.weeklyAdherencePct}<span className="score-pct">%</span></strong>
                <span>adesão semanal</span>
                </motion.div>

                <motion.div className="bento-cell bento-meals-done" {...fade}>
                <CheckCircle2 size={20} />
                <strong>{dashboardData.weeklyCompletedMeals}<span className="score-sep">/</span>{dashboardData.weeklyTotalMeals}</strong>
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
                <span className="legend-real" />Real
                <span className="legend-meta" />Meta
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
                    <XAxis dataKey="day" tick={{ fill: '#cbd5e1', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} width={34} domain={['dataMin - 100', 'dataMax + 100']} />
                  <Tooltip
                    cursor={{ stroke: '#34d399', strokeWidth: 1 }}
                    contentStyle={{ background: '#f8fafc', border: '1px solid #d9e2ec', borderRadius: '12px', color: '#0f172a' }}
                    labelStyle={{ color: '#475569' }}
                  />
                    <Area type="monotone" dataKey="meta" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="6 4" fill="transparent" name="Meta" />
                    <Area type="monotone" dataKey="real" stroke="#34d399" strokeWidth={2.5} fill="url(#calGradDark)" name="Real" />
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
