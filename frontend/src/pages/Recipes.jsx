import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Clock3, Euro, Flame, Layers, Star, X } from 'lucide-react';
import Layout from '../components/Layout';
import {
  fetchRecipes,
  fetchMyRecipes,
  createMyRecipe,
  updateMyRecipe,
  deleteMyRecipe,
  fetchFavoriteRecipes,
  toggleFavorite,
} from '../services/recipeService';
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

function mealTypeLabel(value) {
  const normalized = normalizeMealType(value);
  if (normalized === 'BREAKFAST') return 'Pequeno-almoço';
  if (normalized === 'LUNCH') return 'Almoço';
  if (normalized === 'DINNER') return 'Jantar';
  return 'Snack';
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
  const candidates = [recipe?.price, recipe?.estimatedCostPerServing, recipe?.estimatedCost, recipe?.costPerServing];
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

function extractSourceUrl(recipe) {
  const candidates = [
    recipe?.sourceUrl,
    recipe?.source_url,
    recipe?.url,
  ];

  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return value;
    }
  }

  const description = String(recipe?.description || '');
  const match = description.match(/https?:\/\/[^\s|)]+/i);
  if (!match?.[0]) {
    return '';
  }

  return match[0].replace(/[.,;!?]+$/, '');
}

function recipeCalories(recipe) {
  const direct = Number(recipe?.calories);
  if (Number.isFinite(direct) && direct > 0) {
    return Math.round(direct);
  }
  const nested = Number(recipe?.nutritionalInfo?.calories);
  if (Number.isFinite(nested) && nested > 0) {
    return Math.round(nested);
  }
  return 0;
}

function macroValue(recipe, macroKey) {
  const nested = Number(recipe?.nutritionalInfo?.[macroKey]);
  if (Number.isFinite(nested) && nested > 0) {
    return nested;
  }
  const direct = Number(recipe?.[macroKey]);
  if (Number.isFinite(direct) && direct > 0) {
    return direct;
  }
  return 0;
}

function formatIngredient(ingredient) {
  const quantity = Number(ingredient?.quantity);
  const qtyLabel = Number.isFinite(quantity) && quantity > 0 ? `${quantity}` : '';
  const unit = String(ingredient?.unit || '').trim().toLowerCase();
  const ingredientName = String(ingredient?.ingredientName || '').trim();
  const notes = String(ingredient?.notes || '').trim();

  const base = [qtyLabel, unit, ingredientName].filter(Boolean).join(' ').trim() || 'Ingrediente';
  return notes ? `${base} — ${notes}` : base;
}

function stringListFromValue(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (item && typeof item === 'object') {
          return String(item.name || item.label || item.value || '').trim();
        }
        return '';
      })
      .filter(Boolean)
      .join(', ');
  }

  return String(value || '').trim();
}

function recipeIngredientsText(recipe) {
  if (Array.isArray(recipe?.ingredients) && recipe.ingredients.length > 0) {
    return recipe.ingredients
      .map((ingredient) => formatIngredient(ingredient))
      .filter(Boolean)
      .join('\n');
  }

  return String(recipe?.ingredientsText || recipe?.ingredients || '').trim();
}

function recipeStepsText(recipe) {
  if (Array.isArray(recipe?.steps) && recipe.steps.length > 0) {
    return [...recipe.steps]
      .sort((a, b) => Number(a?.stepOrder || 0) - Number(b?.stepOrder || 0))
      .map((step, index) => {
        const text = typeof step === 'string'
          ? step
          : String(step?.instruction || step?.description || step?.text || '').trim();
        return text || `Passo ${index + 1}`;
      })
      .filter(Boolean)
      .join('\n');
  }

  return String(recipe?.instructions || recipe?.stepsText || '').trim();
}

