import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Camera, ChevronLeft, Flame, Send, TrendingUp, Wallet } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList } from 'recharts';
import Layout from '../components/Layout';
import { listLatestPrices } from '../services/priceService';
import { fetchActiveMealPlan } from '../services/mealPlanService';
import { fetchRecipeById, fetchRecipes } from '../services/recipeService';
import { registerMealPhoto } from '../services/nutriSocialService';
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
  const [description, setDescription] = useState('');
  const [shareOnNutriSocial, setShareOnNutriSocial] = useState(true);
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
      const payload = {
        picturePath: cleanPhotoPath,
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
          ? 'Foto registada, streak atualizado e publicação enviada para o NutriSocial.'
          : 'Foto registada e streak atualizado com sucesso.',
      );

      setDescription('');
      setSelectedRecipeId('');
      setRating(5);
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
            <header className="progress-header page-header d-print-none">
              <div>
                <h1 className="page-title">Progresso Semanal</h1>
                <p>Resumo simples da tua evolução em calorias, consistência e custo diário.</p>
              </div>
              <div className="progress-tag badge bg-primary-lt text-primary">
                <BarChart3 size={16} />
                {isLoading ? 'A sincronizar...' : 'Últimos 7 dias'}
              </div>
            </header>

            <section className="progress-summary-grid">
              <article className="progress-summary-card card">
                <span className="progress-summary-icon"><Flame size={16} /></span>
                <strong>{summary.avgCalories} kcal</strong>
                <p>Média diária</p>
              </article>

              <article className="progress-summary-card card">
                <span className="progress-summary-icon"><Wallet size={16} /></span>
                <strong>€{summary.avgBudget}</strong>
                <p>Custo médio/dia</p>
              </article>

              <article className="progress-summary-card card">
                <span className="progress-summary-icon"><TrendingUp size={16} /></span>
                <strong>{summary.adherence > 0 ? '+' : ''}{summary.adherence}%</strong>
                <p>Consistência</p>
              </article>
            </section>

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

                <label className="form-check d-inline-flex align-items-center gap-2 mt-1">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    checked={shareOnNutriSocial}
                    onChange={(event) => setShareOnNutriSocial(event.target.checked)}
                  />
                  <span className="form-check-label">Partilhar automaticamente no NutriSocial</span>
                </label>

                {shareOnNutriSocial ? (
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

            <section className="progress-combined-card card">
              <div className="progress-combined-block">
                <h2>Calorias por dia</h2>
                <div className="progress-merged-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 28, right: 14, left: 4, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="#dce5f0" />
                      <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        width={44}
                        tick={{ fill: '#90a0b6', fontSize: 12 }}
                        tickFormatter={(value) => `${value}`}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(34, 204, 154, 0.08)' }}
                        contentStyle={{ borderRadius: 12, border: '1px solid #d4deeb', background: '#f9fbfd' }}
                        labelStyle={{ color: '#1e293b' }}
                        formatter={(value) => [`${value} kcal`, 'Calorias']}
                      />
                      <Bar dataKey="calories" fill="#22cc9a" radius={[8, 8, 0, 0]} maxBarSize={52}>
                        <LabelList dataKey="priceLabel" position="top" fill="#334155" fontSize={12} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {loadError ? <p className="progress-load-note">{loadError}</p> : null}
              </div>
            </section>
          </div>
        </div>
      </div>
    </Layout>
  );
}
