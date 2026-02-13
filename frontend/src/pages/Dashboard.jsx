// src/pages/Dashboard.jsx
import Layout from '../components/Layout';
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
  return (
    <Layout>
      <div className="dashboard">
        {/* Header */}
        <div className="dashboard-header">
          <div>
            <h1 className="dashboard-title">Olá, João</h1>
            <p className="dashboard-subtitle">Aqui está o resumo da tua semana</p>
          </div>
          <button className="btn-primary">Gerar Novo Plano</button>
        </div>

        {/* Stats Cards */}
        <div className="dashboard-stats">
          <div className="stat-card">
            <div className="stat-content">
              <p className="stat-label"><Flame className="stat-icon" /> Calorias Médias</p>
              <h3 className="stat-value">2,150</h3>
              <p className="stat-change positive"><ArrowDown className="stat-trend" /> -5% vs semana passada</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-content">
              <p className="stat-label"><Wallet className="stat-icon" /> Gasto Semanal</p>
              <h3 className="stat-value">€45.20</h3>
              <p className="stat-change positive"><ArrowDown className="stat-trend" /> -€12 vs objetivo</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-content">
              <p className="stat-label"><CheckCircle2 className="stat-icon" /> Refeições Completas</p>
              <h3 className="stat-value">18/21</h3>
              <p className="stat-change"><ArrowRight className="stat-trend" /> 86% esta semana</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-content">
              <p className="stat-label"><TrendingUp className="stat-icon" /> Streak</p>
              <h3 className="stat-value">12 dias</h3>
              <p className="stat-change positive"><TrendingUp className="stat-trend" /> Novo recorde!</p>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="dashboard-section">
          <h2 className="section-title">Ações Rápidas</h2>
          <div className="quick-actions">
            <button className="action-card">
              <CalendarDays className="action-icon" />
              <span className="action-label">Ver Plano Semanal</span>
            </button>
            <button className="action-card">
              <ShoppingCart className="action-icon" />
              <span className="action-label">Lista de Compras</span>
            </button>
            <button className="action-card">
              <BookOpen className="action-icon" />
              <span className="action-label">Explorar Receitas</span>
            </button>
            <button className="action-card">
              <BarChart3 className="action-icon" />
              <span className="action-label">Ver Progresso</span>
            </button>
          </div>
        </div>

        {/* Today's Meals */}
        <div className="dashboard-section">
          <h2 className="section-title">Refeições de Hoje</h2>
          <div className="meals-today">
            <div className="meal-card">
              <div className="meal-time">
                <Sunrise className="meal-icon" />
                <span className="meal-label">Pequeno-almoço</span>
              </div>
              <h4 className="meal-name">Aveia com Banana e Mel</h4>
              <div className="meal-stats">
                <span><Clock3 className="meal-stat-icon" /> 10 min</span>
                <span>320 cal</span>
                <span>€2.50</span>
              </div>
              <button className="meal-action">Ver Receita <ArrowRight className="meal-action-icon" /></button>
            </div>

            <div className="meal-card">
              <div className="meal-time">
                <Sun className="meal-icon" />
                <span className="meal-label">Almoço</span>
              </div>
              <h4 className="meal-name">Frango Grelhado com Arroz</h4>
              <div className="meal-stats">
                <span><Clock3 className="meal-stat-icon" /> 25 min</span>
                <span>580 cal</span>
                <span>€4.20</span>
              </div>
              <button className="meal-action">Ver Receita <ArrowRight className="meal-action-icon" /></button>
            </div>

            <div className="meal-card">
              <div className="meal-time">
                <Moon className="meal-icon" />
                <span className="meal-label">Jantar</span>
              </div>
              <h4 className="meal-name">Salmão com Legumes</h4>
              <div className="meal-stats">
                <span><Clock3 className="meal-stat-icon" /> 20 min</span>
                <span>520 cal</span>
                <span>€5.80</span>
              </div>
              <button className="meal-action">Ver Receita <ArrowRight className="meal-action-icon" /></button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}