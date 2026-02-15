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


export async function requestPasswordReset({ email }) {
  try {
    const { data } = await client.post('/api/auth/forgot-password', { email });
    return {
      message:
        typeof data?.message === 'string' && data.message.trim()
          ? data.message.trim()
          : 'Se o email existir, enviámos instruções para recuperar a password.',
    };
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function resetPassword({ token, newPassword }) {
  try {
    const { data } = await client.post('/api/auth/reset-password', { token, newPassword });
    return {
      message:
        typeof data?.message === 'string' && data.message.trim()
          ? data.message.trim()
          : 'Password atualizada com sucesso.',
    };
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}
