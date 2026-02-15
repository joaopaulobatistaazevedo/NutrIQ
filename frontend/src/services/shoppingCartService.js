import { getAuthSession } from '../utils/authSession';
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

  return 'Não foi possível persistir o carrinho.';
}

function authHeadersOrNull() {
  const token = String(getAuthSession()?.token || '').trim();
  if (!token) {
    return null;
  }
  return {
    Authorization: `Bearer ${token}`,
  };
}

export async function fetchPersistedShoppingCart() {
  const headers = authHeadersOrNull();
  if (!headers) return null;

  try {
    const { data } = await client.get('/api/shopping-cart', { headers });
    return data || null;
  } catch (error) {
    const status = error?.response?.status;
    if (status === 404 || status === 400) {
      return null;
    }
    throw new Error(normalizeError(error));
  }
}

export async function savePersistedShoppingCart(payload) {
  const headers = authHeadersOrNull();
  if (!headers) return null;

  try {
    const { data } = await client.put('/api/shopping-cart', payload || {}, { headers });
    return data || null;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}
