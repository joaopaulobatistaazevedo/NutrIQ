// src/pages/Dashboard.jsx
import Layout from '../components/Layout';
import { motion } from 'framer-motion';
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
  ArrowDown,
  ArrowRight,
  Clock3,
  Sunrise,
  Sun,
  Moon,
} from 'lucide-react';
import '../styles/dashboard.css';

export default function Dashboard() {
  const fadeUp = {
    initial: { opacity: 0, y: 14 },
    whileInView: { opacity: 1, y: 0 },
    transition: { duration: 0.35, ease: 'easeOut' },
    viewport: { once: true, amount: 0.2 },
  };

  const metrics = [
    {
      label: 'Calorias médias',
      value: '2,150',
      icon: Flame,
      trend: '-5% vs semana passada',
      trendType: 'positive',
    },
    {
      label: 'Gasto semanal',
      value: '€45.20',
      icon: Wallet,
      trend: '-€12 vs objetivo',
      trendType: 'positive',
    },
    {
      label: 'Refeições completas',
      value: '18/21',
      icon: CheckCircle2,
      trend: '86% esta semana',
      trendType: 'neutral',
    },
    {
      label: 'Streak',
      value: '12 dias',
      icon: TrendingUp,
      trend: 'Novo recorde!',
      trendType: 'positive',
    },
  ];

  const actions = [
    { label: 'Ver Plano Semanal', icon: CalendarDays },
    { label: 'Lista de Compras', icon: ShoppingCart },
    { label: 'Explorar Receitas', icon: BookOpen },
    { label: 'Ver Progresso', icon: BarChart3 },
  ];

  const meals = [
    {
      period: 'Pequeno-almoço',
      icon: Sunrise,
      name: 'Aveia com Banana e Mel',
      time: '10 min',
      calories: '320 cal',
      cost: '€2.50',
    },
    {
      period: 'Almoço',
      icon: Sun,
      name: 'Frango Grelhado com Arroz',
      time: '25 min',
      calories: '580 cal',
      cost: '€4.20',
    },
    {
      period: 'Jantar',
      icon: Moon,
      name: 'Salmão com Legumes',
      time: '20 min',
      calories: '520 cal',
      cost: '€5.80',
    },
  ];

  const weeklyCalories = [
    { day: 'Seg', calories: 2280, budget: 2350 },
    { day: 'Ter', calories: 2110, budget: 2250 },
    { day: 'Qua', calories: 2190, budget: 2250 },
    { day: 'Qui', calories: 2050, budget: 2200 },
    { day: 'Sex', calories: 2150, budget: 2200 },
    { day: 'Sáb', calories: 1970, budget: 2100 },
    { day: 'Dom', calories: 2060, budget: 2100 },
  ];

  return (
    <Layout>
      <div className="dashboard">
        <motion.section className="dashboard-hero" {...fadeUp}>
          <div className="dashboard-hero-main">
            <h1 className="dashboard-title">Olá</h1>
            <p className="dashboard-subtitle">Aqui está o resumo da tua semana</p>

            <div className="dashboard-hero-tags">
              <span>Objetivo ativo: Definição</span>
              <span>Foco: Consistência + hidratação</span>
            </div>
          </div>

          <div className="dashboard-hero-side">
            <div className="focus-meter">
              <strong>82%</strong>
              <span>aderência semanal</span>
            </div>
            <button className="btn-primary">Gerar Novo Plano</button>
          </div>
        </motion.section>

        <motion.section className="dashboard-bento" {...fadeUp}>
          <motion.article className="dashboard-highlight" whileHover={{ y: -2 }} transition={{ duration: 0.2 }}>
            <div className="highlight-head">
              <span className="highlight-kicker">Resumo Inteligente</span>
              <h2>Estás com ótimo ritmo esta semana</h2>
              <p>
                Manténs o custo abaixo do objetivo e a consistência das refeições está estável.
                Se continuares assim, fechas o ciclo com margem positiva.
              </p>
            </div>

            <div className="highlight-actions">
              {actions.slice(0, 2).map((action) => {
                const Icon = action.icon;
                return (
                  <button className="highlight-action" key={action.label}>
                    <Icon className="action-icon" />
                    <span>{action.label}</span>
                  </button>
                );
              })}
            </div>
          </motion.article>

          <div className="dashboard-insights">
            <article className="dashboard-chart-card">
              <div className="chart-head">
                <h3>Calorias vs objetivo</h3>
                <span>Últimos 7 dias</span>
              </div>

              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={weeklyCalories}>
                    <defs>
                      <linearGradient id="calorieGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10B981" stopOpacity={0.38} />
                        <stop offset="100%" stopColor="#10B981" stopOpacity={0.04} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="day" tick={{ fill: '#6B7280', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
                    <Tooltip
                      cursor={{ stroke: '#10B981', strokeWidth: 1 }}
                      contentStyle={{ borderRadius: '10px', border: '1px solid #D1FAE5' }}
                    />
                    <Area type="monotone" dataKey="budget" stroke="#9CA3AF" strokeWidth={2} fill="transparent" />
                    <Area type="monotone" dataKey="calories" stroke="#10B981" strokeWidth={2.5} fill="url(#calorieGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </article>

            <div className="dashboard-metrics-grid">
            {metrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <motion.article
                  className="metric-tile"
                  key={metric.label}
                  whileHover={{ y: -2 }}
                  transition={{ duration: 0.2 }}
                >
                  <p className="stat-label"><Icon className="stat-icon" /> {metric.label}</p>
                  <h3 className="stat-value">{metric.value}</h3>
                  <p className={`stat-change ${metric.trendType === 'positive' ? 'positive' : ''}`}>
                    {metric.trendType === 'positive' ? <ArrowDown className="stat-trend" /> : <ArrowRight className="stat-trend" />}
                    {metric.trend}
                  </p>
                </motion.article>
              );
            })}
            </div>
          </div>
        </motion.section>

        <motion.section className="dashboard-section" {...fadeUp}>
          <h2 className="section-title">Ações Rápidas</h2>
          <div className="quick-actions modern-actions">
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <motion.button className="action-card" key={action.label} whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}>
                  <Icon className="action-icon" />
                  <span className="action-label">{action.label}</span>
                </motion.button>
              );
            })}
          </div>
        </motion.section>

        <motion.section className="dashboard-section" {...fadeUp}>
          <h2 className="section-title">Refeições de Hoje</h2>
          <div className="meals-today">
            {meals.map((meal) => {
              const Icon = meal.icon;
              return (
                <motion.article className="meal-card" key={meal.period} whileHover={{ y: -2 }} transition={{ duration: 0.2 }}>
                  <div className="meal-time">
                    <Icon className="meal-icon" />
                    <span className="meal-label">{meal.period}</span>
                  </div>
                  <h4 className="meal-name">{meal.name}</h4>
                  <div className="meal-stats">
                    <span><Clock3 className="meal-stat-icon" /> {meal.time}</span>
                    <span>{meal.calories}</span>
                    <span>{meal.cost}</span>
                  </div>
                  <button className="meal-action">Ver Receita <ArrowRight className="meal-action-icon" /></button>
                </motion.article>
              );
            })}
          </div>
        </motion.section>
      </div>
    </Layout>
  );
}