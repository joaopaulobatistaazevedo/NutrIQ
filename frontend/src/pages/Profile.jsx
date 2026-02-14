import { motion } from 'framer-motion';
import {
  Bike,
  Camera,
  Droplets,
  Flame,
  MapPin,
  Moon,
  PencilLine,
  Ruler,
  Salad,
  Sparkles,
  Target,
  TrendingUp,
  Weight,
} from 'lucide-react';
import Layout from '../components/Layout';
import '../styles/profile.css';

const fade = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  transition: { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] },
  viewport: { once: true, amount: 0.1 },
};

/* SVG circular gauge */
const Gauge = ({ value, max, color, label, unit }) => {
  const pct = Math.min((value / max) * 100, 100);
  const r = 34;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <div className="prof-gauge">
      <svg viewBox="0 0 80 80" className="prof-gauge-svg">
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
        <motion.circle
          cx="40" cy="40" r={r} fill="none"
          stroke={color} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          whileInView={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: 'easeOut' }}
          viewport={{ once: true }}
          transform="rotate(-90 40 40)"
        />
      </svg>
      <div className="prof-gauge-inner">
        <strong>{value}</strong>
        <span>{unit}</span>
      </div>
      <span className="prof-gauge-label">{label}</span>
    </div>
  );
};

export default function Profile() {
  const habits = [
    { icon: Droplets, title: 'Água', detail: '2.2L / dia', trend: '+8%', bg: '#ccfbf1', color: '#0f766e' },
    { icon: Moon, title: 'Sono', detail: '7h 20m média', trend: '+5%', bg: '#ede9fe', color: '#6d28d9' },
    { icon: Bike, title: 'Atividade', detail: '4x / semana', trend: '+12%', bg: '#fef3c7', color: '#b45309' },
    { icon: Salad, title: 'Refeições', detail: '85% do plano', trend: '+9%', bg: '#dcfce7', color: '#047857' },
  ];

  const timeline = [
    { week: 'Semana 1', text: 'Ajustar horário das refeições e hidratação.' },
    { week: 'Semana 2', text: 'Aumentar proteínas no almoço e jantar.' },
    { week: 'Semana 3', text: 'Adicionar 2 sessões curtas de movimento.' },
  ];

  return (
    <Layout>
      <div className="prof">
        {/* === DARK COVER HERO === */}
        <motion.section className="prof-cover" {...fade}>
          <div className="prof-cover-noise" />
          <div className="prof-cover-blob cover-blob-1" />
          <div className="prof-cover-blob cover-blob-2" />

          <div className="prof-cover-content">
            <div className="prof-avatar-wrap">
              <div className="prof-avatar">JS</div>
              <button className="prof-avatar-btn" type="button" aria-label="Alterar foto">
                <Camera size={14} />
              </button>
            </div>

            <div className="prof-id">
              <span className="prof-badge">Plano Premium</span>
              <h1>Joana Silva</h1>
              <p className="prof-location"><MapPin size={14} /> Porto, Portugal</p>
              <p className="prof-bio">Recomposição corporal · Foco em alimentação equilibrada</p>
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

        {/* === GAUGE ROW — circular rings === */}
        <motion.section className="prof-gauges" {...fade}>
          <Gauge value={82} max={100} color="#34d399" label="Consistência" unit="%" />
          <Gauge value={68} max={100} color="#fbbf24" label="Défice calórico" unit="%" />
          <Gauge value={74} max={100} color="#60a5fa" label="Hidratação" unit="%" />
          <Gauge value={12} max={30} color="#f472b6" label="Streak" unit="dias" />
        </motion.section>

        {/* === STATS BENTO — dark colored cells === */}
        <div className="prof-stat-bento">
          {[
            { icon: Flame, label: 'Calorias', value: '1 950', unit: 'kcal', bg: '#fee2e2', color: '#b91c1c' },
            { icon: Weight, label: 'Peso', value: '74.2', unit: 'kg', bg: '#ede9fe', color: '#6d28d9' },
            { icon: Ruler, label: 'Altura', value: '1.73', unit: 'm', bg: '#cffafe', color: '#0e7490' },
            { icon: Sparkles, label: 'Nível', value: 'Pro', unit: '', bg: '#fef3c7', color: '#b45309' },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <motion.div className="prof-stat-cell" key={s.label} style={{ background: s.bg }} {...fade}>
                <Icon size={18} style={{ color: s.color }} />
                <strong>{s.value}<span className="prof-stat-unit">{s.unit}</span></strong>
                <span>{s.label}</span>
              </motion.div>
            );
          })}
        </div>

        {/* === HABITS — dark cards row === */}
        <motion.section className="prof-habits-section" {...fade}>
          <h2>Rotina semanal</h2>
          <div className="prof-habits-grid">
            {habits.map((h) => {
              const Icon = h.icon;
              return (
                <motion.div
                  className="prof-habit-card"
                  key={h.title}
                  style={{ background: h.bg }}
                  whileHover={{ y: -4, boxShadow: '0 12px 24px rgba(15,23,42,0.12)' }}
                >
                  <Icon size={20} style={{ color: h.color }} />
                  <div className="prof-habit-body">
                    <span className="prof-habit-name">{h.title}</span>
                    <strong className="prof-habit-val">{h.detail}</strong>
                  </div>
                  <span className="prof-habit-trend" style={{ color: h.color }}>
                    <TrendingUp size={13} /> {h.trend}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </motion.section>

        {/* === TIMELINE — dark bg === */}
        <motion.section className="prof-timeline" {...fade}>
          <div className="prof-timeline-noise" />
          <h2>Roadmap pessoal</h2>
          <div className="tl-track">
            {timeline.map((t, i) => (
              <div className="tl-step" key={t.week}>
                <div className="tl-marker">
                  <span className="tl-num">{i + 1}</span>
                  {i < timeline.length - 1 && <span className="tl-line" />}
                </div>
                <div className="tl-content">
                  <h3>{t.week}</h3>
                  <p>{t.text}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.section>
      </div>
    </Layout>
  );
}
