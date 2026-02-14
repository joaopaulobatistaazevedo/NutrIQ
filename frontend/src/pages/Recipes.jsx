import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock3, Euro, Flame, Layers } from 'lucide-react';
import Layout from '../components/Layout';
import { fetchRecipes } from '../services/recipeService';
import '../styles/recipes.css';

const CATEGORY_META = {
  BREAKFAST: {
    id: 'breakfast',
    title: 'Base: Pequeno-almoço',
    description: 'Receitas para começar o dia com energia.',
  },
  LUNCH: {
    id: 'lunch',
    title: 'Base: Almoço',
    description: 'Pratos principais para meio do dia.',
  },
  DINNER: {
    id: 'dinner',
    title: 'Base: Jantar',
    description: 'Receitas ideais para o final do dia.',
  },
  SNACK: {
    id: 'snack',
    title: 'Base: Snack',
    description: 'Opções rápidas entre refeições.',
  },
};

const CATEGORY_ORDER = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'];

function normalizeMealType(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (CATEGORY_META[normalized]) return normalized;
  return 'DINNER';
}

function formatDuration(recipe) {
  const total = Number(recipe?.totalTimeMin || 0);
  if (total > 0) return `${total} min`;
  const prep = Number(recipe?.prepTimeMin || 0);
  const cook = Number(recipe?.cookTimeMin || 0);
  const fallback = prep + cook;
  return fallback > 0 ? `${fallback} min` : '--';
}

function formatPrice(recipe) {
  const candidates = [recipe?.price, recipe?.estimatedCostPerServing, recipe?.estimatedCost];
  for (const candidate of candidates) {
    const amount = Number(candidate);
    if (Number.isFinite(amount) && amount > 0) {
      return `€${amount.toFixed(2)}`;
    }
  }
  return '€--';
}

function recipeImageFor(recipe) {
  const fromBackend = String(recipe?.imageUrl || '').trim();
  if (fromBackend) return fromBackend;
  const seed = encodeURIComponent(String(recipe?.name || 'recipe').toLowerCase().replace(/\s+/g, '-'));
  return `https://picsum.photos/seed/${seed}/900/560`;
}

function CategoryCarousel({ category }) {
  const trackRef = useRef(null);

  const scrollByAmount = (direction) => {
    const element = trackRef.current;
    if (!element) return;

    const card = element.querySelector('.recipe-card');
    const styles = window.getComputedStyle(element);
    const gap = Number.parseFloat(styles.columnGap || styles.gap || '0');
    const width = card ? card.getBoundingClientRect().width + gap : 420;
    element.scrollBy({ left: direction * width, behavior: 'smooth' });
  };

  const handleWheel = (event) => {
    const element = trackRef.current;
    if (!element) return;

    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      event.preventDefault();
      element.scrollBy({ left: event.deltaY, behavior: 'auto' });
    }
  };

  return (
    <section className="recipes-category">
      <header className="recipes-category-header">
        <div>
          <h2>{category.title}</h2>
          <p>{category.description}</p>
        </div>

        <div className="recipes-carousel-controls">
          <button type="button" className="recipes-control-btn" onClick={() => scrollByAmount(-1)} aria-label="Anterior">
            <ChevronLeft size={18} />
          </button>
          <button type="button" className="recipes-control-btn" onClick={() => scrollByAmount(1)} aria-label="Seguinte">
            <ChevronRight size={18} />
          </button>
        </div>
      </header>

      <div className="recipes-carousel-track" ref={trackRef} onWheel={handleWheel}>
        {category.recipes.map((recipe) => {
          const sourceUrl = String(recipe?.sourceUrl || '').trim();
          const hasSourceUrl = sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://');

          return (
            <article key={recipe?.id || recipe?.name} className="recipe-card">
              <img
                src={recipeImageFor(recipe)}
                alt={recipe?.name || 'Receita'}
                loading="lazy"
                className="recipe-thumb"
                onError={(event) => {
                  event.currentTarget.onerror = null;
                  event.currentTarget.src = 'https://placehold.co/900x560/e2e8f0/475569?text=Receita';
                }}
              />
              <p className="recipe-badge">
                <Layers size={13} />
                {category.title}
              </p>
              <h3>{recipe?.name || 'Receita sem nome'}</h3>

              <div className="recipe-meta">
                <span>
                  <Clock3 size={14} />
                  {formatDuration(recipe)}
                </span>
                <span>
                  <Flame size={14} />
                  {Number(recipe?.calories || 0) > 0 ? `${Math.round(recipe.calories)} kcal` : 'kcal N/A'}
                </span>
                <span>
                  <Euro size={14} />
                  {formatPrice(recipe)}
                </span>
              </div>

              {hasSourceUrl ? (
                <a href={sourceUrl} target="_blank" rel="noreferrer" className="recipe-open-btn">
                  Ver receita
                </a>
              ) : (
                <button type="button" className="recipe-open-btn" disabled>
                  Ver receita
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default function Recipes() {
  const [recipes, setRecipes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    const run = async () => {
      setIsLoading(true);
      setError('');
      try {
        const data = await fetchRecipes({ limit: 300 });
        if (!isMounted) return;
        setRecipes(Array.isArray(data) ? data : []);
      } catch (loadError) {
        if (!isMounted) return;
        setError(loadError?.message || 'Não foi possível carregar as receitas.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void run();
    return () => {
      isMounted = false;
    };
  }, []);

  const groupedCategories = useMemo(() => {
    const grouped = {
      BREAKFAST: [],
      LUNCH: [],
      DINNER: [],
      SNACK: [],
    };

    recipes.forEach((recipe) => {
      const mealType = normalizeMealType(recipe?.mealType);
      grouped[mealType].push(recipe);
    });

    return CATEGORY_ORDER
      .map((mealType) => ({
        ...CATEGORY_META[mealType],
        recipes: grouped[mealType],
      }))
      .filter((category) => category.recipes.length > 0);
  }, [recipes]);

  return (
    <Layout>
      <div className="recipes-page">
        <header className="recipes-header">
          <div>
            <h1>Receitas por Base</h1>
            <p>
              Organização por categoria para veres receitas parecidas juntas
              como pediste (ex: carbonara e bolonhesa na base massa).
            </p>
          </div>
        </header>

        {isLoading ? <p className="recipes-feedback">A carregar receitas...</p> : null}
        {!isLoading && error ? <p className="recipes-feedback recipes-feedback-error">{error}</p> : null}

        <div className="recipes-categories">
          {!isLoading && !error && groupedCategories.length === 0 ? (
            <p className="recipes-feedback">Sem receitas na base de dados.</p>
          ) : null}
          {groupedCategories.map((category) => (
            <CategoryCarousel key={category.id} category={category} />
          ))}
        </div>
      </div>
    </Layout>
  );
}
