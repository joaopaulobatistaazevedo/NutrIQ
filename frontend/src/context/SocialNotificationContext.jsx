/**
 * SocialNotificationContext
 *
 * Provides `pendingFriendRequestCount` (number) to any component in the tree.
 * Polls the API every 30 s so the sidebar badge stays up-to-date without a
 * full page reload.
 *
 * Usage:
 *   1. Wrap your app (or the authenticated layout) with <SocialNotificationProvider>
 *   2. In any component: const { pendingFriendRequestCount, refresh } = useSocialNotifications();
 */
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { fetchPendingReceivedRequests } from '../services/nutriSocialService';
import { getAuthSession } from '../utils/authSession';

const SocialNotificationContext = createContext({
  pendingFriendRequestCount: 0,
  refresh: () => {},
});

export function SocialNotificationProvider({ children }) {
  const [pendingFriendRequestCount, setPendingFriendRequestCount] = useState(0);

  const refresh = useCallback(async () => {
    const authSession = getAuthSession();
    const token = String(authSession?.token || '').trim();
    if (!token) {
      setPendingFriendRequestCount(0);
      return;
    }
    try {
      const received = await fetchPendingReceivedRequests(token);
      const list = Array.isArray(received) ? received : Array.isArray(received?.requests) ? received.requests : [];
      setPendingFriendRequestCount(list.length);
    } catch {
      // Silently ignore — the badge simply won't update on network errors
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Poll every 30 s
  useEffect(() => {
    const interval = setInterval(refresh, 1_000);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <SocialNotificationContext.Provider value={{ pendingFriendRequestCount, refresh }}>
      {children}
    </SocialNotificationContext.Provider>
  );
}

export function useSocialNotifications() {
  return useContext(SocialNotificationContext);
}