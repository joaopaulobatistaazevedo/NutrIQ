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

  return 'Não foi possível completar o pedido de autenticação.';
}

function validateAuthResponse(data) {
  const token = typeof data?.token === 'string' ? data.token.trim() : '';
  const userId = data?.userId;

  if (!token || (typeof userId !== 'number' && typeof userId !== 'string')) {
    throw new Error('Resposta de autenticação inválida.');
  }

  return {
    token,
    userId: Number(userId),
  };
}

export async function loginUser({ email, password }) {
  try {
    const { data } = await client.post('/api/auth/login', { email, password });
    return validateAuthResponse(data);
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function registerUser({ name, email, password }) {
  try {
    const { data } = await client.post('/api/auth/register', { name, email, password });
    return validateAuthResponse(data);
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}
