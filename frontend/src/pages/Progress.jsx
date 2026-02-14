import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Flame, TrendingUp, Wallet } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList } from 'recharts';
import Layout from '../components/Layout';
import { fetchMyProfile } from '../services/userService';
import { listLatestPrices } from '../services/priceService';
import { getAuthSession } from '../utils/authSession';
import '../styles/progress.css';

const WEEK = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

const CAL_OFFSETS = [0.02, -0.04, 0.03, -0.02, 0.01, -0.05, -0.03];
const COST_OFFSETS = [0.08, -0.05, 0.12, 0.04, -0.02, 0.06, -0.04];

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

  return Array.from(cheapestByIngredient.values()).reduce((sum, value) => sum + value, 0);
}

function buildCalorieSeries(goal) {
  return CAL_OFFSETS.map((offset) => Math.max(1200, Math.round(goal * (1 + offset))));
}

function buildCostSeries(baseValue) {
  return COST_OFFSETS.map((offset) => Math.max(0, Number((baseValue * (1 + offset)).toFixed(2))));
}

function toNumberOr(defaultValue, value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export default function Progress() {
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [calories, setCalories] = useState(buildCalorieSeries(2100));
  const [budget, setBudget] = useState(buildCostSeries(8));

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
        const dailyGoal = Math.max(1200, Math.round(toNumberOr(2100, profile?.dailyCalories)));
        const weeklyBudget = Math.max(0, toNumberOr(0, profile?.budgetWeekly));
        const estimatedWeekSpend = estimateWeeklySpend(prices);
        const dailyCostBase =
          estimatedWeekSpend > 0
            ? estimatedWeekSpend / 7
            : weeklyBudget > 0
              ? weeklyBudget / 7
              : 8;

        setCalories(buildCalorieSeries(dailyGoal));
        setBudget(buildCostSeries(dailyCostBase));
      } catch (error) {
        if (isMounted) {
          setLoadError(error.message || 'Não foi possível carregar o progresso.');
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

  const summary = useMemo(() => {
    const avgCalories = Math.round(calories.reduce((sum, value) => sum + value, 0) / calories.length);
    const avgBudget = (budget.reduce((sum, value) => sum + value, 0) / budget.length).toFixed(2);

    const adherence =
      100 -
      Math.min(
        40,
        Math.round(
          (calories.reduce((sum, value) => sum + Math.abs(value - avgCalories), 0) /
            (calories.length * Math.max(avgCalories, 1))) *
            100,
        ),
      );

    return {
      avgCalories,
      avgBudget,
      adherence,
    };
  }, [budget, calories]);

  const chartData = useMemo(
    () =>
      WEEK.map((day, index) => ({
        day,
        calories: calories[index],
        priceLabel: `€${budget[index].toFixed(2)}`,
      })),
    [budget, calories],
  );

  return (
    <Layout>
      <div className="page">
        <div className="container-xl">
          <div className="progress-page">
            <header className="progress-header page-header d-print-none">
              <div>
                <h1 className="page-title">Progresso Semanal</h1>
                <p>Resumo simples da tua evolução em calorias, consistência e custo diário.</p>
              </div>
              <div className="progress-tag badge bg-primary-lt text-primary">
                <BarChart3 size={16} />
                {isLoading ? 'A sincronizar...' : 'Últimos 7 dias'}
              </div>
            </header>

            <section className="progress-summary-grid">
              <article className="progress-summary-card card">
                <span className="progress-summary-icon"><Flame size={16} /></span>
                <strong>{summary.avgCalories} kcal</strong>
                <p>Média diária</p>
              </article>

              <article className="progress-summary-card card">
                <span className="progress-summary-icon"><Wallet size={16} /></span>
                <strong>€{summary.avgBudget}</strong>
                <p>Custo médio/dia</p>
              </article>

              <article className="progress-summary-card card">
                <span className="progress-summary-icon"><TrendingUp size={16} /></span>
                <strong>{summary.adherence > 0 ? '+' : ''}{summary.adherence}%</strong>
                <p>Consistência</p>
              </article>
            </section>

            <section className="progress-combined-card card">
              <div className="progress-combined-block">
                <h2>Calorias por dia</h2>
                <div className="progress-merged-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 28, right: 14, left: 4, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="#dce5f0" />
                      <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        width={44}
                        tick={{ fill: '#90a0b6', fontSize: 12 }}
                        tickFormatter={(value) => `${value}`}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(34, 204, 154, 0.08)' }}
                        contentStyle={{ borderRadius: 12, border: '1px solid #d4deeb', background: '#f9fbfd' }}
                        labelStyle={{ color: '#1e293b' }}
                        formatter={(value) => [`${value} kcal`, 'Calorias']}
                      />
                      <Bar dataKey="calories" fill="#22cc9a" radius={[8, 8, 0, 0]} maxBarSize={52}>
                        <LabelList dataKey="priceLabel" position="top" fill="#334155" fontSize={12} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {loadError ? <p className="progress-load-note">{loadError}</p> : null}
              </div>
            </section>
          </div>
        </div>
      </div>
    </Layout>
  );
}
