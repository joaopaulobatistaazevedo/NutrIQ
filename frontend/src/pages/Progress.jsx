import { useMemo } from 'react';
import { BarChart3, Flame, TrendingUp, Wallet } from 'lucide-react';
import Layout from '../components/Layout';
import '../styles/progress.css';

const WEEK = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

const CALORIES = [2100, 1980, 2230, 2050, 2140, 2010, 2080];
const BUDGET = [8.2, 7.5, 9.1, 8.7, 7.9, 8.4, 7.8];

export default function Progress() {
  const summary = useMemo(() => {
    const avgCalories = Math.round(CALORIES.reduce((sum, value) => sum + value, 0) / CALORIES.length);
    const avgBudget = (BUDGET.reduce((sum, value) => sum + value, 0) / BUDGET.length).toFixed(2);
    return { avgCalories, avgBudget };
  }, []);

  return (
    <Layout>
      <div className="progress-page">
        <header className="progress-header">
          <div>
            <h1>Progresso Semanal</h1>
            <p>Resumo simples da tua evolução em calorias, consistência e custo diário.</p>
          </div>
          <div className="progress-tag">
            <BarChart3 size={16} />
            Últimos 7 dias
          </div>
        </header>

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
            <strong>+9%</strong>
            <p>Consistência</p>
          </article>
        </section>

        <section className="progress-chart-card">
          <h2>Calorias por dia</h2>
          <div className="progress-bars">
            {CALORIES.map((value, index) => {
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
                <span>{CALORIES[index]} kcal</span>
                <span>€{BUDGET[index].toFixed(2)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </Layout>
  );
}
