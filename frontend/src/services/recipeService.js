import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:7071';

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

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
    return Array.isArray(data) ? data : [];
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
