import { useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { NUTRITIONIST_RECIPES_KEY } from '../constants/storageKeys';
import { createRecipe } from '../services/recipeService';
import '../styles/nutritionist.css';

const MEAL_TYPES = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'];

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

export default function Nutritionist() {
  const [activeTab, setActiveTab] = useState('create');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [mealType, setMealType] = useState('DINNER');
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

    return {
      totalRecipes: detailed.length,
      totalFollowers,
      totalRevenue,
      detailed,
    };
  }, [createdRecipes]);

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

      const payload = {
        name: trimmedName,
        description: description.trim(),
        mealType,
        prepTimeMin: Number(prepTimeMin) || 0,
        cookTimeMin: Number(cookTimeMin) || 0,
        servings: Math.max(1, Number(servings) || 1),
        ingredients: [],
        steps: parsedSteps,
        nutritionalInfo: {
          calories: Number(calories) || 0,
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
      setMealType('DINNER');
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
        <header className="nutritionist-header">
          <h1>Painel de Nutricionista</h1>
          <p>Publica receitas e acompanha impacto com estatísticas mocked de adesão e revenue.</p>
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
          <form className="nutritionist-form" onSubmit={handleSubmit}>
            <div className="nutritionist-form-grid">
              <label>
                Nome da receita
                <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex: Bowl proteica" required />
              </label>

              <label>
                Tipo de refeição
                <select value={mealType} onChange={(event) => setMealType(event.target.value)}>
                  {MEAL_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
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
        ) : (
          <section className="nutritionist-stats" aria-live="polite">
            <div className="nutritionist-stats-grid">
              <article>
                <h3>Receitas publicadas</h3>
                <strong>{stats.totalRecipes}</strong>
              </article>
              <article>
                <h3>Utilizadores que seguiram</h3>
                <strong>{stats.totalFollowers}</strong>
              </article>
              <article>
                <h3>Profit revenue (mocked)</h3>
                <strong>€{stats.totalRevenue.toFixed(2)}</strong>
              </article>
            </div>

            <p className="nutritionist-mocked-note">
              Estes números são mocked para simular adoção das receitas e receita estimada.
            </p>

            <div className="nutritionist-stats-list">
              {stats.detailed.length === 0 ? (
                <p>Ainda não criaste receitas nesta conta.</p>
              ) : (
                stats.detailed.map((item) => (
                  <article key={item.id}>
                    <h4>{item.name}</h4>
                    <p>{item.followers} utilizadores seguiram · €{item.revenue.toFixed(2)} revenue</p>
                  </article>
                ))
              )}
            </div>
          </section>
        )}
      </section>
    </Layout>
  );
}
