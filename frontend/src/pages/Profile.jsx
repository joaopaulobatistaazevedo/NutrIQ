import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
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
import { PROFILE_KEY } from '../constants/storageKeys';
import { fetchMyProfile, updateMyProfile } from '../services/userService';
import { getAuthSession } from '../utils/authSession';
import '../styles/profile.css';

const fade = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  transition: { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] },
  viewport: { once: true, amount: 0.1 },
};

const GOAL_LABELS = {
  LOSE_WEIGHT: 'Perder peso',
  MAINTAIN: 'Manter peso',
  BULK: 'Ganhar massa',
};

const GOAL_BIOS = {
  LOSE_WEIGHT: 'Défice calórico com foco em refeições densas em nutrientes',
  MAINTAIN: 'Consistência alimentar para manter composição corporal',
  BULK: 'Superávit controlado para ganhar massa muscular',
};

function parseLocalProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function toIntOrEmpty(value) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(parsed) ? parsed : '';
}

function toFloatOrEmpty(value) {
  const parsed = Number.parseFloat(String(value ?? '').trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : '';
}

function toIntOrNull(value) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function toFloatOrNull(value) {
  const parsed = Number.parseFloat(String(value ?? '').trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function mapSexToUi(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'M') return 'Masculino';
  if (normalized === 'F') return 'Feminino';
  if (normalized === 'OTHER') return 'Outro';
  return '';
}

function mapApiToForm(apiUser, locationFallback) {
  const profile = apiUser?.profile || {};

  return {
    name: String(apiUser?.name || '').trim(),
    email: String(apiUser?.email || '').trim(),
    location: String(locationFallback || '').trim(),
    age: toIntOrEmpty(profile?.age),
    sex: String(profile?.sex || '').trim(),
    heightCm: toIntOrEmpty(profile?.heightCm),
    weightKg: toFloatOrEmpty(profile?.weightKg),
    goal: String(profile?.goal || '').trim(),
    maxWeeklyBudget: toFloatOrEmpty(profile?.budgetWeekly),
    dailyCalories: toIntOrEmpty(profile?.dailyCalories),
  };
}

function persistLocalProfile(formState) {
  const payload = {
    username: String(formState?.name || '').trim(),
    location: String(formState?.location || '').trim(),
    sex: mapSexToUi(formState?.sex),
    weight: formState?.weightKg === '' ? '' : String(formState.weightKg),
    height: formState?.heightCm === '' ? '' : String(formState.heightCm),
    age: formState?.age === '' ? '' : String(formState.age),
  };

  localStorage.setItem(PROFILE_KEY, JSON.stringify(payload));
}

export default function Profile() {
  const [formState, setFormState] = useState({
    name: '',
    email: '',
    location: '',
    age: '',
    sex: '',
    heightCm: '',
    weightKg: '',
    goal: '',
    maxWeeklyBudget: '',
    dailyCalories: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveStatus, setSaveStatus] = useState('');

  const authSession = getAuthSession();
  const token = authSession?.token || '';

  useEffect(() => {
    let isMounted = true;

    const run = async () => {
      setIsLoading(true);
      setLoadError('');
      setSaveStatus('');

      const localProfile = parseLocalProfile();
      const locationFallback = String(localProfile?.location || '').trim();

      if (!token) {
        if (isMounted) {
          setLoadError('Sessão inválida. Faz login novamente.');
          setIsLoading(false);
        }
        return;
      }

      try {
        const apiUser = await fetchMyProfile(token);
        if (!isMounted) {
          return;
        }

        const mapped = mapApiToForm(apiUser, locationFallback);
        setFormState(mapped);
        persistLocalProfile(mapped);
      } catch (error) {
        if (isMounted) {
          setLoadError(error.message || 'Não foi possível carregar o perfil.');
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
  }, [token]);

  const routine = useMemo(() => {
    const weight = toFloatOrNull(formState.weightKg);
    const hydration = weight ? `${Math.max(1.8, weight * 0.035).toFixed(1)}L por dia` : '2.2L por dia';
    const goalLabel = GOAL_LABELS[formState.goal] || 'Definir objetivo';

    return [
      { icon: Droplets, title: 'Hidratação', detail: hydration, trend: '+8%' },
      { icon: Moon, title: 'Sono', detail: '7h 20m média', trend: '+5%' },
      { icon: Bike, title: 'Atividade', detail: '4 sessões por semana', trend: '+12%' },
      { icon: Salad, title: 'Plano alimentar', detail: goalLabel, trend: '+9%' },
    ];
  }, [formState.goal, formState.weightKg]);

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

  const initials = useMemo(() => {
    const parts = String(formState.name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) {
      return 'U';
    }
    return parts
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }, [formState.name]);

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setFormState((previous) => ({
      ...previous,
      [name]: value,
    }));
    setSaveStatus('');
  };

  const scrollToProfileForm = () => {
    const target = document.getElementById('profile-edit-form');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    if (!token) {
      setSaveStatus('Sessão inválida. Faz login novamente.');
      return;
    }

    setIsSaving(true);
    setSaveStatus('');

    const payload = {};
    const age = toIntOrNull(formState.age);
    const heightCm = toIntOrNull(formState.heightCm);
    const weightKg = toFloatOrNull(formState.weightKg);
    const budget = toFloatOrNull(formState.maxWeeklyBudget);
    const sex = String(formState.sex || '').trim().toUpperCase();
    const goal = String(formState.goal || '').trim().toUpperCase();

    if (age !== null) payload.age = age;
    if (heightCm !== null) payload.heightCm = heightCm;
    if (weightKg !== null) payload.weightKg = weightKg;
    if (budget !== null) payload.maxWeeklyBudget = budget;
    if (sex) payload.sex = sex;
    if (goal) payload.goal = goal;

    try {
      await updateMyProfile(token, payload);
      const apiUser = await fetchMyProfile(token);
      const mapped = mapApiToForm(apiUser, formState.location);
      setFormState(mapped);
      persistLocalProfile(mapped);
      setSaveStatus('Perfil atualizado com sucesso.');
    } catch (error) {
      setSaveStatus(error.message || 'Não foi possível guardar o perfil.');
    } finally {
      setIsSaving(false);
    }
  };

  const dailyCalories = toIntOrNull(formState.dailyCalories);
  const weeklyBudget = toFloatOrNull(formState.maxWeeklyBudget);
  const goalLabel = GOAL_LABELS[formState.goal] || 'Objetivo não definido';
  const profileBio = GOAL_BIOS[formState.goal] || 'Completa o teu perfil para recomendações melhores';

  return (
    <Layout>
      <div className="prof">
        <motion.section className="prof-cover" {...fade}>
          <div className="prof-cover-content">
            <div className="prof-avatar-wrap">
              <div className="prof-avatar">{initials}</div>
              <button className="prof-avatar-btn" type="button" aria-label="Alterar foto">
                <Camera size={14} />
              </button>
            </div>

            <div className="prof-id">
              <div className="prof-name-row">
                <h1>{formState.name || 'Utilizador'}</h1>
                <span className="prof-streak-pill"><Flame size={12} /> Streak 12 dias</span>
              </div>
              <p className="prof-location">
                <MapPin size={14} />
                {' '}
                {formState.location || 'Localização não definida'}
              </p>
              <p className="prof-bio">{profileBio}</p>
              <div className="prof-mini-metrics">
                <span>{dailyCalories ? `${dailyCalories} kcal alvo` : 'Sem calorias definidas'}</span>
                <span>
                  {weeklyBudget !== null
                    ? `${weeklyBudget.toFixed(2)} EUR / semana`
                    : 'Sem orçamento semanal'}
                </span>
              </div>
            </div>

            <div className="prof-ctas">
              <motion.button
                className="prof-btn primary"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                type="button"
                onClick={scrollToProfileForm}
              >
                <PencilLine size={16} /> Editar Perfil
              </motion.button>
              <button className="prof-btn outline" type="button" onClick={scrollToProfileForm}>
                <Target size={16} /> {goalLabel}
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
              O foco deste mês é consistência. Estes indicadores são ajustados com base no teu
              perfil real guardado no backend.
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
          <h2>Dados do perfil</h2>
          {isLoading ? <p className="prof-status">A carregar perfil...</p> : null}
          {loadError ? <p className="prof-status prof-status-error">{loadError}</p> : null}

          {!isLoading && !loadError ? (
            <form id="profile-edit-form" className="prof-edit-form" onSubmit={saveProfile}>
              <div className="prof-edit-grid">
                <label className="prof-field">
                  Nome
                  <input type="text" value={formState.name} disabled />
                </label>

                <label className="prof-field">
                  Email
                  <input type="text" value={formState.email} disabled />
                </label>

                <label className="prof-field">
                  Localização (local)
                  <input
                    type="text"
                    name="location"
                    value={formState.location}
                    onChange={handleFieldChange}
                    placeholder="Cidade / País"
                  />
                </label>

                <label className="prof-field">
                  Idade
                  <input
                    type="number"
                    name="age"
                    min="12"
                    max="100"
                    value={formState.age}
                    onChange={handleFieldChange}
                    placeholder="Ex: 28"
                  />
                </label>

                <label className="prof-field">
                  Sexo
                  <select name="sex" value={formState.sex} onChange={handleFieldChange}>
                    <option value="">Selecionar</option>
                    <option value="M">Masculino</option>
                    <option value="F">Feminino</option>
                    <option value="OTHER">Outro</option>
                  </select>
                </label>

                <label className="prof-field">
                  Altura (cm)
                  <input
                    type="number"
                    name="heightCm"
                    min="100"
                    max="250"
                    value={formState.heightCm}
                    onChange={handleFieldChange}
                    placeholder="Ex: 176"
                  />
                </label>

                <label className="prof-field">
                  Peso (kg)
                  <input
                    type="number"
                    name="weightKg"
                    min="25"
                    max="300"
                    step="0.1"
                    value={formState.weightKg}
                    onChange={handleFieldChange}
                    placeholder="Ex: 72.5"
                  />
                </label>

                <label className="prof-field">
                  Objetivo
                  <select name="goal" value={formState.goal} onChange={handleFieldChange}>
                    <option value="">Selecionar</option>
                    <option value="LOSE_WEIGHT">Perder peso</option>
                    <option value="MAINTAIN">Manter peso</option>
                    <option value="BULK">Ganhar massa</option>
                  </select>
                </label>

                <label className="prof-field">
                  Orçamento semanal (EUR)
                  <input
                    type="number"
                    name="maxWeeklyBudget"
                    min="0"
                    step="0.01"
                    value={formState.maxWeeklyBudget}
                    onChange={handleFieldChange}
                    placeholder="Ex: 45"
                  />
                </label>

                <label className="prof-field">
                  Calorias diárias (calculado)
                  <input type="text" value={dailyCalories || 'Sem cálculo'} disabled />
                </label>
              </div>

              <div className="prof-edit-actions">
                <button type="submit" className="prof-btn primary" disabled={isSaving}>
                  {isSaving ? 'A guardar...' : 'Guardar alterações'}
                </button>
              </div>
              {saveStatus ? (
                <p
                  className={`prof-status ${
                    saveStatus.includes('sucesso') ? 'prof-status-success' : 'prof-status-error'
                  }`}
                >
                  {saveStatus}
                </p>
              ) : null}
            </form>
          ) : null}
        </motion.section>
      </div>
    </Layout>
  );
}
