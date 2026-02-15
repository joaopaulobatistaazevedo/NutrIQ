import { createJsonClient } from './httpClient';

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

const API_BASE_URL = normalizeBaseUrl(import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:7071');
const API_BASE_HOST = (() => {
  try {
    return new URL(API_BASE_URL).host.toLowerCase();
  } catch {
    return '';
  }
})();

const client = createJsonClient(API_BASE_URL, 20000);

function isEphemeralTunnelHost(host) {
  const normalized = String(host || '').trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1') return true;
  if (normalized.endsWith('.loca.lt')) return true;
  if (normalized.includes('ngrok')) return true;
  return false;
}

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

  return 'Não foi possível concluir a ação no NutriSocial.';
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

export async function fetchNutriSocialFeed(token) {
  try {
    const { data } = await client.get('/api/social/feed', {
      headers: buildAuthHeaders(token),
    });

    if (Array.isArray(data?.posts)) {
      return data.posts;
    }
    if (Array.isArray(data)) {
      return data;
    }
    return [];
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export function resolveNutriSocialImageUrl(rawPath) {
  const value = String(rawPath || '').trim();
  if (!value) {
    return '';
  }

  if (value.startsWith('data:')) {
    return value;
  }

  if (/^(https?:)?\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      const host = String(parsed.host || '').toLowerCase();
      const uploadsIndex = parsed.pathname.indexOf('/uploads/');
      if (uploadsIndex >= 0 && host !== API_BASE_HOST && isEphemeralTunnelHost(host)) {
        const portablePath = parsed.pathname.slice(uploadsIndex);
        return `${API_BASE_URL}${portablePath}${parsed.search || ''}`;
      }
    } catch {
      // keep original value
    }
    return value;
  }

  if (value.startsWith('/')) {
    return `${API_BASE_URL}${value}`;
  }

  return `${API_BASE_URL}/${value}`;
}

export async function uploadSocialPostImage(token, file) {
  if (!(file instanceof File)) {
    throw new Error('Ficheiro de imagem inválido.');
  }

  const formData = new FormData();
  formData.append('file', file);

  try {
    const { data } = await client.post('/api/social/posts/upload', formData, {
      headers: {
        ...buildAuthHeaders(token),
        'Content-Type': 'multipart/form-data',
      },
    });

    const picturePath = String(data?.picturePath || '').trim();
    if (!picturePath) {
      throw new Error('Resposta inválida ao carregar imagem.');
    }
    return picturePath;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function registerMealPhoto(token, payload) {
  try {
    const { data } = await client.post('/api/users/me/streak/photo', payload, {
      headers: buildAuthHeaders(token),
    });

    return data;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function fetchFriends(token) {
  try {
    const { data } = await client.get('/api/social/friends', {
      headers: buildAuthHeaders(token),
    });
    const friendIds = Array.isArray(data?.friendIds) ? data.friendIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0) : [];
    const friends = Array.isArray(data?.friends) ? data.friends : [];
    return { friendIds, friends };
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function searchUsersForFriendRequest(token, query, limit = 10) {
  const cleanQuery = String(query || '').trim();
  if (cleanQuery.length < 2) {
    return [];
  }

  try {
    const { data } = await client.get('/api/social/users/search', {
      headers: buildAuthHeaders(token),
      params: {
        q: cleanQuery,
        limit: Math.max(1, Math.min(20, Number(limit) || 10)),
      },
    });
    return Array.isArray(data) ? data : [];
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function fetchPendingReceivedRequests(token) {
  try {
    const { data } = await client.get('/api/social/friends/requests/received', {
      headers: buildAuthHeaders(token),
    });
    return Array.isArray(data) ? data : [];
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function fetchPendingSentRequests(token) {
  try {
    const { data } = await client.get('/api/social/friends/requests/sent', {
      headers: buildAuthHeaders(token),
    });
    return Array.isArray(data) ? data : [];
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function sendFriendRequest(token, addresseeId) {
  try {
    const { data } = await client.post(
      '/api/social/friends/request',
      { addresseeId: Number(addresseeId) },
      { headers: buildAuthHeaders(token) },
    );
    return data;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function acceptFriendRequest(token, friendshipId) {
  try {
    const { data } = await client.post(
      `/api/social/friends/${Number(friendshipId)}/accept`,
      {},
      { headers: buildAuthHeaders(token) },
    );
    return data;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function declineFriendRequest(token, friendshipId) {
  try {
    const { data } = await client.post(
      `/api/social/friends/${Number(friendshipId)}/decline`,
      {},
      { headers: buildAuthHeaders(token) },
    );
    return data;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function removeFriend(token, friendshipId) {
  try {
    const { data } = await client.delete(`/api/social/friends/${Number(friendshipId)}`, {
      headers: buildAuthHeaders(token),
    });
    return data;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

function normalizePostKey(postId) {
  return String(postId || '').trim();
}

function buildPostState(source = {}) {
  const entry = source && typeof source === 'object' ? source : {};
  const kudosByUser = entry.kudosByUser && typeof entry.kudosByUser === 'object' ? entry.kudosByUser : {};
  const comments = Array.isArray(entry.comments)
    ? entry.comments
      .map((comment) => ({
        id: String(comment?.id || `${Date.now()}-${Math.random()}`),
        userId: Number(comment?.userId || 0),
        text: String(comment?.text || '').trim(),
        createdAt: String(comment?.createdAt || ''),
      }))
      .filter((comment) => comment.userId > 0 && comment.text)
    : [];

  return {
    kudosByUser,
    comments,
  };
}

export async function fetchPostInteractions(token, postId) {
  const key = normalizePostKey(postId);
  if (!key) {
    return buildPostState();
  }

  try {
    const { data } = await client.get(`/api/social/posts/${encodeURIComponent(key)}/interactions`, {
      headers: buildAuthHeaders(token),
    });
    return buildPostState(data);
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function fetchPostInteractionsMap(token, postIds = []) {
  const normalizedIds = [...new Set(
    postIds
      .map((postId) => normalizePostKey(postId))
      .filter(Boolean),
  )];

  const map = {};
  if (normalizedIds.length === 0) {
    return map;
  }

  const pairs = await Promise.all(
    normalizedIds.map(async (postId) => {
      try {
        const state = await fetchPostInteractions(token, postId);
        return [postId, state];
      } catch {
        return [postId, buildPostState()];
      }
    }),
  );

  pairs.forEach(([postId, state]) => {
    map[postId] = state;
  });

  return map;
}

export async function togglePostKudo(token, postId) {
  const key = normalizePostKey(postId);
  if (!key) {
    throw new Error('Não foi possível atualizar o kudo.');
  }

  try {
    const { data } = await client.post(
      `/api/social/posts/${encodeURIComponent(key)}/kudos`,
      {},
      { headers: buildAuthHeaders(token) },
    );

    return buildPostState({
      kudosByUser: data?.kudosByUser || {},
      comments: [],
    });
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function addPostComment(token, postId, text) {
  const key = normalizePostKey(postId);
  const cleanText = String(text || '').trim();

  if (!key || !cleanText) {
    throw new Error('Comentário inválido.');
  }

  try {
    const { data } = await client.post(
      `/api/social/posts/${encodeURIComponent(key)}/comments`,
      { text: cleanText },
      { headers: buildAuthHeaders(token) },
    );
    return {
      id: String(data?.id || `${Date.now()}-${Math.round(Math.random() * 10000)}`),
      userId: Number(data?.userId || 0),
      text: String(data?.text || cleanText),
      createdAt: String(data?.createdAt || new Date().toISOString()),
    };
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}
