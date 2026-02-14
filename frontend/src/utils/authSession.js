import { AUTH_KEY } from '../constants/storageKeys';

export function isAuthenticated() {
  if (typeof window === 'undefined') {
    return false;
  }

  return localStorage.getItem(AUTH_KEY) === '1';
}

export function setAuthenticated(value) {
  if (typeof window === 'undefined') {
    return;
  }

  if (value) {
    localStorage.setItem(AUTH_KEY, '1');
    return;
  }

  localStorage.removeItem(AUTH_KEY);
}
