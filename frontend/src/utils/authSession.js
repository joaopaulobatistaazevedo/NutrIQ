import { AUTH_KEY } from '../constants/storageKeys';

function parseStoredAuth(rawValue) {
  if (!rawValue) {
    return null;
  }

  if (rawValue === '1') {
    return { authenticated: true };
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

export function getAuthSession() {
  if (typeof window === 'undefined') {
    return null;
  }

  return parseStoredAuth(localStorage.getItem(AUTH_KEY));
}

export function isAuthenticated() {
  if (typeof window === 'undefined') {
    return false;
  }

  const session = parseStoredAuth(localStorage.getItem(AUTH_KEY));
  return !!(session && (session.authenticated || session.token));
}

export function setAuthSession({ userId, token, email = '', name = '' }) {
  if (typeof window === 'undefined') {
    return;
  }

  const payload = {
    authenticated: true,
    userId,
    token,
    email,
    name,
    savedAt: new Date().toISOString(),
  };

  localStorage.setItem(AUTH_KEY, JSON.stringify(payload));
}

export function clearAuthSession() {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.removeItem(AUTH_KEY);
}

export function setAuthenticated(value) {
  if (typeof window === 'undefined') {
    return;
  }

  if (value) {
    const existing = parseStoredAuth(localStorage.getItem(AUTH_KEY));
    if (existing) {
      localStorage.setItem(
        AUTH_KEY,
        JSON.stringify({
          ...existing,
          authenticated: true,
        }),
      );
    } else {
      localStorage.setItem(AUTH_KEY, JSON.stringify({ authenticated: true }));
    }
    return;
  }

  clearAuthSession();
}
