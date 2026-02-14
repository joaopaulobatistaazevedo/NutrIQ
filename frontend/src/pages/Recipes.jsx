import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock3, Euro, Flame, Layers, X } from 'lucide-react';
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

function CategoryCarousel({ category, onOpenNutritionistRecipe }) {
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
  const [recipeDraft, setRecipeDraft] = useState({
    name: '',
    ingredients: '',
    steps: '',
    utensils: '',
    allergens: '',
    visibility: 'private',
    photoFile: null,
    photoPreview: '',
  });

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

        setMyRecipes((previous) => {
          if (previous.length > 0) {
            return previous;
          }

          return safeData.slice(0, 3).map((recipe, index) => ({
            id: `seed-${recipe?.id || index}`,
            name: String(recipe?.name || `Receita ${index + 1}`),
            description: String(recipe?.description || '').trim() || 'Sem descrição detalhada.',
            image: recipeImageFor(recipe),
            visibility: index === 0 ? 'private' : 'public',
            sourceUrl: extractSourceUrl(recipe),
          }));
        });
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

  useEffect(() => () => {
    if (String(recipeDraft.photoPreview || '').startsWith('blob:')) {
      URL.revokeObjectURL(recipeDraft.photoPreview);
    }
  }, [recipeDraft.photoPreview]);

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

  const handlePhotoChange = (event) => {
    const file = event.target.files?.[0] || null;
    setCreateNotice('');

    setRecipeDraft((previous) => {
      if (String(previous.photoPreview || '').startsWith('blob:')) {
        URL.revokeObjectURL(previous.photoPreview);
      }

      if (!file) {
        return {
          ...previous,
          photoFile: null,
          photoPreview: '',
        };
      }

      return {
        ...previous,
        photoFile: file,
        photoPreview: URL.createObjectURL(file),
      };
    });
  };

  const removeDraftPhoto = () => {
    setCreateNotice('');
    setRecipeDraft((previous) => {
      if (String(previous.photoPreview || '').startsWith('blob:')) {
        URL.revokeObjectURL(previous.photoPreview);
      }
      return {
        ...previous,
        photoFile: null,
        photoPreview: '',
      };
    });
  };

  const toggleMyRecipeVisibility = (recipeId) => {
    setMyRecipes((previous) => previous.map((recipe) => {
      if (recipe.id !== recipeId) {
        return recipe;
      }
      return {
        ...recipe,
        visibility: recipe.visibility === 'private' ? 'public' : 'private',
      };
    }));
  };

  const handleCreateSubmit = (event) => {
    event.preventDefault();

    const recipeName = String(recipeDraft.name || '').trim();
    if (!recipeName) {
      setCreateNotice('Indica pelo menos o nome da receita.');
      return;
    }

    const cardImage = recipeDraft.photoFile
      ? URL.createObjectURL(recipeDraft.photoFile)
      : '';

    const createdRecipe = {
      id: `mine-${Date.now()}`,
      name: recipeName,
      description: String(recipeDraft.steps || '').trim() || 'Receita criada manualmente.',
      image: cardImage || 'https://placehold.co/900x560/e2e8f0/475569?text=Receita+Criada',
      visibility: recipeDraft.visibility === 'public' ? 'public' : 'private',
      sourceUrl: '',
    };

    setMyRecipes((previous) => [createdRecipe, ...previous]);
    setRecipeDraft({
      name: '',
      ingredients: '',
      steps: '',
      utensils: '',
      allergens: '',
      visibility: 'private',
      photoFile: null,
      photoPreview: '',
    });

    setCreateNotice('Receita adicionada em "Suas receitas".');
    setActiveInnerTab('mine');
  };

  return (
    <Layout>
      <div className="page recipes-page">
        <div className="container-xl">
          <header className="page-header d-print-none mb-3">
            <div>
              <h2 className="page-title">Receitas por Base</h2>
              <p className="text-secondary mb-0">
                Organização por categoria para veres receitas parecidas juntas
                como pediste (ex: carbonara e bolonhesa na base massa).
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
              Receitas feitas
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
                  />
                ))}
              </div>
            </>
          ) : null}

          {activeInnerTab === 'create' ? (
            <section className="recipes-create card" aria-label="Criar receita">
              <header className="recipes-create-head">
                <h3>Criar receita</h3>
                <p>Preenche a base da receita com nome, ingredientes, passos, utensílios, alergénios e foto.</p>
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
                    />
                  </div>

                  <div className="recipes-create-field">
                    <label htmlFor="recipe-ingredients">Ingredientes</label>
                    <textarea
                      id="recipe-ingredients"
                      className="form-control"
                      rows={6}
                      placeholder={'Ex: 200g massa\n150g atum\n1 chávena espinafres'}
                      value={recipeDraft.ingredients}
                      onChange={updateDraftField('ingredients')}
                    />
                  </div>

                  <div className="recipes-create-field">
                    <label htmlFor="recipe-steps">Passos</label>
                    <textarea
                      id="recipe-steps"
                      className="form-control"
                      rows={6}
                      placeholder={'Ex: 1) Cozer a massa\n2) Saltear espinafres\n3) Misturar com atum'}
                      value={recipeDraft.steps}
                      onChange={updateDraftField('steps')}
                    />
                  </div>

                  <div className="recipes-create-field">
                    <label htmlFor="recipe-utensils">Utensílios recomendados</label>
                    <textarea
                      id="recipe-utensils"
                      className="form-control"
                      rows={4}
                      placeholder={'Ex: Panela\nFrigideira\nEscorredor'}
                      value={recipeDraft.utensils}
                      onChange={updateDraftField('utensils')}
                    />
                  </div>

                  <div className="recipes-create-field">
                    <label htmlFor="recipe-allergens">Alergénios</label>
                    <textarea
                      id="recipe-allergens"
                      className="form-control"
                      rows={4}
                      placeholder={'Ex: Glúten\nPeixe\nLactose'}
                      value={recipeDraft.allergens}
                      onChange={updateDraftField('allergens')}
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
                        Pública
                      </label>
                      <label className={`recipes-visibility-pill ${recipeDraft.visibility === 'private' ? 'active' : ''}`}>
                        <input
                          type="radio"
                          name="recipe-visibility"
                          value="private"
                          checked={recipeDraft.visibility === 'private'}
                          onChange={updateDraftField('visibility')}
                        />
                        Privada
                      </label>
                    </div>
                  </div>

                  <div className="recipes-create-field recipes-create-field-full">
                    <label htmlFor="recipe-photo">Foto da receita</label>
                    <div className="recipes-photo-upload-row">
                      <input
                        id="recipe-photo"
                        type="file"
                        accept="image/*"
                        className="form-control"
                        onChange={handlePhotoChange}
                      />
                      {recipeDraft.photoPreview ? (
                        <button type="button" className="btn btn-outline-secondary" onClick={removeDraftPhoto}>
                          Remover foto
                        </button>
                      ) : null}
                    </div>

                    {recipeDraft.photoPreview ? (
                      <img src={recipeDraft.photoPreview} alt="Pré-visualização da receita" className="recipes-photo-preview" />
                    ) : (
                      <div className="recipes-photo-placeholder">Sem foto selecionada</div>
                    )}
                  </div>
                </div>

                {createNotice ? (
                  <div className="alert alert-info recipes-create-notice" role="status">{createNotice}</div>
                ) : null}

                <div className="recipes-create-actions">
                  <button type="submit" className="btn btn-primary">Guardar base da receita</button>
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

              {myRecipes.length === 0 ? (
                <div className="alert alert-secondary" role="status">
                  Ainda não tens receitas criadas. Vai à aba "Criar receita" para adicionar a primeira.
                </div>
              ) : (
                <div className="recipes-mine-grid">
                  {myRecipes.map((recipe) => {
                    const isPrivate = recipe.visibility === 'private';
                    return (
                      <article key={recipe.id} className={`my-recipe-card ${isPrivate ? 'is-private' : 'is-public'}`}>
                        <img
                          src={recipe.image}
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
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          ) : null}
        </div>
      </div>

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
