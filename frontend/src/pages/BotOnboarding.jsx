import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { HeartHandshake, ArrowRight } from 'lucide-react';
import Dashboard from './Dashboard';
import { PROFILE_KEY } from '../constants/storageKeys';
import { getAuthSession, setAuthenticated } from '../utils/authSession';
import { updateMyProfile } from '../services/userService';
import '../styles/bot-onboarding.css';

const STEPS = [
  {
    key: 'username',
    label: 'Como queres que eu te trate?',
    placeholder: 'Como queres ser tratado',
    type: 'text',
  },
  {
    key: 'location',
    label: 'Qual é a tua localização?',
    placeholder: 'Cidade / País',
    type: 'text',
  },
  {
    key: 'sex',
    label: 'Qual é o teu sexo?',
    type: 'options',
    options: ['Masculino', 'Feminino', 'Outro'],
  },
  {
    key: 'weight',
    label: 'Qual é o teu peso atual (kg)?',
    placeholder: 'Ex: 74',
    type: 'number',
  },
  {
    key: 'height',
    label: 'Qual é a tua altura (cm)?',
    placeholder: 'Ex: 176',
    type: 'number',
  },
  {
    key: 'age',
    label: 'Qual é a tua idade?',
    placeholder: 'Ex: 28',
    type: 'number',
  },
];

const mapSexToBackend = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'masculino') return 'M';
  if (normalized === 'feminino') return 'F';
  if (normalized === 'outro') return 'OTHER';
  return null;
};

const toIntOrNull = (value) => {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const toFloatOrNull = (value) => {
  const parsed = Number.parseFloat(String(value || '').trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

export default function BotOnboarding() {
  const navigate = useNavigate();
  const location = useLocation();

  const firstName = useMemo(() => {
    const sourceName = location.state?.name?.trim();
    if (!sourceName) {
      return 'campeão';
    }
    return sourceName.split(' ')[0];
  }, [location.state?.name]);

  const [profile, setProfile] = useState({
    username: '',
    location: '',
    sex: '',
    weight: '',
    height: '',
    age: '',
  });
  const [stepIndex, setStepIndex] = useState(0);
  const [input, setInput] = useState('');
  const [isCompleted, setIsCompleted] = useState(false);
  const [isIntroStep, setIsIntroStep] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [saveError, setSaveError] = useState('');

  const totalIndicators = STEPS.length + 1;
  const activeIndicator = isCompleted ? totalIndicators - 1 : isIntroStep ? 0 : stepIndex + 1;

  const currentStep = STEPS[stepIndex];
  const currentValue = profile[currentStep?.key] || '';

  const saveProfileToBackend = async (nextProfile) => {
    const session = getAuthSession();
    const token = session?.token;
    if (!token) {
      return;
    }

    const payload = {};

    const age = toIntOrNull(nextProfile.age);
    if (age !== null) payload.age = age;

    const heightCm = toIntOrNull(nextProfile.height);
    if (heightCm !== null) payload.heightCm = heightCm;

    const weightKg = toFloatOrNull(nextProfile.weight);
    if (weightKg !== null) payload.weightKg = weightKg;

    const sex = mapSexToBackend(nextProfile.sex);
    if (sex) payload.sex = sex;

    // Goal default para permitir cálculo de calorias quando possível.
    payload.goal = 'MAINTAIN';

    await updateMyProfile(token, payload);
  };

  const advanceStep = async (value) => {
    if (isSavingProfile) {
      return;
    }

    const cleanValue = String(value).trim();
    if (!cleanValue || !currentStep) {
      return;
    }

    setSaveError('');

    const nextProfile = { ...profile, [currentStep.key]: cleanValue };
    const isLastStep = stepIndex === STEPS.length - 1;
    setProfile(nextProfile);

    if (isLastStep) {
      setIsSavingProfile(true);
      try {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(nextProfile));
        await saveProfileToBackend(nextProfile);
        setAuthenticated(true);
        setInput('');
        setIsCompleted(true);
      } catch (error) {
        setSaveError(error.message || 'Não foi possível guardar o perfil.');
      } finally {
        setIsSavingProfile(false);
      }
      return;
    }

    setInput('');
    setStepIndex((previous) => previous + 1);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    void advanceStep(input);
  };

  return (
    <div className="bot-onboarding-page">
      <div className="bot-dashboard-preview" aria-hidden="true">
        <Dashboard />
      </div>
      <div className="bot-onboarding-backdrop" />

      <section className="bot-onboarding-card" aria-label="Onboarding NutriBot">
        <div className="bot-circle" aria-hidden="true">
          <HeartHandshake size={24} />
        </div>

        <div className="bot-onboarding-content">
          <h1>NutriBot</h1>
          <p className="bot-intro">
            Olá {firstName}. Eu vou acompanhar a tua evolução de forma personalizada. Preenche
            os teus dados iniciais para começarmos juntos.
          </p>

          <div className="bot-progress-wrap" aria-label="Progresso do onboarding">
            <div className="bot-step-dots" aria-hidden="true">
              {Array.from({ length: totalIndicators }).map((_, index) => (
                <span
                  key={`step-dot-${index}`}
                  className={`bot-step-dot ${index <= activeIndicator ? 'active' : ''}`}
                />
              ))}
            </div>
          </div>

          {isIntroStep ? (
            <div className="bot-intro-card">
              <h2>Olá, eu sou o NutriBot</h2>
              <p>
                Sou o teu companheiro pessoal dentro do NutrIQ. Vou conhecer o teu perfil e ajudar-te
                a evoluir de forma simples, consistente e personalizada.
              </p>
              <button type="button" className="bot-submit-btn" onClick={() => setIsIntroStep(false)}>
                Seguinte <ArrowRight size={16} />
              </button>
            </div>
          ) : !isCompleted ? (
            <form className="bot-profile-form" onSubmit={handleSubmit}>
              <div className="bot-step-field" key={currentStep.key}>
                <label>
                  {currentStep.label}

                  {currentStep.type === 'options' ? (
                    <div className="bot-options-grid">
                      {currentStep.options.map((option) => (
                        <button
                          key={option}
                          type="button"
                          className={`bot-option-btn ${currentValue === option ? 'active' : ''}`}
                          onClick={() => { void advanceStep(option); }}
                          disabled={isSavingProfile}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <input
                      type={currentStep.type}
                      value={input}
                      min={currentStep.key === 'weight' ? 25 : currentStep.key === 'height' ? 100 : currentStep.key === 'age' ? 12 : undefined}
                      max={currentStep.key === 'weight' ? 300 : currentStep.key === 'height' ? 250 : currentStep.key === 'age' ? 100 : undefined}
                      onChange={(event) => setInput(event.target.value)}
                      placeholder={currentStep.placeholder}
                      disabled={isSavingProfile}
                      required
                    />
                  )}
                </label>
              </div>

              {saveError && (
                <p className="bot-onboarding-error" role="alert">{saveError}</p>
              )}

              {currentStep.type !== 'options' && (
                <button type="submit" className="bot-submit-btn" disabled={isSavingProfile}>
                  {isSavingProfile ? 'A guardar perfil...' : 'Continuar'} {!isSavingProfile && <ArrowRight size={16} />}
                </button>
              )}
            </form>
          ) : (
            <div className="bot-welcome-card">
              <h2>Bem-vindo ao NutrIQ</h2>
              <p>
                Está tudo pronto. A partir de agora eu vou acompanhar os teus próximos passos,
                ajustar recomendações e manter-te motivado todos os dias.
              </p>
              <button type="button" className="bot-submit-btn" onClick={() => navigate('/dashboard')}>
                Entrar no dashboard
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
