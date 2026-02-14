import Layout from '../components/Layout';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
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
  Utensils,
  Target,
} from 'lucide-react';
import { fetchMyProfile } from '../services/userService';
import { listLatestPrices } from '../services/priceService';
import { getAuthSession } from '../utils/authSession';
import '../styles/dashboard.css';

const fade = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
  viewport: { once: true, amount: 0.1 },
};

const WEEK_DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

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

function buildWeeklyCalories(goal) {
  const offsets = [0.03, -0.04, -0.01, -0.06, -0.02, -0.09, -0.05];
  return WEEK_DAYS.map((day, index) => {
    const real = Math.max(1200, Math.round(goal * (1 + offsets[index])));
    return { day, real, meta: goal };
  });
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
      <div className="cal-ring-inner">
        <strong>{consumed}</strong>
        <span>/ {goal} kcal</span>
      </div>
    </div>
  );
};

export default function Dashboard() {
  const meals = [
    { period: 'Pequeno-almoço', icon: Sunrise, name: 'Aveia com Banana e Mel', time: '10 min', kcal: 320, cost: '€2.50', image: 'https://picsum.photos/seed/breakfast-nutriq/1200/800' },
    { period: 'Almoço', icon: Sun, name: 'Frango Grelhado com Arroz', time: '25 min', kcal: 580, cost: '€4.20', image: 'https://picsum.photos/seed/lunch-nutriq/1200/800' },
    { period: 'Jantar', icon: Moon, name: 'Salmão com Legumes', time: '20 min', kcal: 520, cost: '€5.80', image: 'https://picsum.photos/seed/dinner-nutriq/1200/800' },
  ];

  const [activeMeal, setActiveMeal] = useState(0);
  const [completedMeals, setCompletedMeals] = useState(() => meals.map(() => false));
  const [dashboardData, setDashboardData] = useState({
    userName: 'Joana',
    dailyGoal: 2150,
    consumedCalories: 1420,
    weeklyBudget: 0,
    estimatedWeeklySpend: 45,
    ingredientCount: 18,
    weeklyCalories: buildWeeklyCalories(2150),
    goal: '',
  });

  useEffect(() => {
    let isMounted = true;

    const run = async () => {
      const token = getAuthSession()?.token;
      if (!token) {
        return;
      }

      try {
        const [apiUser, prices] = await Promise.all([fetchMyProfile(token), listLatestPrices()]);
        if (!isMounted) {
          return;
        }

        const profile = apiUser?.profile || {};
        const dailyGoal = Math.max(1200, Math.round(toNumberOr(2150, profile?.dailyCalories)));
        const estimatedSpend = estimateWeeklySpend(prices);

        setDashboardData({
          userName: toName(apiUser?.name) || 'Joana',
          dailyGoal,
          consumedCalories: Math.round(dailyGoal * 0.66),
          weeklyBudget: Math.max(0, toNumberOr(0, profile?.budgetWeekly)),
          estimatedWeeklySpend: estimatedSpend > 0 ? estimatedSpend : 45,
          ingredientCount: Array.isArray(prices) ? Math.max(0, prices.length) : 18,
          weeklyCalories: buildWeeklyCalories(dailyGoal),
          goal: String(profile?.goal || '').trim(),
        });
      } catch {
        // Keep current UI values.
      }
    };

    void run();
    return () => {
      isMounted = false;
    };
  }, []);

  const activeMealData = meals[activeMeal];
  const MealIcon = activeMealData.icon;
  const completedCount = completedMeals.filter(Boolean).length;
  const completedPct = meals.length ? (completedCount / meals.length) * 100 : 0;
  const consumedKcal = meals.reduce((sum, meal, index) => {
    if (completedMeals[index]) return sum + meal.kcal;
    return sum;
  }, 0);
  const isActiveMealCompleted = completedMeals[activeMeal];

  const toggleMealCompleted = (mealIndex) => {
    setCompletedMeals((prev) => prev.map((done, index) => (index === mealIndex ? !done : done)));
  };

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
    if (dashboardData.weeklyBudget <= 0) {
      return 62;
    }
    return Math.min(100, Math.round((dashboardData.estimatedWeeklySpend / dashboardData.weeklyBudget) * 100));
  }, [dashboardData.estimatedWeeklySpend, dashboardData.weeklyBudget]);
  const waterDrank = 1.5;
  const waterGoal = 3;
  const hydrationPct = Math.min((waterDrank / waterGoal) * 100, 100);

  return (
    <Layout>
      <div className="dash">
        {/* === DARK HERO === */}
        <motion.section className="dash-hero" {...fade}>
          <div className="dash-hero-noise" />
          <div className="dash-hero-blob blob-1" />
          <div className="dash-hero-blob blob-2" />

          <div className="dash-hero-content">
            <div className="dash-hero-left">
              <span className="dash-streak-pill"><Flame size={17} /> Streak 12 dias</span>
              <h1>Boa tarde, {dashboardData.userName}</h1>
              <p>Estás no caminho certo. 3 refeições planeadas, objetivo calórico sob controlo.</p>
              <motion.button
                className="dash-hero-cta"
                whileHover={{ scale: 1.03, boxShadow: '0 0 30px rgba(52,211,153,0.4)' }}
                whileTap={{ scale: 0.97 }}
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

        {/* === MEALS — tabs === */}
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
                  key={meal.period}
                  className={`dash-meal-tab ${activeMeal === i ? 'active' : ''}`}
                  onClick={() => setActiveMeal(i)}
                >
                  <Icon size={16} />
                  <span>{meal.period}</span>
                </button>
              );
            })}
          </div>

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
                <button type="button" className="dash-meal-view">Ver receita completa <ChevronRight size={15} /></button>
                <button
                  type="button"
                  className={`dash-meal-complete ${isActiveMealCompleted ? 'done' : ''}`}
                  onClick={() => toggleMealCompleted(activeMeal)}
                >
                  <CheckCircle2 size={14} />
                  <span>{isActiveMealCompleted ? 'Marcada como comida' : 'Marcar como comida'}</span>
                </button>
              </div>
            </motion.div>
          </AnimatePresence>

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
          {/* === INSIGHT BANNER — gradient bg === */}
          <motion.section className="dash-insight" {...fade}>
            <div className="dash-insight-head">
              <div className="dash-insight-content">
                <span className="dash-insight-badge">Resumo semanal</span>
                <h2>Estás com ótimo ritmo</h2>
                <p>Custo abaixo do objetivo e consistência estável. Mais uma semana assim e fechas o ciclo com margem positiva.</p>
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
                  {dashboardData.weeklyBudget > 0 ? `${budgetPercent}% do orçamento` : '62% do orçamento'}
                </span>
              </motion.div>

              <motion.div className="bento-cell bento-score" {...fade}>
                <Target size={20} />
                <strong>82<span className="score-pct">%</span></strong>
                <span>adesão semanal</span>
              </motion.div>

              <motion.div className="bento-cell bento-meals-done" {...fade}>
                <CheckCircle2 size={20} />
                <strong>{Math.min(21, Math.max(0, Math.round(dashboardData.ingredientCount)))}<span className="score-sep">/</span>21</strong>
                <span>refeições concluídas</span>
              </motion.div>
            </div>
          </motion.section>

          {/* === CHART — dark bg === */}
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
    </Layout>
  );
}
