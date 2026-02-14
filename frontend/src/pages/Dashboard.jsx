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
  CalendarDays,
  ShoppingCart,
  BookOpen,
  BarChart3,
  Flame,
  Wallet,
  CheckCircle2,
  TrendingUp,
  ArrowRight,
  Clock3,
  Sunrise,
  Sun,
  Moon,
  Zap,
  Droplets,
  ChevronRight,
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

function formatEuro(value) {
  return Number(value || 0).toLocaleString('pt-PT', {
    style: 'currency',
    currency: 'EUR',
  });
}

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

// eslint-disable-next-line react/prop-types
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
  const [activeMeal, setActiveMeal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [dashboardData, setDashboardData] = useState({
    userName: 'Utilizador',
    dailyGoal: 2150,
    consumedCalories: 1420,
    weeklyBudget: 0,
    estimatedWeeklySpend: 0,
    ingredientCount: 0,
    weeklyCalories: buildWeeklyCalories(2150),
    goal: '',
  });

  useEffect(() => {
    let isMounted = true;

    const run = async () => {
      setIsLoading(true);
      setLoadError('');

      const token = getAuthSession()?.token;
      if (!token) {
        if (isMounted) {
          setLoadError('Sessão inválida. Faz login novamente.');
          setIsLoading(false);
        }
        return;
      }

      try {
        const [apiUser, prices] = await Promise.all([fetchMyProfile(token), listLatestPrices()]);
        if (!isMounted) {
          return;
        }

        const profile = apiUser?.profile || {};
        const dailyGoal = Math.max(1200, Math.round(toNumberOr(2150, profile?.dailyCalories)));
        const consumedCalories = Math.round(dailyGoal * 0.66);
        const weeklyBudget = Math.max(0, toNumberOr(0, profile?.budgetWeekly));
        const estimatedWeeklySpend = estimateWeeklySpend(prices);

        setDashboardData({
          userName: toName(apiUser?.name),
          dailyGoal,
          consumedCalories,
          weeklyBudget,
          estimatedWeeklySpend,
          ingredientCount: Array.isArray(prices) ? prices.length : 0,
          weeklyCalories: buildWeeklyCalories(dailyGoal),
          goal: String(profile?.goal || '').trim(),
        });
      } catch (error) {
        if (isMounted) {
          setLoadError(error.message || 'Não foi possível sincronizar o dashboard com o backend.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void run();
    return () => {
      isMounted = false;
    };
  }, []);

  const meals = [
    {
      period: 'Pequeno-almoço',
      icon: Sunrise,
      name: 'Aveia com Banana e Mel',
      time: '10 min',
      kcal: 320,
      cost: '€2.50',
      image: 'https://picsum.photos/seed/breakfast-nutriq/1200/800',
    },
    {
      period: 'Almoço',
      icon: Sun,
      name: 'Frango Grelhado com Arroz',
      time: '25 min',
      kcal: 580,
      cost: '€4.20',
      image: 'https://picsum.photos/seed/lunch-nutriq/1200/800',
    },
    {
      period: 'Jantar',
      icon: Moon,
      name: 'Salmão com Legumes',
      time: '20 min',
      kcal: 520,
      cost: '€5.80',
      image: 'https://picsum.photos/seed/dinner-nutriq/1200/800',
    },
  ];

  const activeMealData = meals[activeMeal];
  const MealIcon = activeMealData.icon;

  const budgetPercent = useMemo(() => {
    if (dashboardData.weeklyBudget <= 0) {
      return 0;
    }
    return Math.min(100, Math.round((dashboardData.estimatedWeeklySpend / dashboardData.weeklyBudget) * 100));
  }, [dashboardData.estimatedWeeklySpend, dashboardData.weeklyBudget]);

  const caloriesDeltaPercent = useMemo(() => {
    if (!dashboardData.weeklyCalories.length || dashboardData.dailyGoal <= 0) {
      return 0;
    }

    const average = dashboardData.weeklyCalories.reduce((sum, item) => sum + item.real, 0) /
      dashboardData.weeklyCalories.length;
    return Math.round(((average - dashboardData.dailyGoal) / dashboardData.dailyGoal) * 100);
  }, [dashboardData.dailyGoal, dashboardData.weeklyCalories]);

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

  const insightBudgetText = useMemo(() => {
    if (dashboardData.weeklyBudget <= 0) {
      return 'Sem orçamento semanal definido';
    }
    const delta = dashboardData.weeklyBudget - dashboardData.estimatedWeeklySpend;
    const prefix = delta >= 0 ? '+' : '-';
    return `${prefix}${formatEuro(Math.abs(delta))} vs orçamento`;
  }, [dashboardData.estimatedWeeklySpend, dashboardData.weeklyBudget]);

  return (
    <Layout>
      <div className="dash">
        <motion.section className="dash-hero" {...fade}>
          <div className="dash-hero-noise" />
          <div className="dash-hero-blob blob-1" />
          <div className="dash-hero-blob blob-2" />

          <div className="dash-hero-content">
            <div className="dash-hero-left">
              <span className="dash-streak-pill"><Zap size={13} /> Streak 12 dias</span>
              <h1>Boa tarde, {dashboardData.userName}</h1>
              <p>
                {loadError
                  ? `Sincronização parcial: ${loadError}`
                  : 'Dados ligados ao backend: perfil e preços importados.'}
              </p>
              <motion.button
                className="dash-hero-cta"
                whileHover={{ scale: 1.03, boxShadow: '0 0 30px rgba(52,211,153,0.4)' }}
                whileTap={{ scale: 0.97 }}
                type="button"
              >
                {isLoading ? 'A sincronizar...' : 'Gerar Novo Plano'} <ArrowRight size={16} />
              </motion.button>
            </div>

            <div className="dash-hero-right">
              <CalorieRing
                consumed={dashboardData.consumedCalories}
                goal={dashboardData.dailyGoal}
              />
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

        <div className="dash-bento">
          <motion.div className="bento-cell bento-streak" {...fade}>
            <div className="bento-glow" />
            <Flame size={22} />
            <strong>12</strong>
            <span>Dias<br />seguidos</span>
          </motion.div>

          <motion.div className="bento-cell bento-water" {...fade}>
            <Droplets size={20} />
            <div className="water-fill-wrap">
              <motion.div
                className="water-fill"
                initial={{ height: 0 }}
                whileInView={{ height: '68%' }}
                transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
                viewport={{ once: true }}
              />
            </div>
            <strong>2.1L</strong>
            <span>de 3L</span>
          </motion.div>

          <motion.div className="bento-cell bento-budget" {...fade}>
            <Wallet size={20} />
            <strong>{formatEuro(dashboardData.estimatedWeeklySpend)}</strong>
            <span>estimado esta semana</span>
            <div className="bento-budget-bar">
              <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: `${budgetPercent}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                viewport={{ once: true }}
              />
            </div>
            <span className="bento-budget-label">
              {dashboardData.weeklyBudget > 0 ? `${budgetPercent}% do orçamento` : 'Sem orçamento definido'}
            </span>
          </motion.div>

          <motion.div className="bento-cell bento-score" {...fade}>
            <Target size={20} />
            <strong>
              {Math.max(60, 100 - Math.abs(caloriesDeltaPercent))}
              <span className="score-pct">%</span>
            </strong>
            <span>adesão semanal</span>
          </motion.div>

          <motion.div className="bento-cell bento-meals-done" {...fade}>
            <CheckCircle2 size={20} />
            <strong>{dashboardData.ingredientCount}<span className="score-sep">/</span>21</strong>
            <span>itens com preço</span>
          </motion.div>
        </div>

        <motion.section className="dash-chart-section" {...fade}>
          <div className="dash-chart-noise" />
          <div className="dash-chart-head">
            <div>
              <h2>Calorias vs objetivo</h2>
              <span>Últimos 7 dias (estimado)</span>
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
                <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} width={34} domain={['dataMin - 100', 'dataMax + 100']} />
                <Tooltip
                  cursor={{ stroke: '#34d399', strokeWidth: 1 }}
                  contentStyle={{ background: '#f8fafc', border: '1px solid #d9e2ec', borderRadius: '12px', color: '#0f172a' }}
                  labelStyle={{ color: '#64748b' }}
                />
                <Area type="monotone" dataKey="meta" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="6 4" fill="transparent" name="Meta" />
                <Area type="monotone" dataKey="real" stroke="#34d399" strokeWidth={2.5} fill="url(#calGradDark)" name="Real" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.section>

        <motion.section className="dash-insight" {...fade}>
          <div className="dash-insight-content">
            <span className="dash-insight-badge">Resumo semanal</span>
            <h2>Estado atual ligado ao backend</h2>
            <p>
              Perfil sincronizado com `users/me` e custos estimados a partir de `prices`.
            </p>
            <div className="dash-insight-pills">
              <span><TrendingUp size={13} /> {caloriesDeltaPercent}% vs meta calórica</span>
              <span><Wallet size={13} /> {insightBudgetText}</span>
            </div>
          </div>
          <div className="dash-insight-art">
            <img src="https://picsum.photos/seed/summary-nutriq/520/360" alt="Prato saudável" loading="lazy" className="dash-insight-image" />
          </div>
        </motion.section>

        <motion.section className="dash-meals" {...fade}>
          <div className="dash-meals-head">
            <h2>Refeições de hoje</h2>
            <span className="dash-meals-total">{meals.reduce((s, m) => s + m.kcal, 0)} kcal total</span>
          </div>

          <div className="dash-meal-tabs">
            {meals.map((meal, i) => {
              const Icon = meal.icon;
              return (
                <button
                  key={meal.period}
                  className={`dash-meal-tab ${activeMeal === i ? 'active' : ''}`}
                  onClick={() => setActiveMeal(i)}
                  type="button"
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
              <button className="dash-meal-view" type="button">Ver receita completa <ChevronRight size={15} /></button>
            </motion.div>
          </AnimatePresence>

          <div className="dash-meal-progress">
            <div className="dash-meal-progress-track">
              <motion.div
                className="dash-meal-progress-fill"
                initial={{ width: 0 }}
                whileInView={{ width: '33%' }}
                transition={{ duration: 0.6 }}
                viewport={{ once: true }}
              />
            </div>
            <span>1 de 3 concluídas</span>
          </div>
        </motion.section>

        <motion.section className="dash-actions" {...fade}>
          <h2>Acesso rápido</h2>
          <div className="dash-actions-grid">
            {[
              { label: 'Plano Semanal', icon: CalendarDays, bg: '#dcfce7', color: '#059669' },
              { label: 'Lista de Compras', icon: ShoppingCart, bg: '#fef3c7', color: '#b45309' },
              { label: 'Explorar Receitas', icon: BookOpen, bg: '#ccfbf1', color: '#0f766e' },
              { label: 'Ver Progresso', icon: BarChart3, bg: '#ede9fe', color: '#6d28d9' },
            ].map((a) => {
              const Icon = a.icon;
              return (
                <motion.button
                  key={a.label}
                  className="dash-action-card"
                  style={{ background: a.bg }}
                  whileHover={{ y: -4, boxShadow: '0 12px 24px rgba(15,23,42,0.12)' }}
                  whileTap={{ scale: 0.97 }}
                  type="button"
                >
                  <Icon size={24} style={{ color: a.color }} />
                  <span>{a.label}</span>
                  <ArrowRight size={16} className="dash-action-arrow" />
                </motion.button>
              );
            })}
          </div>
        </motion.section>
      </div>
    </Layout>
  );
}
