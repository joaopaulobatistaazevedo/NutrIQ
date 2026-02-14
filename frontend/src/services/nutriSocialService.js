import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:7071';
const INTERACTIONS_STORAGE_KEY = 'nutri_social_interactions_v1';

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
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

    return Array.isArray(data?.posts) ? data.posts : [];
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


function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readInteractionsStore() {
  if (!canUseStorage()) {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(INTERACTIONS_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeInteractionsStore(store) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(INTERACTIONS_STORAGE_KEY, JSON.stringify(store));
}

function normalizePostKey(postId) {
  return String(postId || '').trim();
}

function buildPostState(source) {
  const entry = source && typeof source === 'object' ? source : {};
  const kudosByUser = entry.kudosByUser && typeof entry.kudosByUser === 'object' ? entry.kudosByUser : {};
  const comments = Array.isArray(entry.comments) ? entry.comments : [];

  return {
    kudosByUser,
    comments,
  };
}

export function getPostInteractions(postIds = []) {
  const store = readInteractionsStore();
  const map = {};

  postIds.forEach((postId) => {
    const key = normalizePostKey(postId);
    if (!key) return;
    map[key] = buildPostState(store[key]);
  });

  return map;
}

export function togglePostKudo(postId, userId) {
  const key = normalizePostKey(postId);
  const actor = Number(userId);

  if (!key || !Number.isFinite(actor) || actor <= 0) {
    throw new Error('Não foi possível atualizar o kudo.');
  }

  const store = readInteractionsStore();
  const current = buildPostState(store[key]);
  const nextKudos = { ...current.kudosByUser };

  if (nextKudos[String(actor)]) {
    delete nextKudos[String(actor)];
  } else {
    nextKudos[String(actor)] = new Date().toISOString();
  }

  store[key] = {
    ...current,
    kudosByUser: nextKudos,
  };

  writeInteractionsStore(store);
  return buildPostState(store[key]);
}

export function addPostComment(postId, userId, text) {
  const key = normalizePostKey(postId);
  const actor = Number(userId);
  const cleanText = String(text || '').trim();

  if (!key || !Number.isFinite(actor) || actor <= 0 || !cleanText) {
    throw new Error('Comentário inválido.');
  }

  const store = readInteractionsStore();
  const current = buildPostState(store[key]);
  const nextComment = {
    id: `${Date.now()}-${Math.round(Math.random() * 10_000)}`,
    userId: actor,
    text: cleanText,
    createdAt: new Date().toISOString(),
  };

  store[key] = {
    ...current,
    comments: [nextComment, ...current.comments].slice(0, 30),
  };

  writeInteractionsStore(store);
  return buildPostState(store[key]);
}
