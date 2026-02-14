import { getAuthSession } from './authSession';

function normalizeKeyPart(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

export function resolveAccountId(profile) {
  const session = getAuthSession();

  const userId = Number(session?.userId || 0);
  if (Number.isInteger(userId) && userId > 0) {
    return `user_${userId}`;
  }

  const emailPart = normalizeKeyPart(session?.email);
  if (emailPart) {
    return `email_${emailPart}`;
  }

  const usernamePart = normalizeKeyPart(profile?.username || session?.name);
  if (usernamePart) {
    return `name_${usernamePart}`;
  }

  return 'anonymous';
}

export function scopedKey(base, accountId) {
  return `${base}:${accountId}`;
}
