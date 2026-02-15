import { useMemo, useState } from 'react';
import {
  Sparkles,
  ChefHat,
  Timer,
  Users,
  Wallet,
  TrendingUp,
  Salad,
  CheckCircle2,
} from 'lucide-react';
import Layout from '../components/Layout';
import { NUTRITIONIST_RECIPES_KEY } from '../constants/storageKeys';
import { createRecipe } from '../services/recipeService';
import { getAuthSession } from '../utils/authSession';
import '../styles/nutritionist.css';

const MEAL_TYPES = ['MEAL', 'SNACK'];

function parseStoredRecipes() {
  const raw = localStorage.getItem(NUTRITIONIST_RECIPES_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mockFollowersFor(recipeId) {
  const id = Number(recipeId || 0);
  return 20 + ((id * 37 + 11) % 180);
}

function mockRevenueForFollowers(followers) {
  return followers * 2.35;
}

function toFirstName(nameOrEmail) {
  const clean = String(nameOrEmail || '').trim();
  if (!clean) {
    return 'Nutricionista';
  }

  if (clean.includes('@')) {
    const local = clean.split('@')[0].replace(/[._-]+/g, ' ').trim();
    if (!local) {
      return 'Nutricionista';
    }
    return local.split(/\s+/)[0];
  }

  return clean.split(/\s+/)[0];
}

function mealLabel(type) {
  if (type === 'MEAL') return 'Refeição';
  if (type === 'SNACK') return 'Snack';
  return type;
}

export default function Nutritionist() {
  const session = getAuthSession();
  const userName = toFirstName(session?.name || session?.email);

  const [activeTab, setActiveTab] = useState('create');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [mealType, setMealType] = useState('MEAL');
  const [prepTimeMin, setPrepTimeMin] = useState('15');
  const [cookTimeMin, setCookTimeMin] = useState('20');
  const [servings, setServings] = useState('2');
  const [calories, setCalories] = useState('450');
  const [stepsText, setStepsText] = useState('1) Preparar ingredientes\n2) Cozinhar\n3) Servir');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [createdRecipes, setCreatedRecipes] = useState(parseStoredRecipes);

  const stats = useMemo(() => {
    const detailed = createdRecipes.map((recipe) => {
      const followers = mockFollowersFor(recipe.id);
      const revenue = mockRevenueForFollowers(followers);
      return {
        ...recipe,
        followers,
        revenue,
      };
    });

    const totalFollowers = detailed.reduce((acc, item) => acc + item.followers, 0);
    const totalRevenue = detailed.reduce((acc, item) => acc + item.revenue, 0);
    const avgFollowers = detailed.length ? Math.round(totalFollowers / detailed.length) : 0;

    return {
      totalRecipes: detailed.length,
      totalFollowers,
      totalRevenue,
      avgFollowers,
      detailed,
    };
  }, [createdRecipes]);

  const parsedPrep = Number(prepTimeMin) || 0;
  const parsedCook = Number(cookTimeMin) || 0;
  const parsedCalories = Number(calories) || 0;
  const totalTime = parsedPrep + parsedCook;

  const topFollowers = useMemo(() => {
    const max = stats.detailed.reduce((currentMax, item) => Math.max(currentMax, item.followers), 0);
    return max > 0 ? max : 1;
  }, [stats.detailed]);

  const saveLocalRecipe = (recipe) => {
    const next = [{ id: recipe.id, name: recipe.name }, ...createdRecipes].slice(0, 30);
    setCreatedRecipes(next);
    localStorage.setItem(NUTRITIONIST_RECIPES_KEY, JSON.stringify(next));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMessage('O nome da receita é obrigatório.');
      return;
    }

    setIsSaving(true);
    try {
      const parsedSteps = stepsText
        .split('\n')
        .map((line) => line.replace(/^\s*\d+[\).\-]?\s*/, '').trim())
        .filter(Boolean)
        .map((line, index) => ({
          stepOrder: index + 1,
          description: line,
          durationMinutes: 0,
        }));

      const normalizedMealType = mealType === 'SNACK' ? 'SNACK' : 'DINNER';

      const payload = {
        name: trimmedName,
        description: description.trim(),
        mealType: normalizedMealType,
        prepTimeMin: parsedPrep,
        cookTimeMin: parsedCook,
        servings: Math.max(1, Number(servings) || 1),
        ingredients: [],
        steps: parsedSteps,
        nutritionalInfo: {
          calories: parsedCalories,
          proteinG: 0,
          carbsG: 0,
          fatG: 0,
        },
      };

      const created = await createRecipe(payload);
      saveLocalRecipe({ id: created?.id, name: created?.name || trimmedName });
      setSuccessMessage('Receita criada e guardada na base de dados.');
      setName('');
      setDescription('');
      setMealType('MEAL');
      setPrepTimeMin('15');
      setCookTimeMin('20');
      setServings('2');
      setCalories('450');
      setStepsText('1) Preparar ingredientes\n2) Cozinhar\n3) Servir');
    } catch (error) {
      setErrorMessage(error?.message || 'Não foi possível criar a receita.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Layout>
      <section className="nutritionist-page">
        <header className="nutritionist-hero">
          <div className="nutritionist-hero-topline">
            <Sparkles size={16} /> Dashboard Nutricionista
          </div>
          <h1>Olá {userName}, pronto para ajudar hoje?</h1>
          <p>Cria receitas com impacto e acompanha a adesão com uma visão clara do teu desempenho.</p>

          <div className="nutritionist-hero-metrics" aria-label="Resumo rápido">
            <article>
              <span><ChefHat size={15} /> Receitas</span>
              <strong>{stats.totalRecipes}</strong>
            </article>
            <article>
              <span><Users size={15} /> Seguidores</span>
              <strong>{stats.totalFollowers}</strong>
            </article>
            <article>
              <span><Wallet size={15} /> Revenue</span>
              <strong>€{stats.totalRevenue.toFixed(2)}</strong>
            </article>
          </div>
        </header>

        <div className="nutritionist-tabs" role="tablist" aria-label="Menu nutricionista">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'create'}
            className={`nutritionist-tab ${activeTab === 'create' ? 'active' : ''}`}
            onClick={() => setActiveTab('create')}
          >
            Criar Receita
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'stats'}
            className={`nutritionist-tab ${activeTab === 'stats' ? 'active' : ''}`}
            onClick={() => setActiveTab('stats')}
          >
            Estatísticas
          </button>
        </div>

        {activeTab === 'create' ? (
          <section className="nutritionist-create-wrap">
            <form className="nutritionist-form" onSubmit={handleSubmit}>
              <div className="nutritionist-form-head">
                <h2><Salad size={18} /> Nova receita</h2>
                <p>Preenche os campos e publica uma receita orientada para resultados.</p>
              </div>

              <div className="nutritionist-form-grid">
                <label>
                  Nome da receita
                  <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex: Bowl proteica" required />
                </label>

                <label>
                  Tipo de refeição
                  <select value={mealType} onChange={(event) => setMealType(event.target.value)}>
                    {MEAL_TYPES.map((type) => (
                      <option key={type} value={type}>{mealLabel(type)}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Preparação (min)
                  <input type="number" min="0" value={prepTimeMin} onChange={(event) => setPrepTimeMin(event.target.value)} />
                </label>

                <label>
                  Cozedura (min)
                  <input type="number" min="0" value={cookTimeMin} onChange={(event) => setCookTimeMin(event.target.value)} />
                </label>

                <label>
                  Porções
                  <input type="number" min="1" value={servings} onChange={(event) => setServings(event.target.value)} />
                </label>

                <label>
                  Calorias (kcal)
                  <input type="number" min="0" value={calories} onChange={(event) => setCalories(event.target.value)} />
                </label>
              </div>

              <label>
                Descrição
                <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder="Descrição curta da receita" />
              </label>

              <label>
                Passos (1 por linha)
                <textarea value={stepsText} onChange={(event) => setStepsText(event.target.value)} rows={5} />
              </label>

              {errorMessage ? <p className="nutritionist-feedback error">{errorMessage}</p> : null}
              {successMessage ? <p className="nutritionist-feedback success">{successMessage}</p> : null}

              <button type="submit" className="nutritionist-submit" disabled={isSaving}>
                {isSaving ? 'A guardar...' : 'Guardar receita'}
              </button>
            </form>

            <aside className="nutritionist-preview" aria-live="polite">
              <h3>Preview em direto</h3>
              <p>{name.trim() || 'A tua nova receita aparecerá aqui.'}</p>

              <div className="nutritionist-preview-chips">
                <span><Timer size={14} /> {totalTime} min</span>
                <span><Users size={14} /> {Math.max(1, Number(servings) || 1)} porções</span>
                <span><TrendingUp size={14} /> {parsedCalories} kcal</span>
              </div>

              <div className="nutritionist-preview-steps">
                {stepsText
                  .split('\n')
                  .map((line) => line.replace(/^\s*\d+[\).\-]?\s*/, '').trim())
                  .filter(Boolean)
                  .slice(0, 4)
                  .map((step, index) => (
                    <p key={`${step}-${index}`}><CheckCircle2 size={14} /> {step}</p>
                  ))}
              </div>
            </aside>
          </section>
        ) : (
          <section className="nutritionist-stats" aria-live="polite">
            <div className="nutritionist-stats-grid">
              <article>
                <h3>Receitas publicadas</h3>
                <strong>{stats.totalRecipes}</strong>
                <p>Total acumulado na conta atual.</p>
              </article>
              <article>
                <h3>Adesão média</h3>
                <strong>{stats.avgFollowers}</strong>
                <p>Seguidores por receita criada.</p>
              </article>
              <article>
                <h3>Revenue estimada</h3>
                <strong>€{stats.totalRevenue.toFixed(2)}</strong>
                <p>Valor simulado com base em adoção.</p>
              </article>
            </div>

            <p className="nutritionist-mocked-note">
              Estes números são mocked para simular adoção e receita estimada por receita publicada.
            </p>

            <div className="nutritionist-stats-list">
              {stats.detailed.length === 0 ? (
                <p className="nutritionist-empty">Ainda não criaste receitas nesta conta.</p>
              ) : (
                stats.detailed
                  .slice()
                  .sort((a, b) => b.followers - a.followers)
                  .map((item) => {
                    const percent = Math.round((item.followers / topFollowers) * 100);
                    return (
                      <article key={item.id}>
                        <div className="nutritionist-stats-list-head">
                          <h4>{item.name}</h4>
                          <span>{item.followers} seguidores</span>
                        </div>
                        <div className="nutritionist-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
                          <div style={{ width: `${percent}%` }} />
                        </div>
                        <p>Revenue: €{item.revenue.toFixed(2)}</p>
                      </article>
                    );
                  })
              )}
            </div>
          </section>
        )}
      </section>
    </Layout>
  );
}
