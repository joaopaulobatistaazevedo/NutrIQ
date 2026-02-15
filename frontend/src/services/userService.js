import axios from 'axios';
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

export function resolveProfilePictureUrl(rawPath) {
  const value = String(rawPath || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  const normalized = value.startsWith('/') ? value : `/${value}`;
  return `${API_BASE_URL}${normalized}`;
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

export async function uploadProfilePhoto(token, file) {
  if (!(file instanceof File)) {
    throw new Error('Ficheiro de imagem inválido.');
  }

  const formData = new FormData();
  formData.append('file', file);

  try {
    const headers = {
      ...buildAuthHeaders(token),
      'ngrok-skip-browser-warning': 'true',
    };

    const { data } = await axios.post(`${API_BASE_URL}/api/social/posts/upload`, formData, { headers });
    const picturePath = String(data?.picturePath || '').trim();

    if (!picturePath) {
      throw new Error('Não foi possível guardar a imagem no servidor.');
    }

    await updateMyProfile(token, { picturePath });
    return picturePath;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}