function CategoryCarousel({ category, onOpenNutritionistRecipe, onToggleFavorite, favoriteIds }) {
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
    <section className="recipes-category card">
      <header className="recipes-category-header card-header">
        <div>
          <h2>{category.title}</h2>
          <p>{category.description}</p>
        </div>

        <div className="recipes-carousel-controls">
          <button type="button" className="recipes-control-btn btn btn-icon" onClick={() => scrollByAmount(-1)} aria-label="Anterior">
            <ChevronLeft size={18} />
          </button>
          <button type="button" className="recipes-control-btn btn btn-icon" onClick={() => scrollByAmount(1)} aria-label="Seguinte">
            <ChevronRight size={18} />
          </button>
        </div>
      </header>

      <div className="card-body">
        <div className="recipes-carousel-track" ref={trackRef} onWheel={handleWheel}>
          {category.recipes.map((recipe) => {
            const sourceUrl = extractSourceUrl(recipe);
            const hasSourceUrl = Boolean(sourceUrl);
            const calories = recipeCalories(recipe);
            const isFav = favoriteIds?.has(recipe?.id);

            return (
              <article key={recipe?.id || recipe?.name} className="recipe-card">
                <div className="recipe-card-img-wrap">
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
                  <button
                    type="button"
                    className={`recipe-fav-btn ${isFav ? 'is-fav' : ''}`}
                    title={isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                    onClick={(e) => { e.stopPropagation(); onToggleFavorite?.(recipe.id); }}
                  >
                    <Star size={16} fill={isFav ? '#f59e0b' : 'none'} color={isFav ? '#f59e0b' : '#94a3b8'} />
                  </button>
                </div>
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
                    {calories > 0 ? `${calories} kcal` : 'kcal N/A'}
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
                  <button type="button" className="recipe-open-btn" onClick={() => onOpenNutritionistRecipe(recipe)}>
                    Ver receita
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default function Recipes() {
  const [recipes, setRecipes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedNutritionistRecipe, setSelectedNutritionistRecipe] = useState(null);
  const [activeInnerTab, setActiveInnerTab] = useState('made');
  const [createNotice, setCreateNotice] = useState('');
  const [myRecipes, setMyRecipes] = useState([]);
  const [myRecipesLoading, setMyRecipesLoading] = useState(false);
  const [favoriteRecipes, setFavoriteRecipes] = useState([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState(new Set());
  const [recipeDraft, setRecipeDraft] = useState({
    name: '',
    description: '',
    mealType: 'DINNER',
    ingredients: '',
    steps: '',
    prepTimeMin: '',
    cookTimeMin: '',
    servings: '2',
    calories: '',
    proteinG: '',
    carbsG: '',
    fatG: '',
    visibility: 'private',
    imageUrl: '',
  });
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    type: '',
    recipeId: '',
    title: '',
    message: '',
    confirmLabel: 'Confirmar',
    tone: 'primary',
  });
  const [editRecipeDialog, setEditRecipeDialog] = useState({
    open: false,
    id: '',
    name: '',
    description: '',
    mealType: 'DINNER',
    ingredients: '',
    steps: '',
    prepTimeMin: '',
    cookTimeMin: '',
    servings: '2',
    calories: '',
    proteinG: '',
    carbsG: '',
    fatG: '',
    visibility: 'private',
    image: '',
  });
  const [editNotice, setEditNotice] = useState('');
  const [showDeleteConfirmInEdit, setShowDeleteConfirmInEdit] = useState(false);

  // ── Load all recipes (carousel) ──────────────────────────────
  useEffect(() => {
    let isMounted = true;

    const run = async () => {
      setIsLoading(true);
      setError('');
      try {
        const data = await fetchRecipes({ limit: 300 });
        if (!isMounted) return;
        const safeData = Array.isArray(data) ? data : [];
        setRecipes(safeData);

        // Build favorite IDs set from the isFavorite field returned by backend
        const favIds = new Set();
        safeData.forEach((r) => { if (r.isFavorite) favIds.add(r.id); });
        setFavoriteIds(favIds);
      } catch (loadError) {
        if (!isMounted) return;
        setError(loadError?.message || 'Não foi possível carregar as receitas.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void run();
    return () => { isMounted = false; };
  }, []);

  // ── Load user's own recipes when "mine" tab opens ────────────
  const loadMyRecipes = useCallback(async () => {
    setMyRecipesLoading(true);
    try {
      const data = await fetchMyRecipes();
      setMyRecipes(Array.isArray(data) ? data : []);
    } catch {
      setMyRecipes([]);
    } finally {
      setMyRecipesLoading(false);
    }
  }, []);

  // ── Load favorites when "favorites" tab opens ────────────────
  const loadFavorites = useCallback(async () => {
    setFavoritesLoading(true);
    try {
      const data = await fetchFavoriteRecipes();
      setFavoriteRecipes(Array.isArray(data) ? data : []);
    } catch {
      setFavoriteRecipes([]);
    } finally {
      setFavoritesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeInnerTab === 'mine') void loadMyRecipes();
    if (activeInnerTab === 'favorites') void loadFavorites();
  }, [activeInnerTab, loadMyRecipes, loadFavorites]);

  // ── Toggle favorite handler ──────────────────────────────────
  const handleToggleFavorite = useCallback(async (recipeId) => {
    try {
      const result = await toggleFavorite(recipeId);
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (result.favorited) {
          next.add(recipeId);
        } else {
          next.delete(recipeId);
        }
        return next;
      });
      // Update recipes list to reflect new fav status
      setRecipes((prev) =>
        prev.map((r) =>
          r.id === recipeId ? { ...r, isFavorite: result.favorited } : r
        )
      );
    } catch {
      // silently fail
    }
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

  const nutritionistIngredients = useMemo(() => {
    if (!Array.isArray(selectedNutritionistRecipe?.ingredients)) {
      return [];
    }
    return selectedNutritionistRecipe.ingredients;
  }, [selectedNutritionistRecipe]);

  const nutritionistSteps = useMemo(() => {
    if (!Array.isArray(selectedNutritionistRecipe?.steps)) {
      return [];
    }
    return [...selectedNutritionistRecipe.steps]
      .sort((a, b) => Number(a?.stepOrder || 0) - Number(b?.stepOrder || 0));
  }, [selectedNutritionistRecipe]);

  const nutritionistCalories = recipeCalories(selectedNutritionistRecipe || {});
  const proteinG = macroValue(selectedNutritionistRecipe || {}, 'proteinG');
  const carbsG = macroValue(selectedNutritionistRecipe || {}, 'carbsG');
  const fatG = macroValue(selectedNutritionistRecipe || {}, 'fatG');

  const closeNutritionistModal = () => setSelectedNutritionistRecipe(null);

  const updateDraftField = (field) => (event) => {
    const value = event?.target?.value ?? '';
    setCreateNotice('');
    setRecipeDraft((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const openConfirmDialog = ({ type, recipeId, title, message, confirmLabel, tone = 'primary' }) => {
    setConfirmDialog({
      open: true,
      type,
      recipeId,
      title,
      message,
      confirmLabel,
      tone,
    });
  };

  const closeConfirmDialog = () => {
    setConfirmDialog((previous) => ({
      ...previous,
      open: false,
    }));
  };

  const openEditRecipeDialog = (recipe) => {
    if (!recipe?.id) return;

    setEditNotice('');
    setShowDeleteConfirmInEdit(false);
    setEditRecipeDialog({
      open: true,
      id: recipe.id,
      name: String(recipe.name || '').trim(),
      description: String(recipe.description || '').trim(),
      mealType: String(recipe.mealType || 'DINNER').trim().toUpperCase(),
      ingredients: recipeIngredientsText(recipe),
      steps: recipeStepsText(recipe),
      prepTimeMin: String(recipe.prepTimeMin || ''),
      cookTimeMin: String(recipe.cookTimeMin || ''),
      servings: String(recipe.servings || '2'),
      calories: String(recipe.nutritionalInfo?.calories || recipe.calories || ''),
      proteinG: String(recipe.nutritionalInfo?.proteinG || ''),
      carbsG: String(recipe.nutritionalInfo?.carbsG || ''),
      fatG: String(recipe.nutritionalInfo?.fatG || ''),
      visibility: recipe.visibility === 'PUBLIC' ? 'public' : 'private',
      image: String(recipe.imageUrl || recipe.image || '').trim(),
      utensils: '',
      allergens: '',
    });
  };

  const closeEditRecipeDialog = () => {
    setEditRecipeDialog((previous) => ({
      ...previous,
      open: false,
      id: '',
    }));
    setEditNotice('');
    setShowDeleteConfirmInEdit(false);
  };

  const updateEditRecipeField = (field) => (event) => {
    const value = event?.target?.value ?? '';
    setEditNotice('');
    setEditRecipeDialog((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const toggleMyRecipeVisibility = async (recipeId) => {
    const targetRecipe = myRecipes.find((recipe) => recipe.id === recipeId);
    if (!targetRecipe) return;

    const newVisibility = targetRecipe.visibility === 'PRIVATE' ? 'PUBLIC' : 'PRIVATE';

    if (newVisibility === 'PUBLIC') {
      openConfirmDialog({
        type: 'publish',
        recipeId,
        title: 'Publicar receita',
        message: 'Tem a certeza que pretende pôr esta receita pública?',
        confirmLabel: 'Sim, publicar',
        tone: 'primary',
      });
      return;
    }

    try {
      await updateMyRecipe(recipeId, { ...buildRecipePayload(targetRecipe), visibility: newVisibility });
      setMyRecipes((prev) =>
        prev.map((r) => (r.id === recipeId ? { ...r, visibility: newVisibility } : r))
      );
    } catch {
      // silently fail
    }
  };

  const handleConfirmDialog = async () => {
    if (!confirmDialog.recipeId) {
      closeConfirmDialog();
      return;
    }

    if (confirmDialog.type === 'publish') {
      const targetRecipe = myRecipes.find((r) => r.id === confirmDialog.recipeId);
      if (targetRecipe) {
        try {
          await updateMyRecipe(confirmDialog.recipeId, { ...buildRecipePayload(targetRecipe), visibility: 'PUBLIC' });
          setMyRecipes((prev) =>
            prev.map((r) => (r.id === confirmDialog.recipeId ? { ...r, visibility: 'PUBLIC' } : r))
          );
        } catch {
          // silently fail
        }
      }
    }

    closeConfirmDialog();
  };

  const saveEditedRecipe = async (event) => {
    event.preventDefault();

    const requiredFields = [
      { key: 'name', label: 'nome da receita' },
    ];

    const missing = requiredFields
      .filter((field) => !String(editRecipeDialog[field.key] || '').trim())
      .map((field) => field.label);

    if (missing.length > 0) {
      setEditNotice(`Falta preencher: ${missing.join(', ')}.`);
      return;
    }

    if (!editRecipeDialog.id) {
      closeEditRecipeDialog();
      return;
    }

    // Parse ingredients/steps text into structured lists
    const ingredientLines = String(editRecipeDialog.ingredients || '').split('\n').map(l => l.trim()).filter(Boolean);
    const ingredients = ingredientLines.map((line, idx) => ({
      ingredientName: line,
      quantity: 0,
      unit: '',
      orderIndex: idx + 1,
    }));

    const stepLines = String(editRecipeDialog.steps || '').split('\n').map(l => l.trim()).filter(Boolean);
    const steps = stepLines.map((line, idx) => ({
      description: line,
      stepOrder: idx + 1,
    }));

    const payload = {
      name: String(editRecipeDialog.name || '').trim(),
      description: String(editRecipeDialog.description || '').trim(),
      mealType: String(editRecipeDialog.mealType || 'DINNER').trim().toUpperCase(),
      prepTimeMin: Number(editRecipeDialog.prepTimeMin) || 0,
      cookTimeMin: Number(editRecipeDialog.cookTimeMin) || 0,
      servings: Number(editRecipeDialog.servings) || 2,
      visibility: editRecipeDialog.visibility === 'public' ? 'PUBLIC' : 'PRIVATE',
      imageUrl: String(editRecipeDialog.image || '').trim(),
      ingredients,
      steps,
      nutritionalInfo: {
        calories: Number(editRecipeDialog.calories) || 0,
        proteinG: Number(editRecipeDialog.proteinG) || 0,
        carbsG: Number(editRecipeDialog.carbsG) || 0,
        fatG: Number(editRecipeDialog.fatG) || 0,
      },
    };

    try {
      await updateMyRecipe(editRecipeDialog.id, payload);
      void loadMyRecipes();
      closeEditRecipeDialog();
    } catch (err) {
      setEditNotice(err?.message || 'Erro ao guardar a receita.');
    }
  };

  const requestDeleteFromEditDialog = () => {
    setShowDeleteConfirmInEdit(true);
  };

  const cancelDeleteFromEditDialog = () => {
    setShowDeleteConfirmInEdit(false);
  };

  const confirmDeleteFromEditDialog = async () => {
    if (!editRecipeDialog.id) {
      closeEditRecipeDialog();
      return;
    }

    try {
      await deleteMyRecipe(editRecipeDialog.id);
      setMyRecipes((previous) => previous.filter((recipe) => recipe.id !== editRecipeDialog.id));
    } catch {
      // silently fail
    }
    closeEditRecipeDialog();
  };

  const handleCreateSubmit = async (event) => {
    event.preventDefault();

    const requiredFields = [
      { key: 'name', label: 'nome da receita' },
      { key: 'mealType', label: 'tipo de refeição' },
    ];

    const missing = requiredFields
      .filter((field) => !String(recipeDraft[field.key] || '').trim())
      .map((field) => field.label);

    if (missing.length > 0) {
      setCreateNotice(`Falta preencher: ${missing.join(', ')}.`);
      return;
    }

    const recipeName = String(recipeDraft.name || '').trim();

    // Parse ingredients text into structured list
    const ingredientLines = String(recipeDraft.ingredients || '').split('\n').map(l => l.trim()).filter(Boolean);
    const ingredients = ingredientLines.map((line, idx) => ({
      ingredientName: line,
      quantity: 0,
      unit: '',
      orderIndex: idx + 1,
    }));

    // Parse steps text into structured list
    const stepLines = String(recipeDraft.steps || '').split('\n').map(l => l.trim()).filter(Boolean);
    const steps = stepLines.map((line, idx) => ({
      description: line,
      stepOrder: idx + 1,
    }));

    const payload = {
      name: recipeName,
      description: String(recipeDraft.description || '').trim() || 'Receita criada manualmente.',
      mealType: String(recipeDraft.mealType || 'DINNER').trim().toUpperCase(),
      prepTimeMin: Number(recipeDraft.prepTimeMin) || 0,
      cookTimeMin: Number(recipeDraft.cookTimeMin) || 0,
      servings: Number(recipeDraft.servings) || 2,
      visibility: recipeDraft.visibility === 'public' ? 'PUBLIC' : 'PRIVATE',
      imageUrl: String(recipeDraft.imageUrl || '').trim(),
      ingredients,
      steps,
      nutritionalInfo: {
        calories: Number(recipeDraft.calories) || 0,
        proteinG: Number(recipeDraft.proteinG) || 0,
        carbsG: Number(recipeDraft.carbsG) || 0,
        fatG: Number(recipeDraft.fatG) || 0,
      },
    };

    try {
      await createMyRecipe(payload);
      setRecipeDraft({
        name: '',
        description: '',
        mealType: 'DINNER',
        ingredients: '',
        steps: '',
        prepTimeMin: '',
        cookTimeMin: '',
        servings: '2',
        calories: '',
        proteinG: '',
        carbsG: '',
        fatG: '',
        visibility: 'private',
        imageUrl: '',
      });
      setCreateNotice('Receita criada com sucesso!');
      setActiveInnerTab('mine');
    } catch (err) {
      setCreateNotice(err?.message || 'Erro ao criar a receita.');
    }
  };

  /** Build a recipe payload from a backend-shaped recipe for updates. */
  const buildRecipePayload = (recipe) => {
    // Preserve existing ingredients/steps from the backend-shaped recipe
    const ingredients = Array.isArray(recipe.ingredients)
      ? recipe.ingredients.map((ing, idx) => ({
          ingredientName: ing.ingredientName || (typeof ing === 'string' ? ing : ''),
          quantity: ing.quantity || 0,
          unit: ing.unit || '',
          orderIndex: ing.orderIndex || idx + 1,
        }))
      : [];

    const steps = Array.isArray(recipe.steps)
      ? recipe.steps.map((step, idx) => ({
          description: step.description || (typeof step === 'string' ? step : ''),
          stepOrder: step.stepOrder || idx + 1,
        }))
      : [];

    return {
      name: recipe.name || '',
      description: recipe.description || '',
      mealType: String(recipe.mealType || 'DINNER').toUpperCase(),
      prepTimeMin: Number(recipe.prepTimeMin) || 0,
      cookTimeMin: Number(recipe.cookTimeMin) || 0,
      servings: Number(recipe.servings) || 2,
      visibility: recipe.visibility || 'PRIVATE',
      imageUrl: recipe.imageUrl || recipe.image || '',
      ingredients,
      steps,
      nutritionalInfo: {
        calories: Number(recipe.nutritionalInfo?.calories || recipe.calories || 0),
        proteinG: Number(recipe.nutritionalInfo?.proteinG || 0),
        carbsG: Number(recipe.nutritionalInfo?.carbsG || 0),
        fatG: Number(recipe.nutritionalInfo?.fatG || 0),
      },
    };
  };

  return (
    <Layout>
      <div className="page recipes-page">
        <div className="container-xl">
          <header className="page-header d-print-none mb-3">
            <div>
              <h2 className="page-title">Receitas</h2>
              <p className="text-secondary mb-0">
                Explora receitas, cria as tuas, marca favoritas e guarda-as para o teu plano alimentar.
              </p>
            </div>
          </header>

          <div className="recipes-inner-tabs" role="tablist" aria-label="Sub-abas de receitas">
            <button
              type="button"
              role="tab"
              className={`recipes-inner-tab ${activeInnerTab === 'made' ? 'active' : ''}`}
              aria-selected={activeInnerTab === 'made'}
              onClick={() => setActiveInnerTab('made')}
            >
              Todas as Receitas
            </button>
            <button
              type="button"
              role="tab"
              className={`recipes-inner-tab ${activeInnerTab === 'create' ? 'active' : ''}`}
              aria-selected={activeInnerTab === 'create'}
              onClick={() => setActiveInnerTab('create')}
            >
              Criar receita
            </button>
            <button
              type="button"
              role="tab"
              className={`recipes-inner-tab ${activeInnerTab === 'mine' ? 'active' : ''}`}
              aria-selected={activeInnerTab === 'mine'}
              onClick={() => setActiveInnerTab('mine')}
            >
              Suas receitas
            </button>
            <button
              type="button"
              role="tab"
              className={`recipes-inner-tab ${activeInnerTab === 'favorites' ? 'active' : ''}`}
              aria-selected={activeInnerTab === 'favorites'}
              onClick={() => setActiveInnerTab('favorites')}
            >
              <Star size={14} style={{ marginRight: 4 }} /> Favoritas
            </button>
          </div>

          {activeInnerTab === 'made' ? (
            <>
              {isLoading ? <div className="alert alert-info" role="status">A carregar receitas...</div> : null}
              {!isLoading && error ? <div className="alert alert-danger" role="alert">{error}</div> : null}

              <div className="recipes-categories">
                {!isLoading && !error && groupedCategories.length === 0 ? (
                  <div className="alert alert-secondary" role="status">Sem receitas na base de dados.</div>
                ) : null}
                {groupedCategories.map((category) => (
                  <CategoryCarousel
                    key={category.id}
                    category={category}
                    onOpenNutritionistRecipe={setSelectedNutritionistRecipe}
                    onToggleFavorite={handleToggleFavorite}
                    favoriteIds={favoriteIds}
                  />
                ))}
              </div>
            </>
          ) : null}

          {activeInnerTab === 'create' ? (
            <section className="recipes-create card" aria-label="Criar receita">
              <header className="recipes-create-head">
                <h3>Criar receita</h3>
                <p>Cria uma nova receita que será guardada na tua base de dados. Pode ser pública ou privada.</p>
              </header>

              <form className="recipes-create-form" onSubmit={handleCreateSubmit}>
                <div className="recipes-create-grid">
                  <div className="recipes-create-field recipes-create-field-full">
                    <label htmlFor="recipe-name">Nome da receita</label>
                    <input
                      id="recipe-name"
                      type="text"
                      className="form-control"
                      placeholder="Ex: Massa de atum e espinafres"
                      value={recipeDraft.name}
                      onChange={updateDraftField('name')}
                      required
                    />
                  </div>

                  <div className="recipes-create-field">
                    <label htmlFor="recipe-meal-type">Tipo de refeição</label>
                    <select
                      id="recipe-meal-type"
                      className="form-control"
                      value={recipeDraft.mealType}
                      onChange={updateDraftField('mealType')}
                      required
                    >
                      <option value="BREAKFAST">Pequeno-almoço</option>
                      <option value="LUNCH">Almoço</option>
                      <option value="DINNER">Jantar</option>
                      <option value="SNACK">Snack</option>
                    </select>
                  </div>

                  <div className="recipes-create-field">
                    <label htmlFor="recipe-servings">Porções</label>
                    <input
                      id="recipe-servings"
                      type="number"
                      min="1"
                      className="form-control"
                      placeholder="2"
                      value={recipeDraft.servings}
                      onChange={updateDraftField('servings')}
                    />
                  </div>

                  <div className="recipes-create-field recipes-create-field-full">
                    <label htmlFor="recipe-description">Descrição</label>
                    <textarea
                      id="recipe-description"
                      className="form-control"
                      rows={3}
                      placeholder="Uma breve descrição da receita..."
                      value={recipeDraft.description}
                      onChange={updateDraftField('description')}
                    />
                  </div>

                  <div className="recipes-create-field">
                    <label htmlFor="recipe-prep-time">Tempo de preparação (min)</label>
                    <input
                      id="recipe-prep-time"
                      type="number"
                      min="0"
                      className="form-control"
                      placeholder="15"
                      value={recipeDraft.prepTimeMin}
                      onChange={updateDraftField('prepTimeMin')}
                    />
                  </div>

                  <div className="recipes-create-field">
                    <label htmlFor="recipe-cook-time">Tempo de cozinha (min)</label>
                    <input
                      id="recipe-cook-time"
                      type="number"
                      min="0"
                      className="form-control"
                      placeholder="30"
                      value={recipeDraft.cookTimeMin}
                      onChange={updateDraftField('cookTimeMin')}
                    />
                  </div>

                  <div className="recipes-create-field">
                    <label htmlFor="recipe-calories">Calorias (kcal)</label>
                    <input
                      id="recipe-calories"
                      type="number"
                      min="0"
                      className="form-control"
                      placeholder="450"
                      value={recipeDraft.calories}
                      onChange={updateDraftField('calories')}
                    />
                  </div>

                  <div className="recipes-create-field">
                    <label htmlFor="recipe-protein">Proteína (g)</label>
                    <input
                      id="recipe-protein"
                      type="number"
                      min="0"
                      className="form-control"
                      placeholder="30"
                      value={recipeDraft.proteinG}
                      onChange={updateDraftField('proteinG')}
                    />
                  </div>

                  <div className="recipes-create-field">
                    <label htmlFor="recipe-carbs">Hidratos (g)</label>
                    <input
                      id="recipe-carbs"
                      type="number"
                      min="0"
                      className="form-control"
                      placeholder="55"
                      value={recipeDraft.carbsG}
                      onChange={updateDraftField('carbsG')}
                    />
                  </div>

                  <div className="recipes-create-field">
                    <label htmlFor="recipe-fat">Gordura (g)</label>
                    <input
                      id="recipe-fat"
                      type="number"
                      min="0"
                      className="form-control"
                      placeholder="12"
                      value={recipeDraft.fatG}
                      onChange={updateDraftField('fatG')}
                    />
                  </div>

                  <div className="recipes-create-field recipes-create-field-full">
                    <label htmlFor="recipe-ingredients">Ingredientes</label>
                    <textarea
                      id="recipe-ingredients"
                      className="form-control"
                      rows={4}
                      placeholder="Um ingrediente por linha, ex:&#10;200g de massa&#10;1 lata de atum&#10;Espinafres a gosto"
                      value={recipeDraft.ingredients}
                      onChange={updateDraftField('ingredients')}
                    />
                  </div>

                  <div className="recipes-create-field recipes-create-field-full">
                    <label htmlFor="recipe-steps">Passos de preparação</label>
                    <textarea
                      id="recipe-steps"
                      className="form-control"
                      rows={4}
                      placeholder="Um passo por linha, ex:&#10;Cozer a massa em água com sal&#10;Escorrer e reservar&#10;Misturar o atum e os espinafres"
                      value={recipeDraft.steps}
                      onChange={updateDraftField('steps')}
                    />
                  </div>

                  <div className="recipes-create-field recipes-create-field-full">
                    <label>Visibilidade</label>
                    <div className="recipes-visibility-options" role="radiogroup" aria-label="Visibilidade da receita">
                      <label className={`recipes-visibility-pill ${recipeDraft.visibility === 'public' ? 'active' : ''}`}>
                        <input
                          type="radio"
                          name="recipe-visibility"
                          value="public"
                          checked={recipeDraft.visibility === 'public'}
                          onChange={updateDraftField('visibility')}
                        />
                        Pública — visível para todos
                      </label>
                      <label className={`recipes-visibility-pill ${recipeDraft.visibility === 'private' ? 'active' : ''}`}>
                        <input
                          type="radio"
                          name="recipe-visibility"
                          value="private"
                          checked={recipeDraft.visibility === 'private'}
                          onChange={updateDraftField('visibility')}
                        />
                        Privada — só tu vês
                      </label>
                    </div>
                  </div>

                  <div className="recipes-create-field recipes-create-field-full">
                    <label htmlFor="recipe-image-url">Imagem (URL)</label>
                    <input
                      id="recipe-image-url"
                      type="url"
                      className="form-control"
                      placeholder="https://exemplo.com/imagem-da-receita.jpg"
                      value={recipeDraft.imageUrl || ''}
                      onChange={updateDraftField('imageUrl')}
                    />
                    {recipeDraft.imageUrl ? (
                      <img src={recipeDraft.imageUrl} alt="Pré-visualização da receita" className="recipes-photo-preview" />
                    ) : (
                      <div className="recipes-photo-placeholder">Cole uma URL de imagem acima para pré-visualizar</div>
                    )}
                  </div>
                </div>

                {createNotice ? (
                  <div className="alert alert-info recipes-create-notice" role="status">{createNotice}</div>
                ) : null}

                <div className="recipes-create-actions">
                  <button type="submit" className="btn btn-primary">Criar receita</button>
                </div>
              </form>
            </section>
          ) : null}

          {activeInnerTab === 'mine' ? (
            <section className="recipes-mine card" aria-label="Suas receitas">
              <header className="recipes-mine-head">
                <h3>Suas receitas</h3>
                <p>Lista das tuas receitas. As privadas aparecem mais escuras e podes alterar a qualquer momento.</p>
              </header>

              {myRecipesLoading ? (
                <div className="text-center py-4">
                  <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">A carregar...</span>
                  </div>
                </div>
              ) : myRecipes.length === 0 ? (
                <div className="alert alert-secondary" role="status">
                  Ainda não tens receitas criadas. Vai à aba "Criar receita" para adicionar a primeira.
                </div>
              ) : (
                <div className="recipes-mine-grid">
                  {myRecipes.map((recipe) => {
                    const isPrivate = recipe.visibility === 'PRIVATE';
                    return (
                      <article key={recipe.id} className={`my-recipe-card ${isPrivate ? 'is-private' : 'is-public'}`}>
                        <img
                          src={recipe.imageUrl || recipe.image}
                          alt={recipe.name}
                          loading="lazy"
                          className="my-recipe-thumb"
                          onError={(event) => {
                            event.currentTarget.onerror = null;
                            event.currentTarget.src = 'https://placehold.co/900x560/e2e8f0/475569?text=Receita';
                          }}
                        />
                        <div className="my-recipe-body">
                          <div className="my-recipe-top">
                            <h4>{recipe.name}</h4>
                            <span className={`my-recipe-visibility ${isPrivate ? 'private' : 'public'}`}>
                              {isPrivate ? 'Privada' : 'Pública'}
                            </span>
                          </div>
                          <p>{recipe.description}</p>
                          <div className="my-recipe-actions">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary"
                              onClick={() => toggleMyRecipeVisibility(recipe.id)}
                            >
                              {isPrivate ? 'Tornar pública' : 'Tornar privada'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary"
                              onClick={() => openEditRecipeDialog(recipe)}
                            >
                              Editar receita
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          ) : null}

          {activeInnerTab === 'favorites' ? (
            <section className="recipes-favorites card" aria-label="Receitas favoritas">
              <header className="recipes-mine-head">
                <h3>⭐ Receitas favoritas</h3>
                <p>Receitas de outros utilizadores que marcaste como favoritas. Também ficam disponíveis para o chatbot.</p>
              </header>

              {favoritesLoading ? (
                <div className="text-center py-4">
                  <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">A carregar...</span>
                  </div>
                </div>
              ) : favoriteRecipes.length === 0 ? (
                <div className="alert alert-secondary" role="status">
                  Ainda não tens receitas favoritas. Vai à aba "Todas as Receitas" e clica na ⭐ para marcar.
                </div>
              ) : (
                <div className="recipes-mine-grid">
                  {favoriteRecipes.map((recipe) => (
                    <article key={recipe.id} className="my-recipe-card is-public">
                      <img
                        src={recipe.imageUrl || recipe.image}
                        alt={recipe.name}
                        loading="lazy"
                        className="my-recipe-thumb"
                        onError={(event) => {
                          event.currentTarget.onerror = null;
                          event.currentTarget.src = 'https://placehold.co/900x560/e2e8f0/475569?text=Receita';
                        }}
                      />
                      <div className="my-recipe-body">
                        <div className="my-recipe-top">
                          <h4>{recipe.name}</h4>
                          <button
                            type="button"
                            className="recipe-fav-btn is-fav"
                            title="Remover dos favoritos"
                            onClick={() => handleToggleFavorite(recipe.id)}
                          >
                            <Star size={18} fill="currentColor" />
                          </button>
                        </div>
                        <p>{recipe.description || `${recipe.prepTimeMin || '?'} min prep · ${recipe.cookTimeMin || '?'} min cook`}</p>
                        <div className="my-recipe-actions">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => {
                              setSelectedNutritionistRecipe(recipe);
                            }}
                          >
                            Ver detalhes
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : null}
        </div>
      </div>

      {confirmDialog.open ? (
        <div
          className="recipes-confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={confirmDialog.title || 'Confirmar ação'}
          onClick={closeConfirmDialog}
        >
          <div className="recipes-confirm-card" onClick={(event) => event.stopPropagation()}>
            <h4>{confirmDialog.title || 'Confirmar ação'}</h4>
            <p>{confirmDialog.message}</p>
            <div className="recipes-confirm-actions">
              <button type="button" className="btn btn-outline-secondary" onClick={closeConfirmDialog}>
                Cancelar
              </button>
              <button
                type="button"
                className={`btn ${confirmDialog.tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
                onClick={handleConfirmDialog}
              >
                {confirmDialog.confirmLabel || 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editRecipeDialog.open ? (
        <div
          className="recipes-edit-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Editar receita"
          onClick={closeEditRecipeDialog}
        >
          <div className="recipes-edit-card" onClick={(event) => event.stopPropagation()}>
            <header className="recipes-edit-head">
              <h4>Editar receita</h4>
              <button type="button" className="recipes-edit-close" onClick={closeEditRecipeDialog} aria-label="Fechar edição">
                <X size={16} />
              </button>
            </header>

            <form className="recipes-edit-form" onSubmit={saveEditedRecipe}>
              <div className="recipes-edit-field">
                <label htmlFor="edit-recipe-name">Nome da receita</label>
                <input
                  id="edit-recipe-name"
                  type="text"
                  className="form-control"
                  value={editRecipeDialog.name}
                  onChange={updateEditRecipeField('name')}
                />
              </div>

              <div className="recipes-edit-field">
                <label htmlFor="edit-recipe-visibility">Visibilidade</label>
                <select
                  id="edit-recipe-visibility"
                  className="form-control"
                  value={editRecipeDialog.visibility}
                  onChange={updateEditRecipeField('visibility')}
                >
                  <option value="private">Privada</option>
                  <option value="public">Pública</option>
                </select>
              </div>

              <div className="recipes-edit-field recipes-edit-field-full">
                <label htmlFor="edit-recipe-ingredients">Ingredientes</label>
                <textarea
                  id="edit-recipe-ingredients"
                  rows={4}
                  className="form-control"
                  value={editRecipeDialog.ingredients}
                  onChange={updateEditRecipeField('ingredients')}
                />
              </div>

              <div className="recipes-edit-field recipes-edit-field-full">
                <label htmlFor="edit-recipe-steps">Passos</label>
                <textarea
                  id="edit-recipe-steps"
                  rows={4}
                  className="form-control"
                  value={editRecipeDialog.steps}
                  onChange={updateEditRecipeField('steps')}
                />
              </div>

              <div className="recipes-edit-field">
                <label htmlFor="edit-recipe-utensils">Utensílios recomendados</label>
                <input
                  id="edit-recipe-utensils"
                  type="text"
                  className="form-control"
                  value={editRecipeDialog.utensils}
                  onChange={updateEditRecipeField('utensils')}
                />
              </div>

              <div className="recipes-edit-field">
                <label htmlFor="edit-recipe-allergens">Alergénios</label>
                <input
                  id="edit-recipe-allergens"
                  type="text"
                  className="form-control"
                  value={editRecipeDialog.allergens}
                  onChange={updateEditRecipeField('allergens')}
                />
              </div>

              <div className="recipes-edit-field recipes-edit-field-full">
                <label htmlFor="edit-recipe-image">Imagem (URL)</label>
                <input
                  id="edit-recipe-image"
                  type="url"
                  className="form-control"
                  placeholder="https://..."
                  value={editRecipeDialog.image}
                  onChange={updateEditRecipeField('image')}
                />
              </div>

              {editNotice ? (
                <div className="alert alert-info recipes-edit-notice" role="status">
                  {editNotice}
                </div>
              ) : null}

              {showDeleteConfirmInEdit ? (
                <div className="recipes-edit-delete-confirm" role="alert">
                  <p>Tem a certeza que quer apagar esta receita?</p>
                  <div className="recipes-edit-delete-actions">
                    <button type="button" className="btn btn-outline-secondary" onClick={cancelDeleteFromEditDialog}>
                      Cancelar
                    </button>
                    <button type="button" className="btn btn-danger" onClick={confirmDeleteFromEditDialog}>
                      Sim, apagar
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="recipes-edit-actions">
                <button type="button" className="btn btn-outline-danger" onClick={requestDeleteFromEditDialog}>
                  Eliminar receita
                </button>
                <button type="submit" className="btn btn-primary">
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {selectedNutritionistRecipe ? (
        <div className="recipe-summary-overlay" role="dialog" aria-modal="true" aria-label="Resumo da receita" onClick={closeNutritionistModal}>
          <div className="recipe-summary-card" onClick={(event) => event.stopPropagation()}>
            <header className="recipe-summary-head">
              <div>
                <h3>{selectedNutritionistRecipe?.name || 'Receita'}</h3>
                <p>{mealTypeLabel(selectedNutritionistRecipe?.mealType)} · {formatDuration(selectedNutritionistRecipe)}</p>
              </div>
              <button type="button" className="recipe-summary-close" onClick={closeNutritionistModal} aria-label="Fechar resumo">
                <X size={16} />
              </button>
            </header>

            <p className="recipe-summary-description">
              {String(selectedNutritionistRecipe?.description || '').trim() || 'Sem descrição disponível.'}
            </p>

            <div className="recipe-summary-metrics">
              <span><Flame size={14} /> {nutritionistCalories > 0 ? `${nutritionistCalories} kcal` : 'kcal N/A'}</span>
              <span><Clock3 size={14} /> {formatDuration(selectedNutritionistRecipe)}</span>
              <span><Euro size={14} /> {formatPrice(selectedNutritionistRecipe)}</span>
              <span>🍗 {proteinG > 0 ? `${Math.round(proteinG)}g` : '--'} proteína</span>
              <span>🍚 {carbsG > 0 ? `${Math.round(carbsG)}g` : '--'} hidratos</span>
              <span>🥑 {fatG > 0 ? `${Math.round(fatG)}g` : '--'} gordura</span>
            </div>

            <div className="recipe-summary-sections">
              <section>
                <h4>Ingredientes</h4>
                {nutritionistIngredients.length === 0 ? (
                  <p>Sem ingredientes detalhados.</p>
                ) : (
                  <ul>
                    {nutritionistIngredients.map((ingredient, index) => (
                      <li key={`${ingredient?.id || index}-${ingredient?.ingredientName || 'ingredient'}`}>
                        {formatIngredient(ingredient)}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h4>Passos</h4>
                {nutritionistSteps.length === 0 ? (
                  <p>Sem passos detalhados.</p>
                ) : (
                  <ol>
                    {nutritionistSteps.map((step, index) => (
                      <li key={`${step?.stepOrder || index}-${step?.description || 'step'}`}>
                        {String(step?.description || '').trim() || 'Passo'}
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </Layout>
  );
}

