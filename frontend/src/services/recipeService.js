import { createJsonClient } from './httpClient';

const API_BASE_URL = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:7071';

const client = createJsonClient(API_BASE_URL, 15000);

function normalizeError(error) {
  const payload = error?.response?.data;

  if (typeof payload?.error === 'string' && payload.error.trim()) {
    return payload.error.trim();
  }

  if (typeof payload?.message === 'string' && payload.message.trim()) {
    return payload.message.trim();
  }

  if (typeof error?.message === 'string' && error.message.trim()) {
    return error.message.trim();
  }

  return 'Não foi possível carregar as receitas.';
}

function normalizeRecipesPayload(data) {
  if (Array.isArray(data)) return data;

  const nestedCandidates = [
    data?.recipes,
    data?.items,
    data?.content,
    data?.data,
  ];

  for (const candidate of nestedCandidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  if (typeof data === 'string' && /<html|ngrok/i.test(data)) {
    throw new Error(
      'O túnel público está a devolver uma página intermédia (ngrok), não JSON da API. Verifica o URL/túnel do backend.',
    );
  }

  throw new Error('Formato de resposta inesperado ao carregar receitas.');
}

export async function fetchRecipes({ limit = 200, mealType = '' } = {}) {
  const params = {};
  if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
    params.limit = Math.round(limit);
  }
  if (mealType && String(mealType).trim()) {
    params.mealType = String(mealType).trim();
  }

  try {
    const { data } = await client.get('/api/recipes', { params });
    return normalizeRecipesPayload(data);
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function fetchRecipeById(recipeId) {
  const id = Number(recipeId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('ID de receita inválido.');
  }

  try {
    const { data } = await client.get(`/api/recipes/${id}`);
    return data || null;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function createRecipe(payload) {
  try {
    const { data } = await client.post('/api/recipes', payload);
    return data;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}
