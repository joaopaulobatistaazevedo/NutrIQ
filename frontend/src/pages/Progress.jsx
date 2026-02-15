import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Camera, ChevronLeft, Flame, Send, TrendingUp, Wallet } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList } from 'recharts';
import Layout from '../components/Layout';
import { listLatestPrices } from '../services/priceService';
import { fetchActiveMealPlan } from '../services/mealPlanService';
import { fetchRecipeById, fetchRecipes } from '../services/recipeService';
import { registerMealPhoto, uploadSocialPostImage } from '../services/nutriSocialService';
import { fetchMyProfile } from '../services/userService';
import { getAuthSession } from '../utils/authSession';
import '../styles/progress.css';

const WEEK = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function estimateWeeklySpend(prices) {
  const cheapestByIngredient = new Map();

  prices.forEach((entry) => {
    const ingredient = String(entry?.ingredientNormalized || '').trim();
    const price = Number(entry?.price);
    if (!ingredient || !Number.isFinite(price)) {
      return;
    }

    const previous = cheapestByIngredient.get(ingredient);
    if (previous === undefined || price < previous) {
      cheapestByIngredient.set(ingredient, price);
    }
  });

  return Array.from(cheapestByIngredient.values()).reduce((sum, value) => sum + value, 0);
}

function toNumberOr(defaultValue, value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function buildPreviewFromFile(file) {
  if (!file) return '';
  return URL.createObjectURL(file);
}

function recipeCalories(recipe) {
  const direct = Number(recipe?.calories);
  if (Number.isFinite(direct)) {
    return Math.max(0, direct);
  }

  const nested = Number(recipe?.nutritionalInfo?.calories);
  if (Number.isFinite(nested)) {
    return Math.max(0, nested);
  }

  return 0;
}

function recipeCost(recipe) {
  const candidates = [
    recipe?.costPerServing,
    recipe?.estimatedCostPerServing,
    recipe?.estimatedCost,
    recipe?.price,
  ];

  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return 0;
}

function buildWeeklySeries(activePlan, recipeById, fallbackDailyCost, dailyGoal) {
  const planDays = Array.isArray(activePlan?.days) ? activePlan.days : [];

  const calories = WEEK.map((label) => {
    const day = planDays.find((entry) => entry?.day_label === label);
    const meals = Array.isArray(day?.meals) ? day.meals : [];

    const total = meals.reduce((sum, meal) => {
      const recipe = recipeById.get(Number(meal?.recipe_id));
      return sum + recipeCalories(recipe);
    }, 0);

    if (total > 0) {
      return Math.round(total);
    }

    return 0;
  });

  const costs = WEEK.map((label) => {
    const day = planDays.find((entry) => entry?.day_label === label);
    const meals = Array.isArray(day?.meals) ? day.meals : [];

    const total = meals.reduce((sum, meal) => {
      const recipe = recipeById.get(Number(meal?.recipe_id));
      return sum + recipeCost(recipe);
    }, 0);

    if (total > 0) {
      return Number(total.toFixed(2));
    }

    return Number(fallbackDailyCost.toFixed(2));
  });

  if (calories.every((value) => value === 0) && dailyGoal > 0) {
    return {
      calories: WEEK.map(() => dailyGoal),
      costs,
    };
  }

  return {
    calories,
    costs,
  };
}

export default function Progress() {
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [calories, setCalories] = useState(() => WEEK.map(() => 0));
  const [budget, setBudget] = useState(() => WEEK.map(() => 0));
  const [streakCount, setStreakCount] = useState(0);

  const [recipes, setRecipes] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState('');
  const [photoPath, setPhotoPath] = useState('');
  const [photoPreview, setPhotoPreview] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [description, setDescription] = useState('');
  const [postVisibility, setPostVisibility] = useState('public');
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const [rating, setRating] = useState(5);

  useEffect(() => {
    let isMounted = true;

    const run = async () => {
      setIsLoading(true);
      setLoadError('');

      const token = getAuthSession()?.token;
      if (!token) {
        if (isMounted) {
          setLoadError('Sessão inválida. Faz login novamente.');
          setIsLoading(false);
        }
        return;
      }

      try {
        const [apiUserResult, pricesResult, recipeListResult, activePlanResult] = await Promise.allSettled([
          fetchMyProfile(token),
          listLatestPrices(),
          fetchRecipes({ limit: 300 }),
          fetchActiveMealPlan().catch(() => null),
        ]);

        if (!isMounted) {
          return;
        }

        const apiUser = apiUserResult.status === 'fulfilled' ? apiUserResult.value : null;
        const prices = pricesResult.status === 'fulfilled' ? pricesResult.value : [];
        const recipeList = recipeListResult.status === 'fulfilled' ? recipeListResult.value : [];
        const activePlan = activePlanResult.status === 'fulfilled' ? activePlanResult.value : null;

        const profile = apiUser?.profile || {};
        const dailyGoal = Math.max(1200, Math.round(toNumberOr(2100, profile?.dailyCalories)));
        const weeklyBudget = Math.max(0, toNumberOr(0, profile?.budgetWeekly));
        const estimatedWeekSpend = estimateWeeklySpend(prices);
        const planTotalCost = Math.max(0, toNumberOr(0, activePlan?.total_cost));
        const weeklySpend = planTotalCost > 0 ? planTotalCost : estimatedWeekSpend > 0 ? estimatedWeekSpend : weeklyBudget;
        const dailyCostBase = weeklySpend > 0 ? weeklySpend / 7 : 0;

        const planDays = Array.isArray(activePlan?.days) ? activePlan.days : [];
        const uniqueRecipeIds = Array.from(
          new Set(
            planDays
              .flatMap((day) => (Array.isArray(day?.meals) ? day.meals : []))
              .map((meal) => Number(meal?.recipe_id))
              .filter((id) => Number.isInteger(id) && id > 0),
          ),
        );

        const recipeEntries = await Promise.all(
          uniqueRecipeIds.map(async (id) => {
            try {
              const recipe = await fetchRecipeById(id);
              return [id, recipe];
            } catch {
              return [id, null];
            }
          }),
        );
        const recipeById = new Map(recipeEntries);

        const weeklySeries = buildWeeklySeries(activePlan, recipeById, dailyCostBase, dailyGoal);
        const recipesFromPlan = recipeEntries
          .map(([, recipe]) => recipe)
          .filter((recipe) => recipe && Number.isInteger(Number(recipe?.id)) && Number(recipe.id) > 0);
        const recipeMap = new Map();
        [...recipeList, ...recipesFromPlan].forEach((recipe) => {
          const id = Number(recipe?.id);
          if (!Number.isInteger(id) || id <= 0) {
            return;
          }
          if (!recipeMap.has(id)) {
            recipeMap.set(id, recipe);
          }
        });

        setCalories(weeklySeries.calories);
        setBudget(weeklySeries.costs);
        setStreakCount(Math.max(0, Number(profile?.streakCount || 0)));
        setRecipes(Array.from(recipeMap.values()));

        if (apiUserResult.status === 'rejected') {
          setLoadError(apiUserResult.reason?.message || 'Não foi possível carregar o perfil completo.');
        } else if (recipeListResult.status === 'rejected') {
          setLoadError(recipeListResult.reason?.message || 'Não foi possível carregar a lista completa de receitas.');
        }
      } catch (error) {
        if (isMounted) {
          setLoadError(error.message || 'Não foi possível carregar o progresso.');
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
  }, []);

  useEffect(() => () => {
    if (photoPreview && photoPreview.startsWith('blob:')) {
      URL.revokeObjectURL(photoPreview);
    }
  }, [photoPreview]);

  const sortedRecipes = useMemo(
    () => [...recipes].sort((left, right) => String(left?.name || '').localeCompare(String(right?.name || ''))),
    [recipes],
  );

  const summary = useMemo(() => {
    const avgCalories = Math.round(calories.reduce((sum, value) => sum + value, 0) / calories.length);
    const avgBudget = (budget.reduce((sum, value) => sum + value, 0) / budget.length).toFixed(2);

    const adherence =
      100 -
      Math.min(
        40,
        Math.round(
          (calories.reduce((sum, value) => sum + Math.abs(value - avgCalories), 0) /
            (calories.length * Math.max(avgCalories, 1))) *
            100,
        ),
      );

    return {
      avgCalories,
      avgBudget,
      adherence,
    };
  }, [budget, calories]);

  const chartData = useMemo(
    () =>
      WEEK.map((day, index) => ({
        day,
        calories: calories[index],
        priceLabel: `€${Number(budget[index] || 0).toFixed(2)}`,
      })),
    [budget, calories],
  );

  const onPhotoChange = (event) => {
    const file = event?.target?.files?.[0];
    if (!file) {
      return;
    }

    if (photoPreview && photoPreview.startsWith('blob:')) {
      URL.revokeObjectURL(photoPreview);
    }

    const preview = buildPreviewFromFile(file);
    setPhotoPreview(preview);
    setPhotoPath(preview);
    setPhotoFile(file);
    setSubmitStatus('');
  };

  const handleSubmitPhoto = async (event) => {
    event.preventDefault();

    const token = getAuthSession()?.token;
    if (!token) {
      setSubmitStatus('Sessão inválida. Faz login novamente.');
      return;
    }

    const cleanPhotoPath = String(photoPath || '').trim();
    const shareOnNutriSocial = postVisibility === 'public';
    if (!cleanPhotoPath) {
      setSubmitStatus('Para aumentar o streak tens de tirar uma foto da refeição.');
      return;
    }

    if (shareOnNutriSocial && !selectedRecipeId) {
      setSubmitStatus('Seleciona uma receita para partilhar no NutriSocial.');
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus('');

    try {
      let finalPicturePath = cleanPhotoPath;
      if (photoFile instanceof File) {
        finalPicturePath = await uploadSocialPostImage(token, photoFile);
      } else if (cleanPhotoPath.startsWith('blob:')) {
        throw new Error('A foto selecionada expirou. Escolhe novamente a imagem antes de submeter.');
      }

      const payload = {
        picturePath: finalPicturePath,
        description: String(description || '').trim() || null,
        shareOnNutriSocial,
        recipeId: shareOnNutriSocial ? Number(selectedRecipeId) : null,
        rating: shareOnNutriSocial ? Number(rating) : null,
      };

      const result = await registerMealPhoto(token, payload);
      const nextStreak = Number(result?.streakCount || 0);
      setStreakCount(Number.isFinite(nextStreak) ? nextStreak : 0);

      setSubmitStatus(
        shareOnNutriSocial
          ? 'Refeição registada e publicada com sucesso. A redirecionar para o NutriSocial...'
          : 'Refeição registada como privada com sucesso. A redirecionar para o NutriSocial...',
      );

      setDescription('');
      setSelectedRecipeId('');
      setRating(5);
      setPostVisibility('public');
      setPhotoFile(null);
      setPhotoPath('');
      if (photoPreview && photoPreview.startsWith('blob:')) {
        URL.revokeObjectURL(photoPreview);
      }
      setPhotoPreview('');

      setTimeout(() => {
        navigate('/nutrisocial?tab=profile');
      }, 1200);
    } catch (error) {
      setSubmitStatus(error?.message || 'Não foi possível registar a foto.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="page">
        <div className="container-xl">
          <div className="progress-page">
            <section className="progress-photo-card card">
              <div className="progress-photo-header">
                <h2><Camera size={18} /> Check-in da refeição para streak</h2>
                <span className="badge bg-orange-lt text-orange d-inline-flex align-items-center gap-1">
                  <Flame size={12} /> {streakCount} dias
                </span>
              </div>

              <p className="progress-photo-note">Para subir o streak, regista uma foto da tua refeição. Podes partilhar no NutriSocial no mesmo passo.</p>

              <form className="progress-photo-form" onSubmit={handleSubmitPhoto}>
                <label className="form-label">Foto da refeição</label>
                <input className="form-control" type="file" accept="image/*" capture="environment" onChange={onPhotoChange} />

                {photoPreview ? <img src={photoPreview} alt="Pré-visualização da refeição" className="progress-photo-preview" /> : null}

                <label className="form-label">Descrição (opcional)</label>
                <textarea
                  className="form-control"
                  rows={3}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Ex: almoço com frango grelhado e legumes."
                />

                <div className="progress-visibility">
                  <label className="form-label mb-1">Visibilidade da refeição</label>
                  <div className="progress-visibility-options">
                    <label className="form-check d-inline-flex align-items-center gap-2">
                      <input
                        className="form-check-input"
                        type="radio"
                        name="postVisibility"
                        value="public"
                        checked={postVisibility === 'public'}
                        onChange={(event) => setPostVisibility(event.target.value)}
                      />
                      <span className="form-check-label">Pública (aparece no NutriSocial)</span>
                    </label>
                    <label className="form-check d-inline-flex align-items-center gap-2">
                      <input
                        className="form-check-input"
                        type="radio"
                        name="postVisibility"
                        value="private"
                        checked={postVisibility === 'private'}
                        onChange={(event) => setPostVisibility(event.target.value)}
                      />
                      <span className="form-check-label">Privada (só conta para streak)</span>
                    </label>
                  </div>
                  <small className="text-secondary">Tanto pública como privada contam para o teu streak.</small>
                </div>

                {postVisibility === 'public' ? (
                  <div className="progress-photo-grid">
                    <div>
                      <label className="form-label">Receita associada</label>
                      <select className="form-select" value={selectedRecipeId} onChange={(event) => setSelectedRecipeId(event.target.value)} required>
                        <option value="">Seleciona uma receita</option>
                        {sortedRecipes.map((recipe) => (
                          <option key={recipe?.id} value={recipe?.id}>{recipe?.name || `Receita #${recipe?.id}`}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="form-label">Avaliação (1-5)</label>
                      <input
                        className="form-control"
                        type="number"
                        min={1}
                        max={5}
                        value={rating}
                        onChange={(event) => setRating(event.target.value)}
                        required
                      />
                    </div>
                  </div>
                ) : null}

                <div className="progress-photo-actions">
                  <button type="submit" className="btn btn-primary progress-photo-submit" disabled={isSubmitting}>
                    <Send size={16} />
                    {isSubmitting ? 'A registar...' : 'Registar refeição'}
                  </button>
                  <button type="button" className="btn btn-outline-secondary progress-photo-back" onClick={() => navigate(-1)}>
                    <ChevronLeft size={16} />
                    Voltar atrás
                  </button>
                </div>

                {submitStatus ? <p className="progress-photo-feedback mb-0">{submitStatus}</p> : null}
              </form>
            </section>

            
          </div>
        </div>
      </div>
    </Layout>
  );
}
