import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Flame, TrendingUp, Wallet } from 'lucide-react';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
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

  return (
    <Layout>
      <div className="progress-page">
        <PageHeader
          className="progress-header"
          title="Progresso Semanal"
          subtitle={
            loadError
              ? `Ligação parcial ao backend: ${loadError}`
              : 'Resumo estimado com base no perfil do utilizador e preços importados.'
          }
          tag={(
            <div className="progress-tag">
              <BarChart3 size={16} />
              {isLoading ? 'A sincronizar...' : 'Últimos 7 dias'}
            </div>
          )}
        />

        <section className="progress-summary-grid">
          <article className="progress-summary-card">
            <span className="progress-summary-icon"><Flame size={16} /></span>
            <strong>{summary.avgCalories} kcal</strong>
            <p>Média diária</p>
          </article>

          <article className="progress-summary-card">
            <span className="progress-summary-icon"><Wallet size={16} /></span>
            <strong>€{summary.avgBudget}</strong>
            <p>Custo médio/dia</p>
          </article>

          <article className="progress-summary-card">
            <span className="progress-summary-icon"><TrendingUp size={16} /></span>
            <strong>{summary.adherence}%</strong>
            <p>Consistência</p>
          </article>
        </section>

        <section className="progress-chart-card">
          <h2>Calorias por dia</h2>
          <div className="progress-bars">
            {calories.map((value, index) => {
              const height = Math.max(26, (value / 2400) * 100);
              return (
                <div key={WEEK[index]} className="progress-bar-col">
                  <div className="progress-bar-track">
                    <div className="progress-bar-fill" style={{ height: `${height}%` }} />
                  </div>
                  <span>{WEEK[index]}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="progress-table-card">
          <h2>Detalhe diário</h2>
          <div className="progress-table">
            <div className="progress-row progress-head">
              <span>Dia</span>
              <span>Calorias</span>
              <span>Custo</span>
            </div>
            {WEEK.map((day, index) => (
              <div className="progress-row" key={day}>
                <span>{day}</span>
                <span>{calories[index]} kcal</span>
                <span>€{budget[index].toFixed(2)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </Layout>
  );
}
