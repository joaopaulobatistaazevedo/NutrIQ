import { motion } from 'framer-motion';
import {
  Camera,
  Droplets,
  Flame,
  MapPin,
  Moon,
  PencilLine,
  Salad,
  Target,
  TrendingUp,
  Bike,
  Clock3,
} from 'lucide-react';
import Layout from '../components/Layout';
import '../styles/profile.css';

const fade = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  transition: { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] },
  viewport: { once: true, amount: 0.1 },
};

export default function Profile() {
  const routine = [
    { icon: Droplets, title: 'Hidratação', detail: '2.2L por dia', trend: '+8%' },
    { icon: Moon, title: 'Sono', detail: '7h 20m média', trend: '+5%' },
    { icon: Bike, title: 'Atividade', detail: '4 sessões por semana', trend: '+12%' },
    { icon: Salad, title: 'Plano alimentar', detail: '85% de adesão', trend: '+9%' },
  ];

  const snapshots = [
    {
      title: 'Pré-preparo de domingo',
      image: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=1200&q=80',
    },
    {
      title: 'Almoço equilibrado',
      image: 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=1200&q=80',
    },
    {
      title: 'Jantar leve',
      image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1200&q=80',
    },
  ];

  return (
    <Layout>
      <div className="prof">
        <motion.section className="prof-cover" {...fade}>
          <div className="prof-cover-content">
            <div className="prof-avatar-wrap">
              <div className="prof-avatar">JS</div>
              <button className="prof-avatar-btn" type="button" aria-label="Alterar foto">
                <Camera size={14} />
              </button>
            </div>

            <div className="prof-id">
              <div className="prof-name-row">
                <h1>Joana Silva</h1>
                <span className="prof-streak-pill"><Flame size={12} /> Streak 12 dias</span>
              </div>
              <p className="prof-location"><MapPin size={14} /> Porto, Portugal</p>
              <p className="prof-bio">Recomposição corporal · Foco em alimentação equilibrada</p>
              <div className="prof-mini-metrics">
                <span>1950 kcal média</span>
                <span>€7.80 / dia</span>
              </div>
            </div>

            <div className="prof-ctas">
              <motion.button className="prof-btn primary" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <PencilLine size={16} /> Editar Perfil
              </motion.button>
              <button className="prof-btn outline">
                <Target size={16} /> Ajustar Objetivos
              </button>
            </div>
          </div>
        </motion.section>

        <motion.section className="prof-story" {...fade}>
          <article className="prof-story-image">
            <div className="prof-story-chip">
              <Clock3 size={14} /> meal prep 3x semana
            </div>
          </article>

          <article className="prof-story-content">
            <h2>Jornada atual</h2>
            <p>
              O foco deste mês é consistência: refeições simples, hidratação estável e rotina
              com menos fricção no dia a dia.
            </p>

            <ul className="prof-routine-list">
              {routine.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.title}>
                    <span className="prof-routine-ic"><Icon size={15} /></span>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.detail}</p>
                    </div>
                    <span className="prof-routine-trend"><TrendingUp size={12} /> {item.trend}</span>
                  </li>
                );
              })}
            </ul>
          </article>
        </motion.section>

        <motion.section className="prof-gallery" {...fade}>
          {snapshots.map((shot) => (
            <article key={shot.title} className="prof-gallery-item">
              <img src={shot.image} alt={shot.title} loading="lazy" />
              <div className="prof-gallery-overlay" />
              <h3>{shot.title}</h3>
            </article>
          ))}
        </motion.section>

        <motion.section className="prof-timeline" {...fade}>
          <h2>Próximos passos</h2>
          <div className="prof-next-steps">
            <span>+ Proteína no almoço</span>
            <span>+1 sessão curta de mobilidade</span>
            <span>Reduzir snacks ultra-processados</span>
          </div>
        </motion.section>
      </div>
    </Layout>
  );
}
