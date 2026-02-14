/* eslint-disable react/prop-types */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock3, Flame, Layers, Users } from 'lucide-react';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import { fetchRecipes } from '../services/recipeService';
import '../styles/recipes.css';

const CATEGORY_META = {
  BREAKFAST: {
    id: 'breakfast',
    title: 'Pequeno-almoço',
    description: 'Receitas para começar o dia com energia.',
  },
  LUNCH: {
    id: 'lunch',
    title: 'Almoço',
    description: 'Pratos principais para meio do dia.',
  },
  DINNER: {
    id: 'dinner',
    title: 'Jantar',
    description: 'Receitas ideais para o final do dia.',
  },
  SNACK: {
    id: 'snack',
    title: 'Snack',
    description: 'Opções rápidas entre refeições.',
  },
};

const CATEGORY_ORDER = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'];

function normalizeMealType(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (CATEGORY_META[normalized]) {
    return normalized;
  }
  return 'DINNER';
}

function formatDuration(recipe) {
  const total = Number(recipe?.totalTimeMin || 0);
  if (total > 0) {
    return `${total} min`;
  }
  const prep = Number(recipe?.prepTimeMin || 0);
  const cook = Number(recipe?.cookTimeMin || 0);
  const fallback = prep + cook;
  if (fallback > 0) {
    return `${fallback} min`;
  }
  return '--';
}

function recipeImageFor(recipe) {
  const fromBackend = String(recipe?.imageUrl || '').trim();
  if (fromBackend) {
    return fromBackend;
  }
  const seed = encodeURIComponent(String(recipe?.name || 'recipe').toLowerCase().replace(/\s+/g, '-'));
  return `https://picsum.photos/seed/${seed}/900/560`;
}

// eslint-disable-next-line react/prop-types
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
          const imageSrc = recipeImageFor(recipe);
          const sourceUrl = String(recipe.sourceUrl || '').trim();
          const hasSourceUrl = sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://');

          return (
            <article key={recipe.id} className="recipe-card">
              <img
                src={imageSrc}
                alt={recipe.name}
                loading="lazy"
                className="recipe-thumb"
                onError={(event) => {
                  event.currentTarget.src = recipeImageFor({ name: `${recipe.name}-fallback` });
                }}
              />
              <p className="recipe-badge">
                <Layers size={13} />
                {category.title}
              </p>
              <h3>{recipe.name}</h3>

              <div className="recipe-meta">
                <span>
                  <Clock3 size={14} />
                  {formatDuration(recipe)}
                </span>
                <span>
                  <Flame size={14} />
                  {Number(recipe.calories || 0) > 0 ? `${Math.round(recipe.calories)} kcal` : 'kcal N/A'}
                </span>
                <span>
                  <Users size={14} />
                  {Math.max(1, Number(recipe.servings || 1))} porções
                </span>
              </div>

              {hasSourceUrl ? (
                <a href={sourceUrl} target="_blank" rel="noreferrer" className="recipe-open-btn">
                  Ver receita
                </a>
              ) : (
                <button type="button" className="recipe-open-btn" disabled>
                  Sem link de origem
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
        if (!isMounted) {
          return;
        }
        setRecipes(data);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }
        setError(loadError.message || 'Não foi possível carregar as receitas.');
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
  }, []);

  const groupedCategories = useMemo(() => {
    const grouped = {
      BREAKFAST: [],
      LUNCH: [],
      DINNER: [],
      SNACK: [],
    };

    recipes.forEach((recipe) => {
      const mealType = normalizeMealType(recipe.mealType);
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
        <PageHeader
          className="recipes-header"
          title="Receitas da Base de Dados"
          subtitle="Receitas carregadas da tabela `recipes` do backend, com as respetivas fotos."
        />

        {isLoading ? <p className="recipes-feedback">A carregar receitas...</p> : null}
        {!isLoading && error ? <p className="recipes-feedback recipes-feedback-error">{error}</p> : null}
        {!isLoading && !error && groupedCategories.length === 0 ? (
          <p className="recipes-feedback">Sem receitas na base de dados. Corre o scraper/import primeiro.</p>
        ) : null}

        <div className="recipes-categories">
          {groupedCategories.map((category) => (
            <CategoryCarousel key={category.id} category={category} />
          ))}
        </div>
      </div>
    </Layout>
  );
}
