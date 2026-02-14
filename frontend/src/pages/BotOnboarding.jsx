import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { HeartHandshake, ArrowRight } from 'lucide-react';
import Dashboard from './Dashboard';
import { PROFILE_KEY } from '../constants/storageKeys';
import { setAuthenticated } from '../utils/authSession';
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
  {
    key: 'goal',
    label: 'Qual é o teu objetivo principal neste momento?',
    type: 'options',
    options: ['Perder peso', 'Ganhar peso', 'Manter peso', 'Ganhar massa muscular'],
  },
];

function calculateBmi(weight, heightCm) {
  const weightValue = Number.parseFloat(weight);
  const heightValue = Number.parseFloat(heightCm);

  if (!Number.isFinite(weightValue) || !Number.isFinite(heightValue) || heightValue <= 0) {
    return null;
  }

  const heightM = heightValue / 100;
  return weightValue / (heightM * heightM);
}

function getGoalGuidance(profile) {
  const bmi = calculateBmi(profile.weight, profile.height);
  if (!bmi || !profile.goal) {
    return null;
  }

  if (bmi >= 30 && profile.goal === 'Ganhar peso') {
    return 'Com base nos dados que partilhaste, talvez faça mais sentido focar manutenção, recomposição corporal ou perda gradual. Se quiseres, posso ajudar-te com um plano equilibrado.';
  }

  if (bmi < 18.5 && profile.goal === 'Perder peso') {
    return 'Com base nos teus dados, perder peso pode não ser o foco mais adequado agora. Podemos priorizar ganho de força, energia e hábitos consistentes.';
  }

  return null;
}

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
    goal: '',
  });
  const [stepIndex, setStepIndex] = useState(0);
  const [input, setInput] = useState('');
  const [isCompleted, setIsCompleted] = useState(false);
  const [isIntroStep, setIsIntroStep] = useState(true);

  const totalIndicators = STEPS.length + 1;
  const activeIndicator = isCompleted ? totalIndicators - 1 : isIntroStep ? 0 : stepIndex + 1;

  const currentStep = STEPS[stepIndex];
  const currentValue = profile[currentStep?.key] || '';
  const goalGuidance = useMemo(() => getGoalGuidance(profile), [profile]);

  const advanceStep = (value) => {
    const cleanValue = String(value).trim();
    if (!cleanValue || !currentStep) {
      return;
    }

    const nextProfile = { ...profile, [currentStep.key]: cleanValue };
    const isLastStep = stepIndex === STEPS.length - 1;

    setProfile(nextProfile);
    setInput('');

    if (isLastStep) {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(nextProfile));
      setAuthenticated(true);
      setIsCompleted(true);
      return;
    }

    setStepIndex((previous) => previous + 1);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    advanceStep(input);
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
                          onClick={() => advanceStep(option)}
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
                      required
                    />
                  )}
                </label>
              </div>

              {currentStep.type !== 'options' && (
                <button type="submit" className="bot-submit-btn">
                  Continuar <ArrowRight size={16} />
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
              {goalGuidance ? (
                <p className="bot-guidance-note" role="status" aria-live="polite">{goalGuidance}</p>
              ) : null}
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
