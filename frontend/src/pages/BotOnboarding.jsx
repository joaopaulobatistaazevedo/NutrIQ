import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { HeartHandshake, ArrowRight } from 'lucide-react';
import Dashboard from './Dashboard';
import '../styles/bot-onboarding.css';

const PROFILE_KEY = 'nutribot_profile';

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

  const currentStep = STEPS[stepIndex];
  const currentValue = profile[currentStep?.key] || '';

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
      navigate('/dashboard');
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
              {STEPS.map((step, index) => (
                <span
                  key={step.key}
                  className={`bot-step-dot ${index <= stepIndex ? 'active' : ''}`}
                />
              ))}
            </div>
          </div>

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
        </div>
      </section>
    </div>
  );
}
