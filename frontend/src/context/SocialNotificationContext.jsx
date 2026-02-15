/**
 * SocialNotificationContext
 *
 * Provides social pending notification counters to any component in the tree.
 * Polls the API every 15 s so the sidebar badge stays up-to-date without a
 * full page reload.
 *
 * Usage:
 *   1. Wrap your app (or the authenticated layout) with <SocialNotificationProvider>
 *   2. In any component:
 *      const { pendingSocialNotificationCount, pendingFriendRequestCount, pendingCommunityInviteCount, refresh } = useSocialNotifications();
 */
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { fetchPendingCommunityInvites, fetchPendingReceivedRequests } from '../services/nutriSocialService';
import { getAuthSession } from '../utils/authSession';

const SocialNotificationContext = createContext({
  pendingSocialNotificationCount: 0,
  pendingFriendRequestCount: 0,
  pendingCommunityInviteCount: 0,
  refresh: () => {},
});

export function SocialNotificationProvider({ children }) {
  const [pendingSocialNotificationCount, setPendingSocialNotificationCount] = useState(0);
  const [pendingFriendRequestCount, setPendingFriendRequestCount] = useState(0);
  const [pendingCommunityInviteCount, setPendingCommunityInviteCount] = useState(0);

  const refresh = useCallback(async () => {
    const authSession = getAuthSession();
    const token = String(authSession?.token || '').trim();
    if (!token) {
      setPendingSocialNotificationCount(0);
      setPendingFriendRequestCount(0);
      setPendingCommunityInviteCount(0);
      return;
    }
    try {
      const [received, communityInvites] = await Promise.all([
        fetchPendingReceivedRequests(token),
        fetchPendingCommunityInvites(token),
      ]);
      const list = Array.isArray(received) ? received : Array.isArray(received?.requests) ? received.requests : [];
      const communityList = Array.isArray(communityInvites) ? communityInvites : [];
      const friendCount = list.length;
      const communityCount = communityList.length;

      setPendingFriendRequestCount(friendCount);
      setPendingCommunityInviteCount(communityCount);
      setPendingSocialNotificationCount(friendCount + communityCount);
    } catch {
      // Silently ignore — the badge simply won't update on network errors
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Poll every 15 s
  useEffect(() => {
    const interval = setInterval(refresh, 15_000);
    return () => clearInterval(interval);
  }, [refresh]);

  // Refresh on focus/visibility so badge catches up immediately when user returns.
  useEffect(() => {
    const onFocus = () => {
      void refresh();
    };
    const onVisibilityChange = () => {
      if (!document.hidden) {
        void refresh();
      }
    };
    const onForceRefresh = () => {
      void refresh();
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('nutrisocial:force-refresh', onForceRefresh);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('nutrisocial:force-refresh', onForceRefresh);
    };
  }, [refresh]);

  return (
    <SocialNotificationContext.Provider
      value={{
        pendingSocialNotificationCount,
        pendingFriendRequestCount,
        pendingCommunityInviteCount,
        refresh,
      }}
    >
      {children}
    </SocialNotificationContext.Provider>
  );
}

export function useSocialNotifications() {
  return useContext(SocialNotificationContext);
}
