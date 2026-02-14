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

  return 'Não foi possível carregar os preços.';
}

export async function listLatestPrices() {
  try {
    const { data } = await client.get('/api/prices');
    return Array.isArray(data) ? data : [];
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function listIngredientPrices(ingredient) {
  const normalizedIngredient = String(ingredient || '').trim();
  if (!normalizedIngredient) {
    return [];
  }

  try {
    const { data } = await client.get(`/api/prices/${encodeURIComponent(normalizedIngredient)}`);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function getCheapestIngredientPrice(ingredient) {
  const normalizedIngredient = String(ingredient || '').trim();
  if (!normalizedIngredient) {
    throw new Error('Ingrediente inválido.');
  }

  try {
    const { data } = await client.get(
      `/api/prices/${encodeURIComponent(normalizedIngredient)}/cheapest`,
    );
    return data;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function importPriceReport(rawPayload) {
  const payload =
    typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload || {});

  try {
    const { data } = await client.post('/api/prices/import', payload, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return data;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}
