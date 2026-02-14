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

  return 'Não foi possível guardar o perfil.';
}

function buildAuthHeaders(token) {
  const cleanToken = String(token || '').trim();
  if (!cleanToken) {
    throw new Error('Sessão inválida. Faz login novamente.');
  }
  return {
    Authorization: `Bearer ${cleanToken}`,
  };
}

export async function fetchMyProfile(token) {
  try {
    const { data } = await client.get('/api/users/me', {
      headers: buildAuthHeaders(token),
    });
    return data;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function updateMyProfile(token, profilePayload) {
  try {
    const { data } = await client.put('/api/users/me/profile', profilePayload, {
      headers: buildAuthHeaders(token),
    });
    return data;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}
