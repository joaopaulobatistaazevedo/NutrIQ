import { AUTH_KEY, USER_ROLES_KEY } from '../constants/storageKeys';

const DEFAULT_ROLE = 'user';

function parseStoredAuth(rawValue) {
  if (!rawValue) {
    return null;
  }

  if (rawValue === '1') {
    return { authenticated: true, role: DEFAULT_ROLE };
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

function normalizeRole(role) {
  const value = String(role || '').trim().toLowerCase();
  return value === 'nutritionist' ? 'nutritionist' : DEFAULT_ROLE;
}

function parseUserRolesMap(rawValue) {
  if (!rawValue) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function getAuthSession() {
  if (typeof window === 'undefined') {
    return null;
  }

  const session = parseStoredAuth(localStorage.getItem(AUTH_KEY));
  if (!session) {
    return null;
  }

  return {
    ...session,
    role: normalizeRole(session.role),
  };
}

export function isAuthenticated() {
  if (typeof window === 'undefined') {
    return false;
  }

  const session = parseStoredAuth(localStorage.getItem(AUTH_KEY));
  return !!(session && (session.authenticated || session.token));
}

export function getUserRole() {
  const session = getAuthSession();
  return normalizeRole(session?.role);
}

export function setAuthSession({ userId, token, email = '', name = '', role = DEFAULT_ROLE }) {
  if (typeof window === 'undefined') {
    return;
  }

  const normalizedRole = normalizeRole(role);
  const normalizedEmail = String(email || '').trim().toLowerCase();

  const payload = {
    authenticated: true,
    userId,
    token,
    email: email.trim(),
    name,
    role: normalizedRole,
    savedAt: new Date().toISOString(),
  };

  localStorage.setItem(AUTH_KEY, JSON.stringify(payload));

  if (normalizedEmail) {
    const map = parseUserRolesMap(localStorage.getItem(USER_ROLES_KEY));
    map[normalizedEmail] = normalizedRole;
    localStorage.setItem(USER_ROLES_KEY, JSON.stringify(map));
  }
}

export function getStoredRoleForEmail(email) {
  if (typeof window === 'undefined') {
    return DEFAULT_ROLE;
  }

  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    return DEFAULT_ROLE;
  }

  const map = parseUserRolesMap(localStorage.getItem(USER_ROLES_KEY));
  return normalizeRole(map[normalizedEmail]);
}

export function setStoredRoleForEmail(email, role) {
  if (typeof window === 'undefined') {
    return;
  }

  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    return;
  }

  const map = parseUserRolesMap(localStorage.getItem(USER_ROLES_KEY));
  map[normalizedEmail] = normalizeRole(role);
  localStorage.setItem(USER_ROLES_KEY, JSON.stringify(map));
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
          role: normalizeRole(existing.role),
        }),
      );
    } else {
      localStorage.setItem(AUTH_KEY, JSON.stringify({ authenticated: true, role: DEFAULT_ROLE }));
    }
    return;
  }

  clearAuthSession();
}
