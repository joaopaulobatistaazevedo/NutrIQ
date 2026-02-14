import Layout from '../components/Layout';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
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
  Utensils,
  Target,
} from 'lucide-react';
import '../styles/dashboard.css';

const fade = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
  viewport: { once: true, amount: 0.1 },
};

const CalorieRing = ({ consumed, goal }) => {
  const pct = Math.min((consumed / goal) * 100, 100);
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
  const [activeMeal, setActiveMeal] = useState(0);

  const weeklyCalories = [
    { day: 'Seg', real: 2280, meta: 2350 },
    { day: 'Ter', real: 2110, meta: 2250 },
    { day: 'Qua', real: 2190, meta: 2250 },
    { day: 'Qui', real: 2050, meta: 2200 },
    { day: 'Sex', real: 2150, meta: 2200 },
    { day: 'Sáb', real: 1970, meta: 2100 },
    { day: 'Dom', real: 2060, meta: 2100 },
  ];

  const meals = [
    { period: 'Pequeno-almoço', icon: Sunrise, name: 'Aveia com Banana e Mel', time: '10 min', kcal: 320, cost: '€2.50', image: 'https://picsum.photos/seed/breakfast-nutriq/1200/800' },
    { period: 'Almoço', icon: Sun, name: 'Frango Grelhado com Arroz', time: '25 min', kcal: 580, cost: '€4.20', image: 'https://picsum.photos/seed/lunch-nutriq/1200/800' },
    { period: 'Jantar', icon: Moon, name: 'Salmão com Legumes', time: '20 min', kcal: 520, cost: '€5.80', image: 'https://picsum.photos/seed/dinner-nutriq/1200/800' },
  ];

  const activeMealData = meals[activeMeal];
  const MealIcon = activeMealData.icon;

  const macros = [
    { label: 'Proteína', value: 120, max: 150, color: '#60a5fa' },
    { label: 'Hidratos', value: 230, max: 280, color: '#fbbf24' },
    { label: 'Gordura', value: 65, max: 80, color: '#f472b6' },
  ];

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
              <span className="dash-streak-pill"><Zap size={13} /> Streak 12 dias</span>
              <h1>Boa tarde, Joana</h1>
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
              <CalorieRing consumed={1420} goal={2150} />
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

        {/* === BENTO GRID === */}
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
            <strong>€45</strong>
            <span>gasto esta semana</span>
            <div className="bento-budget-bar">
              <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: '62%' }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                viewport={{ once: true }}
              />
            </div>
            <span className="bento-budget-label">62% do orçamento</span>
          </motion.div>

          <motion.div className="bento-cell bento-score" {...fade}>
            <Target size={20} />
            <strong>82<span className="score-pct">%</span></strong>
            <span>adesão semanal</span>
          </motion.div>

          <motion.div className="bento-cell bento-meals-done" {...fade}>
            <CheckCircle2 size={20} />
            <strong>18<span className="score-sep">/</span>21</strong>
            <span>refeições concluídas</span>
          </motion.div>
        </div>

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
              <AreaChart data={weeklyCalories}>
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

        {/* === INSIGHT BANNER — gradient bg === */}
        <motion.section className="dash-insight" {...fade}>
          <div className="dash-insight-content">
            <span className="dash-insight-badge">Resumo semanal</span>
            <h2>Estás com ótimo ritmo</h2>
            <p>Custo abaixo do objetivo e consistência estável. Mais uma semana assim e fechas o ciclo com margem positiva.</p>
            <div className="dash-insight-pills">
              <span><TrendingUp size={13} /> -5% calorias</span>
              <span><Wallet size={13} /> -€12 vs meta</span>
            </div>
          </div>
          <div className="dash-insight-art">
            <img src="https://picsum.photos/seed/summary-nutriq/520/360" alt="Prato saudável" loading="lazy" className="dash-insight-image" />
          </div>
        </motion.section>

        {/* === MEALS — tabs === */}
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
              <button className="dash-meal-view">Ver receita completa <ChevronRight size={15} /></button>
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

        {/* === QUICK ACTIONS === */}
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
