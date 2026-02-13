import {
  Activity,
  Bike,
  Camera,
  CheckCircle2,
  ChevronRight,
  Droplets,
  Flame,
  MapPin,
  Moon,
  PencilLine,
  Ruler,
  Salad,
  Sparkles,
  Target,
  Weight,
} from 'lucide-react';
import Layout from '../components/Layout';
import '../styles/profile.css';

export default function Profile() {
  const goals = [
    { label: 'Consistência semanal', value: 82, color: '#10B981' },
    { label: 'Défice calórico controlado', value: 68, color: '#F59E0B' },
    { label: 'Hidratação diária', value: 74, color: '#0EA5E9' },
  ];

  const habits = [
    { icon: Droplets, title: 'Água', detail: '2.2L por dia', trend: '+8%' },
    { icon: Moon, title: 'Sono', detail: '7h 20m média', trend: '+5%' },
    { icon: Bike, title: 'Atividade', detail: '4 treinos / semana', trend: '+12%' },
    { icon: Salad, title: 'Refeições', detail: 'Plano 85% seguido', trend: '+9%' },
  ];

  const highlights = [
    { title: 'Pequeno-almoço favorito', subtitle: 'Overnight oats com frutos vermelhos' },
    { title: 'Receita com melhor adesão', subtitle: 'Bowl de frango e quinoa verde' },
    { title: 'Meta desta fase', subtitle: 'Reduzir 2.5 kg em 6 semanas' },
  ];

  const checkpoints = [
    { title: 'Semana 1', text: 'Ajustar horário das refeições e hidratação.' },
    { title: 'Semana 2', text: 'Aumentar proteínas no almoço e jantar.' },
    { title: 'Semana 3', text: 'Adicionar 2 sessões curtas de movimento.' },
  ];

  return (
    <Layout>
      <div className="profile-page">
        <section className="profile-hero-shell">
          <div className="profile-hero-main">
            <div className="profile-identity">
              <div className="profile-avatar-wrap">
                <div className="profile-avatar">JS</div>
                <button className="profile-avatar-btn" type="button" aria-label="Alterar foto">
                  <Camera size={14} />
                </button>
              </div>

              <div className="profile-main-info">
                <div className="profile-headline">
                  <span className="profile-tag">Perfil Premium</span>
                  <h1>Joana Silva</h1>
                  <p>
                    <MapPin size={14} /> Porto, Portugal · Plano focado em recomposição corporal
                  </p>
                </div>

                <div className="profile-actions">
                  <button type="button" className="profile-btn primary">
                    <PencilLine size={16} /> Editar Perfil
                  </button>
                  <button type="button" className="profile-btn ghost">
                    <Target size={16} /> Ajustar Objetivos
                  </button>
                </div>
              </div>
            </div>
          </div>

          <aside className="profile-orbit">
            <div className="orbit-ring">
              <div className="orbit-core">
                <strong>82%</strong>
                <span>Ritmo atual</span>
              </div>
            </div>

            <div className="orbit-metrics">
              <span><Flame size={14} /> 1950 kcal</span>
              <span><Weight size={14} /> 74.2 kg</span>
              <span><Ruler size={14} /> 1.73 m</span>
              <span><Sparkles size={14} /> Streak 12 dias</span>
            </div>
          </aside>
        </section>

        <section className="profile-flow">
          <header>
            <h2>Roadmap pessoal</h2>
            <button type="button" className="flow-link">
              Ver plano completo <ChevronRight size={14} />
            </button>
          </header>

          <div className="flow-track">
            {checkpoints.map((checkpoint) => (
              <article className="flow-step" key={checkpoint.title}>
                <span className="flow-dot" />
                <h3>{checkpoint.title}</h3>
                <p>{checkpoint.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="profile-mosaic">
          <article className="mosaic-block goals-block">
            <h2>Progresso dos objetivos</h2>
            <div className="goal-list">
              {goals.map((goal) => (
                <div className="goal-item" key={goal.label}>
                  <div className="goal-top">
                    <span>{goal.label}</span>
                    <strong>{goal.value}%</strong>
                  </div>
                  <div className="goal-bar">
                    <div style={{ width: `${goal.value}%`, background: goal.color }} />
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="mosaic-block habits-block">
            <h2>Rotina atual</h2>
            <div className="habits-grid">
              {habits.map((habit) => {
                const Icon = habit.icon;
                return (
                  <div className="habit-item" key={habit.title}>
                    <span className="habit-icon">
                      <Icon size={16} />
                    </span>
                    <div>
                      <p>{habit.title}</p>
                      <strong>{habit.detail}</strong>
                    </div>
                    <em>{habit.trend}</em>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="mosaic-block highlight-block">
            <h2>Destaques personalizados</h2>
            <div className="highlight-list">
              {highlights.map((item) => (
                <div className="highlight-item" key={item.title}>
                  <CheckCircle2 size={16} />
                  <div>
                    <p>{item.title}</p>
                    <strong>{item.subtitle}</strong>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="mosaic-block visuals-block">
            <h2>Inspiração da semana</h2>
            <div className="visuals-layout">
              <div className="visual-chip visual-a">
                <span>Meal Prep Mood</span>
              </div>
              <div className="visual-chip visual-b">
                <span>Smart Snacks</span>
              </div>
              <div className="visual-chip visual-c">
                <span>Quick Dinners</span>
              </div>
              <div className="visual-chip visual-d">
                <Activity size={14} />
                <span>Energia +12%</span>
              </div>
            </div>
          </article>
        </section>
      </div>
    </Layout>
  );
}
