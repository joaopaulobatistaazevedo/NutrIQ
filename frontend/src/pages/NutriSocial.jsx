import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, Flame, MessageCircle, Pencil, Search, Send, ThumbsUp, Trash2, UserMinus, UserPlus, Users, XCircle } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import {
  acceptFriendRequest,
  addPostComment,
  declineFriendRequest,
  deleteSocialPost,
  registerMealPhoto,
  fetchFriends,
  fetchNutriSocialFeed,
  fetchNutriSocialUserPosts,
  fetchPostInteractionsMap,
  fetchPendingCommunityInvites,
  fetchPendingReceivedRequests,
  fetchPendingSentRequests,
  fetchCommunities,
  removeFriend,
  resolveNutriSocialImageUrl,
  searchUsersForFriendRequest,
  sendFriendRequest,
  togglePostKudo,
  uploadSocialPostImage,
  updateSocialPost,
  createCommunity,
  renameCommunity,
  inviteFriendToCommunity,
  acceptCommunityInvite,
  declineCommunityInvite,
} from '../services/nutriSocialService';
import { fetchRecipes } from '../services/recipeService';
import { fetchMyProfile } from '../services/userService';
import { getAuthSession } from '../utils/authSession';
import '../styles/nutrisocial.css';

const FALLBACK_POST_IMAGE = 'https://placehold.co/860x520/e2e8f0/475569?text=NutriSocial';
const QUICK_EMOJI_COMMENTS = ['🔥', '🤤', '😍', '👏', '💚', '🍽️'];

function emojiToTwemojiUrl(emoji) {
  const codePoints = Array.from(String(emoji || ''))
    .map((char) => char.codePointAt(0)?.toString(16))
    .filter(Boolean)
    .join('-');

  if (!codePoints) {
    return '';
  }

  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${codePoints}.svg`;
}

function normalizePostImage(post) {
  const candidates = [
    post?.picturePath,
    post?.picture_path,
  ];

  for (const candidate of candidates) {
    const resolved = resolveNutriSocialImageUrl(candidate);
    if (resolved && !resolved.startsWith('blob:')) {
      return resolved;
    }
  }

  return FALLBACK_POST_IMAGE;
}

function isInvalidLegacyBlobPath(post) {
  const value = String(post?.picturePath || post?.picture_path || '').trim().toLowerCase();
  return value.startsWith('blob:');
}

function isTunnelHostImage(url) {
  try {
    const parsed = new URL(String(url || ''));
    const host = String(parsed.host || '').toLowerCase();
    return host.endsWith('.loca.lt') || host.includes('ngrok');
  } catch {
    return false;
  }
}

function NutriSocialPostImage({ src, alt }) {
  const [displaySrc, setDisplaySrc] = useState(src || FALLBACK_POST_IMAGE);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';

    const imageSrc = String(src || '').trim();
    if (!imageSrc) {
      setDisplaySrc(FALLBACK_POST_IMAGE);
      return () => {};
    }

    if (!isTunnelHostImage(imageSrc)) {
      setDisplaySrc(imageSrc);
      return () => {};
    }

    // ngrok/loca.lt may require a custom header; <img> cannot send it,
    // so fetch as blob and render a local object URL.
    const loadThroughFetch = async () => {
      try {
        const response = await fetch(imageSrc, {
          headers: {
            'ngrok-skip-browser-warning': 'true',
          },
        });
        if (!response.ok) {
          throw new Error(`Image fetch failed: ${response.status}`);
        }
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) {
          setDisplaySrc(objectUrl);
        }
      } catch {
        if (!cancelled) {
          setDisplaySrc(FALLBACK_POST_IMAGE);
        }
      }
    };

    void loadThroughFetch();

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [src]);

  return (
    <img
      src={displaySrc || FALLBACK_POST_IMAGE}
      alt={alt}
      className="nutri-social-feed-image"
      loading="lazy"
      onError={(event) => {
        if (event.currentTarget.src !== FALLBACK_POST_IMAGE) {
          event.currentTarget.src = FALLBACK_POST_IMAGE;
        }
      }}
    />
  );
}

function normalizeDateTimeValue(...values) {
  for (const value of values) {
    const candidate = String(value || '').trim();
    if (!candidate) continue;
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return new Date().toISOString();
}

function prettyDate(value) {
  if (!value) return 'agora';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'agora';
  return parsed.toLocaleString('pt-PT');
}

function usernameFromId(userId, currentUserId, userDirectory) {
  const numericUserId = Number(userId || 0);
  if (!Number.isInteger(numericUserId) || numericUserId <= 0) {
    return 'Utilizador';
  }
  if (Number(userId) === Number(currentUserId)) {
    return 'Tu';
  }
  const user = userDirectory.get(numericUserId);
  const candidateName = String(user?.name || '').trim();
  return candidateName || `Chef #${numericUserId}`;
}

function avatarForUser(userId, userDirectory) {
  const numericUserId = Number(userId || 0);
  const user = userDirectory.get(numericUserId);
  const label = String(user?.name || `Chef ${numericUserId || '0'}`).trim();
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(label)}&background=E2E8F0&color=0F172A&rounded=true&size=96`;
}

function relationStatusLabel(status) {
  const normalized = String(status || '').trim().toUpperCase();
  if (normalized === 'FRIEND') return 'Já amigo';
  if (normalized === 'REQUEST_SENT') return 'Pedido enviado';
  if (normalized === 'REQUEST_RECEIVED') return 'Pedido recebido';
  return 'Disponível';
}

function mealTypeLabel(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'SNACK') return 'Snack';
  return 'Refeição';
}

function inferMealTypeFromDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'MEAL';
  const hour = parsed.getHours();
  if (hour >= 15 && hour < 19) return 'SNACK';
  return 'MEAL';
}

function mealTypeFromPost(post) {
  const candidates = [post?.mealType, post?.meal_type, post?.type, post?.meal];
  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim().toUpperCase();
    if (normalized === 'SNACK') {
      return 'SNACK';
    }
    if (['BREAKFAST', 'LUNCH', 'DINNER', 'MEAL'].includes(normalized)) {
      return 'MEAL';
    }
  }
  return inferMealTypeFromDate(post?.createdAt);
}

function dayHourLabel(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'hora desconhecida';
  }

  const date = parsed.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: '2-digit' });
  const hour = parsed.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${hour}`;
}

function encodeFriendshipId(requesterId, addresseeId) {
  const requester = BigInt(Number(requesterId) >>> 0);
  const addressee = BigInt(Number(addresseeId) >>> 0);
  return ((requester << 32n) | addressee).toString();
}

export default function NutriSocial() {
  const location = useLocation();
  const navigate = useNavigate();
  const authSession = getAuthSession();
  const token = String(authSession?.token || '').trim();
  const currentUserId = Number(authSession?.userId || 0);
  const sessionName = String(authSession?.name || '').trim();

  const [streakCount, setStreakCount] = useState(0);
  const [currentUserName, setCurrentUserName] = useState('');
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState('');
  const [feedStatus, setFeedStatus] = useState('');

  const [friendsLoading, setFriendsLoading] = useState(true);
  const [friendActionLoadingId, setFriendActionLoadingId] = useState('');
  const [friendStatus, setFriendStatus] = useState('');
  const [friendError, setFriendError] = useState('');
  const [friendSearchQuery, setFriendSearchQuery] = useState('');
  const [friendSuggestions, setFriendSuggestions] = useState([]);
  const [selectedFriendId, setSelectedFriendId] = useState('');
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [friendsPanelTab, setFriendsPanelTab] = useState('friends');
  const [friendFilter, setFriendFilter] = useState('all');
  const [friendSort, setFriendSort] = useState('az');
  const [friendToast, setFriendToast] = useState(null);
  const [activeTab, setActiveTab] = useState('feed');
  const [communities, setCommunities] = useState([]);
  const [communityNameDraft, setCommunityNameDraft] = useState('');
  const [communityInviteDraftById, setCommunityInviteDraftById] = useState({});
  const [pendingCommunityInvites, setPendingCommunityInvites] = useState([]);

  const [feedPosts, setFeedPosts] = useState([]);
  const [profileFeedPosts, setProfileFeedPosts] = useState([]);
  const [friendIds, setFriendIds] = useState([]);
  const [friendUsers, setFriendUsers] = useState([]);
  const [pendingReceived, setPendingReceived] = useState([]);
  const [pendingSent, setPendingSent] = useState([]);
  const [interactionsByPost, setInteractionsByPost] = useState({});
  const [commentDrafts, setCommentDrafts] = useState({});
  const [activePostMenuId, setActivePostMenuId] = useState('');
  const [editingPostId, setEditingPostId] = useState('');
  const [editingDraft, setEditingDraft] = useState({ description: '', rating: 5 });
  const [expandedCommentsPostId, setExpandedCommentsPostId] = useState('');
  const [mealPhotoPath, setMealPhotoPath] = useState('');
  const [mealPhotoPreview, setMealPhotoPreview] = useState('');
  const [mealPhotoFile, setMealPhotoFile] = useState(null);
  const [mealDescription, setMealDescription] = useState('');
  const [mealVisibility, setMealVisibility] = useState('public');
  const [mealSelectedRecipeId, setMealSelectedRecipeId] = useState('');
  const [mealRating, setMealRating] = useState(5);
  const [mealIsSubmitting, setMealIsSubmitting] = useState(false);
  const [mealSubmitStatus, setMealSubmitStatus] = useState('');
  const [mealRecipes, setMealRecipes] = useState([]);

  const hydratePostInteractions = useCallback(async (posts) => {
    if (!token) {
      setInteractionsByPost({});
      return;
    }

    const postIds = (Array.isArray(posts) ? posts : [])
      .map((post) => post?.id)
      .filter(Boolean);

    if (postIds.length === 0) {
      setInteractionsByPost({});
      return;
    }

    try {
      const interactionsMap = await fetchPostInteractionsMap(token, postIds);
      setInteractionsByPost(interactionsMap);
    } catch {
      // keep previous interactions if fetch fails
    }
  }, [token]);

  const announceFriendRequestRefresh = useCallback(() => {
    window.dispatchEvent(new CustomEvent('nutrisocial:force-refresh'));
  }, []);

  const loadData = useCallback(async ({ silent = false } = {}) => {
    if (!token) {
      setFeedLoading(false);
      setFriendsLoading(false);
      setFeedError('Sessão inválida. Faz login novamente.');
      return;
    }

    if (!silent) {
      setFeedLoading(true);
      setFriendsLoading(true);
      setFeedError('');
    }

    try {
      const [feed, myPosts, profile, friends, receivedRequests, sentRequests, communitiesResponse, pendingCommunityInvitesResponse] = await Promise.all([
        fetchNutriSocialFeed(token),
        fetchNutriSocialUserPosts(token, currentUserId),
        fetchMyProfile(token),
        fetchFriends(token),
        fetchPendingReceivedRequests(token),
        fetchPendingSentRequests(token),
        fetchCommunities(token),
        fetchPendingCommunityInvites(token),
      ]);

      const normalizedFeed = (Array.isArray(feed) ? feed : [])
        .filter((post) => !isInvalidLegacyBlobPath(post))
        .map((post) => ({
          ...post,
          userId: Number(post?.userId || post?.user_id || 0),
          createdAt: normalizeDateTimeValue(post?.createdAt, post?.created_at, post?.currentTime, post?.current_time),
          currentTime: normalizeDateTimeValue(post?.currentTime, post?.current_time, post?.createdAt, post?.created_at),
        }));

      const normalizedMyPosts = (Array.isArray(myPosts) ? myPosts : [])
        .filter((post) => !isInvalidLegacyBlobPath(post))
        .map((post) => ({
          ...post,
          userId: Number(post?.userId || post?.user_id || currentUserId || 0),
          createdAt: normalizeDateTimeValue(post?.createdAt, post?.created_at, post?.currentTime, post?.current_time),
          currentTime: normalizeDateTimeValue(post?.currentTime, post?.current_time, post?.createdAt, post?.created_at),
        }));
      setProfileFeedPosts(normalizedMyPosts);

      setFeedPosts((previous) => {
        if (silent) {
          const previousIds = new Set(previous.map((post) => String(post?.id || '')));
          const newPosts = normalizedFeed.filter((post) => !previousIds.has(String(post?.id || '')));
          if (newPosts.length > 0) {
            setFeedStatus(
              newPosts.length === 1
                ? 'Tens 1 nova publicação no feed.'
                : `Tens ${newPosts.length} novas publicações no feed.`,
            );
          }
        }
        return normalizedFeed;
      });
      setStreakCount(Math.max(0, Number(profile?.profile?.streakCount || 0)));
      setCurrentUserName(String(profile?.name || sessionName || '').trim());
      const friendIdsFromApi = Array.isArray(friends?.friendIds) ? friends.friendIds : [];
      const friendUsersFromApi = Array.isArray(friends?.friends) ? friends.friends : [];
      const normalizedFriends = friendUsersFromApi
        .map((friend) => ({
          id: Number(friend?.id),
          name: String(friend?.name || '').trim(),
          email: String(friend?.email || '').trim(),
        }))
        .filter((friend) => Number.isInteger(friend.id) && friend.id > 0);

      setFriendUsers(normalizedFriends);
      setFriendIds(
        (friendIdsFromApi.length > 0 ? friendIdsFromApi : normalizedFriends.map((friend) => friend.id))
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0),
      );
      setPendingReceived(Array.isArray(receivedRequests) ? receivedRequests : []);
      setPendingSent(Array.isArray(sentRequests) ? sentRequests : []);

      const normalizedCommunities = (Array.isArray(communitiesResponse) ? communitiesResponse : [])
        .map((community) => ({
          id: String(community?.id || ''),
          ownerUserId: Number(community?.ownerUserId || 0),
          name: String(community?.name || '').trim(),
          memberIds: Array.isArray(community?.memberIds)
            ? community.memberIds
              .map((memberId) => Number(memberId))
              .filter((memberId) => Number.isInteger(memberId) && memberId > 0)
            : [],
          pendingInviteUserIds: Array.isArray(community?.pendingInviteUserIds)
            ? community.pendingInviteUserIds
              .map((memberId) => Number(memberId))
              .filter((memberId) => Number.isInteger(memberId) && memberId > 0)
            : [],
        }))
        .filter((community) => community.id && community.name);

      const normalizedPendingCommunityInvites = (Array.isArray(pendingCommunityInvitesResponse) ? pendingCommunityInvitesResponse : [])
        .map((invite) => ({
          communityId: Number(invite?.communityId || 0),
          communityName: String(invite?.communityName || '').trim(),
          inviterId: Number(invite?.inviterId || 0),
          inviterName: String(invite?.inviterName || '').trim(),
          createdAt: normalizeDateTimeValue(invite?.createdAt),
        }))
        .filter((invite) => Number.isInteger(invite.communityId) && invite.communityId > 0);

      setCommunities(normalizedCommunities);
      setPendingCommunityInvites(normalizedPendingCommunityInvites);
      announceFriendRequestRefresh();
      void hydratePostInteractions([...normalizedFeed, ...normalizedMyPosts]);
    } catch (error) {
      if (!silent) {
        setFeedError(error?.message || 'Não foi possível carregar o NutriSocial.');
      }
    } finally {
      if (!silent) {
        setFeedLoading(false);
        setFriendsLoading(false);
      }
    }
  }, [announceFriendRequestRefresh, currentUserId, hydratePostInteractions, sessionName, token]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = String(params.get('tab') || '').trim().toLowerCase();
    const allowedTabs = new Set(['feed', 'friends', 'meal', 'profile']);
    if (allowedTabs.has(tab)) {
      setActiveTab(tab);
    }
  }, [location.search]);

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    const interval = setInterval(() => {
      void loadData({ silent: true });
    }, 15000);

    const onFocus = () => {
      void loadData({ silent: true });
    };

    const onVisibilityChange = () => {
      if (!document.hidden) {
        void loadData({ silent: true });
      }
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [loadData, token]);

  useEffect(() => {
    if (!feedStatus) return undefined;
    const timeout = setTimeout(() => setFeedStatus(''), 5000);
    return () => clearTimeout(timeout);
  }, [feedStatus]);

  useEffect(() => {
    let cancelled = false;
    const cleanQuery = String(friendSearchQuery || '').trim();

    if (activeTab !== 'friends' || !token) {
      return () => {
        cancelled = true;
      };
    }

    if (cleanQuery.length < 2) {
      setFriendSuggestions([]);
      setSelectedFriendId('');
      setIsSearchingUsers(false);
      return () => {
        cancelled = true;
      };
    }

    const timer = setTimeout(async () => {
      setIsSearchingUsers(true);
      try {
        const suggestions = await searchUsersForFriendRequest(token, cleanQuery, 12);
        if (cancelled) {
          return;
        }
        setFriendSuggestions(suggestions);
        const hasSelected = suggestions.some((item) => Number(item?.id) === Number(selectedFriendId));
        if (!hasSelected) {
          const firstAvailable = suggestions.find((item) => String(item?.relationStatus || '').toUpperCase() === 'NONE');
          setSelectedFriendId(firstAvailable ? String(firstAvailable.id) : '');
        }
      } catch (error) {
        if (!cancelled) {
          setFriendError(error?.message || 'Não foi possível pesquisar utilizadores.');
          setFriendSuggestions([]);
          setSelectedFriendId('');
        }
      } finally {
        if (!cancelled) {
          setIsSearchingUsers(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeTab, friendSearchQuery, token]);

  useEffect(() => {
    if (!friendStatus) return;
    setFriendToast({ type: "success", message: friendStatus, id: Date.now() });
  }, [friendStatus]);

  useEffect(() => {
    if (!friendError) return;
    setFriendToast({ type: "error", message: friendError, id: Date.now() });
  }, [friendError]);

  useEffect(() => {
    if (!friendToast) return undefined;
    const timeout = setTimeout(() => setFriendToast(null), 3600);
    return () => clearTimeout(timeout);
  }, [friendToast]);

  useEffect(() => () => {
    if (mealPhotoPreview && mealPhotoPreview.startsWith('blob:')) {
      URL.revokeObjectURL(mealPhotoPreview);
    }
  }, [mealPhotoPreview]);

  useEffect(() => {
    if (activeTab !== 'meal' || !token || mealRecipes.length > 0) {
      return;
    }

    let cancelled = false;
    const run = async () => {
      try {
        const recipes = await fetchRecipes({ limit: 300 });
        if (cancelled) return;

        const normalized = (Array.isArray(recipes) ? recipes : [])
          .map((recipe) => ({
            id: Number(recipe?.id || 0),
            name: String(recipe?.name || '').trim(),
          }))
          .filter((recipe) => Number.isInteger(recipe.id) && recipe.id > 0)
          .sort((left, right) => left.name.localeCompare(right.name, 'pt-PT'));

        setMealRecipes(normalized);
      } catch {
        if (!cancelled) {
          setMealSubmitStatus('Não foi possível carregar as receitas. Tenta novamente.');
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [activeTab, mealRecipes.length, token]);

  const userDirectory = useMemo(() => {
    const map = new Map();

    if (currentUserId > 0) {
      map.set(currentUserId, {
        id: currentUserId,
        name: currentUserName || sessionName || 'Tu',
        email: '',
      });
    }

    friendUsers.forEach((friend) => {
      const id = Number(friend?.id);
      if (!Number.isInteger(id) || id <= 0) {
        return;
      }
      map.set(id, {
        id,
        name: String(friend?.name || '').trim() || `Chef #${id}`,
        email: String(friend?.email || '').trim(),
      });
    });

    return map;
  }, [currentUserId, currentUserName, friendUsers, sessionName]);

  const storyUsers = useMemo(() => {
    const list = [];
    if (currentUserId > 0) {
      list.push({
        id: currentUserId,
        name: currentUserName || sessionName || 'Tu',
      });
    }
    friendUsers.forEach((friend) => {
      const id = Number(friend?.id);
      if (!Number.isInteger(id) || id <= 0) {
        return;
      }
      if (!list.some((entry) => entry.id === id)) {
        list.push({
          id,
          name: String(friend?.name || '').trim() || `Chef #${id}`,
        });
      }
    });
    return list.slice(0, 10);
  }, [currentUserId, currentUserName, friendUsers, sessionName]);

  const selectedFriendSuggestion = useMemo(
    () => friendSuggestions.find((item) => Number(item?.id) === Number(selectedFriendId)) || null,
    [friendSuggestions, selectedFriendId],
  );

  const isFriendOnline = (friend) => {
    if (friend?.isOnline === true || friend?.online === true) return true;
    const status = String(friend?.status || friend?.presence || '').trim().toUpperCase();
    return status === "ONLINE" || status === "ACTIVE" || status === "AVAILABLE";
  };

  const onlineFriendsCount = useMemo(
    () => friendUsers.filter((friend) => isFriendOnline(friend)).length,
    [friendUsers],
  );

  const activeFriendsCount = onlineFriendsCount > 0 ? onlineFriendsCount : friendUsers.length;

  const sortedFilteredFriends = useMemo(() => {
    const normalized = [...friendUsers];

    const filtered = normalized.filter((friend) => {
      if (friendFilter === "online") {
        return isFriendOnline(friend);
      }
      return true;
    });

    filtered.sort((left, right) => {
      const leftName = String(left?.name || "").trim().toLocaleLowerCase("pt-PT");
      const rightName = String(right?.name || "").trim().toLocaleLowerCase("pt-PT");
      if (friendSort === "za") {
        return rightName.localeCompare(leftName, "pt-PT");
      }
      return leftName.localeCompare(rightName, "pt-PT");
    });

    return filtered;
  }, [friendUsers, friendFilter, friendSort]);

  const pendingRequestsCount = pendingReceived.length + pendingSent.length;

  const visibleFeedPosts = useMemo(
    () => feedPosts.filter((post) => friendIds.includes(Number(post?.userId)) && Number(post?.userId) !== Number(currentUserId)),
    [feedPosts, friendIds, currentUserId],
  );

  const profilePosts = useMemo(
    () => profileFeedPosts.filter((post) => Number(post?.userId) === Number(currentUserId)),
    [profileFeedPosts, currentUserId],
  );

  const activePostList = useMemo(
    () => (activeTab === 'profile' ? profilePosts : visibleFeedPosts),
    [activeTab, profilePosts, visibleFeedPosts],
  );

  const getPostInteraction = (postId) => {
    const key = String(postId || '').trim();
    return interactionsByPost[key] || { kudosByUser: {}, comments: [] };
  };

  const handleOpenCommentsModal = (postId) => {
    const key = String(postId || '').trim();
    if (!key) return;
    setExpandedCommentsPostId(key);
  };

  const handleCloseCommentsModal = () => {
    setExpandedCommentsPostId('');
  };

  const handleMealPhotoChange = (event) => {
    const file = event?.target?.files?.[0];
    if (!file) return;

    if (mealPhotoPreview && mealPhotoPreview.startsWith('blob:')) {
      URL.revokeObjectURL(mealPhotoPreview);
    }

    const preview = URL.createObjectURL(file);
    setMealPhotoPreview(preview);
    setMealPhotoPath(preview);
    setMealPhotoFile(file);
    setMealSubmitStatus('');
  };

  const handleMealSubmit = async (event) => {
    event.preventDefault();

    if (!token) {
      setMealSubmitStatus('Sessão inválida. Faz login novamente.');
      return;
    }

    const cleanPhotoPath = String(mealPhotoPath || '').trim();
    const shareOnNutriSocial = mealVisibility === 'public';

    if (!cleanPhotoPath) {
      setMealSubmitStatus('Para aumentar o streak tens de tirar uma foto da refeição.');
      return;
    }

    if (shareOnNutriSocial && !mealSelectedRecipeId) {
      setMealSubmitStatus('Seleciona uma receita para partilhar no NutriSocial.');
      return;
    }

    setMealIsSubmitting(true);
    setMealSubmitStatus('');

    try {
      let finalPicturePath = cleanPhotoPath;
      if (mealPhotoFile instanceof File) {
        finalPicturePath = await uploadSocialPostImage(token, mealPhotoFile);
      } else if (cleanPhotoPath.startsWith('blob:')) {
        throw new Error('A foto selecionada expirou. Escolhe novamente a imagem antes de submeter.');
      }

      const payload = {
        picturePath: finalPicturePath,
        description: String(mealDescription || '').trim() || null,
        shareOnNutriSocial,
        recipeId: shareOnNutriSocial ? Number(mealSelectedRecipeId) : null,
        rating: shareOnNutriSocial ? Number(mealRating) : null,
      };

      const result = await registerMealPhoto(token, payload);
      const nextStreak = Number(result?.streakCount || 0);
      setStreakCount(Number.isFinite(nextStreak) ? nextStreak : 0);

      setMealSubmitStatus(
        shareOnNutriSocial
          ? 'Refeição registada e publicada com sucesso.'
          : 'Refeição registada como privada com sucesso.',
      );

      setMealDescription('');
      setMealSelectedRecipeId('');
      setMealRating(5);
      setMealVisibility('public');
      setMealPhotoFile(null);
      setMealPhotoPath('');
      if (mealPhotoPreview && mealPhotoPreview.startsWith('blob:')) {
        URL.revokeObjectURL(mealPhotoPreview);
      }
      setMealPhotoPreview('');

      await loadData({ silent: true });
      setActiveTab('profile');
      navigate('/nutrisocial?tab=profile', { replace: true });
    } catch (error) {
      setMealSubmitStatus(error?.message || 'Não foi possível registar a foto.');
    } finally {
      setMealIsSubmitting(false);
    }
  };

  const expandedCommentsPost = useMemo(
    () => activePostList.find((post) => String(post?.id) === expandedCommentsPostId) || null,
    [activePostList, expandedCommentsPostId],
  );

  const expandedComments = useMemo(() => {
    if (!expandedCommentsPostId) {
      return [];
    }

    const interaction = interactionsByPost[expandedCommentsPostId] || { comments: [] };
    const comments = Array.isArray(interaction.comments) ? interaction.comments : [];

    return [...comments]
      .map((comment) => ({
        ...comment,
        createdAt: normalizeDateTimeValue(comment?.createdAt, comment?.created_at, comment?.currentTime, comment?.current_time),
      }))
      .sort((left, right) => new Date(right?.createdAt || 0).getTime() - new Date(left?.createdAt || 0).getTime());
  }, [expandedCommentsPostId, interactionsByPost]);

  useEffect(() => {
    if (!expandedCommentsPostId) {
      return undefined;
    }

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setExpandedCommentsPostId('');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [expandedCommentsPostId]);

  const handleSendFriendRequest = async (event) => {
    event.preventDefault();
    const candidateId = Number(selectedFriendId);

    if (!Number.isInteger(candidateId) || candidateId <= 0) {
      setFriendError('Escolhe um utilizador na lista para enviar o pedido.');
      return;
    }

    if (selectedFriendSuggestion && String(selectedFriendSuggestion?.relationStatus || '').toUpperCase() !== 'NONE') {
      setFriendError(`Não é possível enviar pedido: ${relationStatusLabel(selectedFriendSuggestion.relationStatus)}.`);
      return;
    }

    setFriendActionLoadingId('send');
    setFriendError('');
    setFriendStatus('');

    try {
      await sendFriendRequest(token, candidateId);
      await loadData();
      setFriendStatus('Pedido de amizade enviado com sucesso.');
      setFriendSearchQuery('');
      setFriendSuggestions([]);
      setSelectedFriendId('');
    } catch (error) {
      setFriendError(error?.message || 'Não foi possível enviar o pedido de amizade.');
    } finally {
      setFriendActionLoadingId('');
    }
  };

  const handleAcceptRequest = async (friendshipId) => {
    setFriendActionLoadingId(`accept-${friendshipId}`);
    setFriendError('');
    setFriendStatus('');

    try {
      await acceptFriendRequest(token, friendshipId);
      await loadData();
      setFriendStatus('Pedido de amizade aceite.');
    } catch (error) {
      setFriendError(error?.message || 'Não foi possível aceitar o pedido.');
    } finally {
      setFriendActionLoadingId('');
    }
  };

  const handleDeclineRequest = async (friendshipId) => {
    setFriendActionLoadingId(`decline-${friendshipId}`);
    setFriendError('');
    setFriendStatus('');

    try {
      await declineFriendRequest(token, friendshipId);
      await loadData();
      setFriendStatus('Pedido removido.');
    } catch (error) {
      setFriendError(error?.message || 'Não foi possível recusar o pedido.');
    } finally {
      setFriendActionLoadingId('');
    }
  };

  const handleToggleKudo = async (postId) => {
    if (!token) {
      setFeedError('Sessão inválida. Faz login novamente.');
      return;
    }

    try {
      const updated = await togglePostKudo(token, postId);
      setInteractionsByPost((previous) => ({
        ...previous,
        [String(postId)]: {
          ...(previous[String(postId)] || { comments: [] }),
          kudosByUser: updated.kudosByUser || {},
        },
      }));
    } catch (error) {
      setFeedError(error?.message || 'Não foi possível atualizar o kudo.');
    }
  };

  const handleCommentSubmit = async (event, postId) => {
    event.preventDefault();
    if (!token) {
      setFeedError('Sessão inválida. Faz login novamente.');
      return;
    }

    const key = String(postId);
    const draft = String(commentDrafts[key] || '').trim();

    if (!draft) {
      return;
    }

    try {
      const newComment = await addPostComment(token, postId, draft);
      setInteractionsByPost((previous) => ({
        ...previous,
        [key]: {
          ...(previous[key] || { kudosByUser: {} }),
          comments: [...(previous[key]?.comments || []), newComment].slice(-40),
        },
      }));
      setCommentDrafts((previous) => ({
        ...previous,
        [key]: '',
      }));
    } catch (error) {
      setFeedError(error?.message || 'Não foi possível enviar o comentário.');
    }
  };

  const handleRemoveFriend = async (friendId) => {
    const numericFriendId = Number(friendId);
    if (!Number.isInteger(numericFriendId) || numericFriendId <= 0) return;

    const confirmation = window.confirm('Tem certeza que pretende remover amigo?');
    if (!confirmation) return;

    const candidateFriendshipIds = [
      encodeFriendshipId(currentUserId, numericFriendId),
      encodeFriendshipId(numericFriendId, currentUserId),
    ];

    setFriendActionLoadingId(`remove-${numericFriendId}`);
    setFriendError('');
    setFriendStatus('');

    try {
      let removed = false;
      for (const friendshipId of candidateFriendshipIds) {
        try {
          await removeFriend(token, friendshipId);
          removed = true;
          break;
        } catch {
          // try inverse id encoding as fallback
        }
      }

      if (!removed) {
        throw new Error('Não foi possível remover esta amizade.');
      }

      await loadData();
      setFriendStatus('Amigo removido com sucesso.');
    } catch (error) {
      setFriendError(error?.message || 'Não foi possível remover o amigo.');
    } finally {
      setFriendActionLoadingId('');
    }
  };

  const handleStartEditPost = (post) => {
    const postId = String(post?.id || '');
    if (!postId) return;

    setEditingPostId(postId);
    setEditingDraft({
      description: String(post?.description || ''),
      rating: Math.min(5, Math.max(1, Number(post?.rating || 5))),
    });
    setActivePostMenuId('');
    setFeedError('');
  };

  const handleCancelEditPost = () => {
    setEditingPostId('');
    setEditingDraft({ description: '', rating: 5 });
  };

  const handleSavePostEdit = async (postId) => {
    if (!token) {
      setFeedError('Sessão inválida. Faz login novamente.');
      return;
    }

    const normalizedPostId = String(postId || '');
    if (!normalizedPostId) return;

    try {
      const updated = await updateSocialPost(token, normalizedPostId, {
        description: String(editingDraft.description || '').trim(),
        rating: Number(editingDraft.rating || 0),
      });

      setFeedPosts((previous) => previous.map((post) => (
        String(post?.id) === normalizedPostId
          ? {
            ...post,
            description: updated?.description ?? String(editingDraft.description || '').trim(),
            rating: Number(updated?.rating || editingDraft.rating || post?.rating || 5),
          }
          : post
      )));

      setProfileFeedPosts((previous) => previous.map((post) => (
        String(post?.id) === normalizedPostId
          ? {
            ...post,
            description: updated?.description ?? String(editingDraft.description || '').trim(),
            rating: Number(updated?.rating || editingDraft.rating || post?.rating || 5),
          }
          : post
      )));

      setFeedStatus('Publicação atualizada com sucesso.');
      handleCancelEditPost();
    } catch (error) {
      setFeedError(error?.message || 'Não foi possível editar a publicação.');
    }
  };

  const handleDeletePost = async (postId) => {
    if (!token) {
      setFeedError('Sessão inválida. Faz login novamente.');
      return;
    }

    const normalizedPostId = String(postId || '');
    if (!normalizedPostId) return;

    try {
      await deleteSocialPost(token, normalizedPostId);
      setFeedPosts((previous) => previous.filter((post) => String(post?.id) !== normalizedPostId));
      setProfileFeedPosts((previous) => previous.filter((post) => String(post?.id) !== normalizedPostId));
      setInteractionsByPost((previous) => {
        const next = { ...previous };
        delete next[normalizedPostId];
        return next;
      });
      setActivePostMenuId('');
      setFeedStatus('Publicação removida com sucesso.');
      if (editingPostId === normalizedPostId) {
        handleCancelEditPost();
      }
    } catch (error) {
      setFeedError(error?.message || 'Não foi possível remover a publicação.');
    }
  };

  const handleQuickEmojiComment = async (postId, emoji) => {
    if (!token) {
      setFeedError('Sessão inválida. Faz login novamente.');
      return;
    }

    const cleanEmoji = String(emoji || '').trim();
    if (!cleanEmoji) {
      return;
    }

    try {
      const newComment = await addPostComment(token, postId, cleanEmoji);
      const key = String(postId);
      setInteractionsByPost((previous) => ({
        ...previous,
        [key]: {
          ...(previous[key] || { kudosByUser: {} }),
          comments: [...(previous[key]?.comments || []), newComment].slice(-40),
        },
      }));
    } catch (error) {
      setFeedError(error?.message || 'Não foi possível comentar com emoji.');
    }
  };

  const handleCreateCommunity = async (event) => {
    event.preventDefault();
    const name = String(communityNameDraft || '').trim();

    if (name.length < 2) {
      setFriendError('O nome da comunidade deve ter pelo menos 2 caracteres.');
      return;
    }

    setFriendActionLoadingId('community-create');
    setFriendError('');
    setFriendStatus('');

    try {
      await createCommunity(token, name);
      await loadData({ silent: true });
      setCommunityNameDraft('');
      setFriendStatus('Comunidade criada com sucesso.');
    } catch (error) {
      setFriendError(error?.message || 'Não foi possível criar comunidade.');
    } finally {
      setFriendActionLoadingId('');
    }
  };

  const handleRenameCommunity = async (communityId, nextName) => {
    const name = String(nextName || '').trim();
    if (name.length < 2) {
      setFriendError('O nome da comunidade deve ter pelo menos 2 caracteres.');
      return;
    }

    setFriendActionLoadingId(`community-rename-${communityId}`);
    setFriendError('');
    setFriendStatus('');

    try {
      await renameCommunity(token, communityId, name);
      await loadData({ silent: true });
      setFriendStatus('Nome da comunidade atualizado.');
    } catch (error) {
      setFriendError(error?.message || 'Não foi possível atualizar o nome da comunidade.');
    } finally {
      setFriendActionLoadingId('');
    }
  };

  const handleInviteFriendToCommunity = async (communityId) => {
    const selected = Number(communityInviteDraftById[communityId] || 0);
    if (!Number.isInteger(selected) || selected <= 0) {
      setFriendError('Seleciona um amigo para convidar.');
      return;
    }

    setFriendActionLoadingId(`community-invite-${communityId}`);
    setFriendError('');
    setFriendStatus('');

    try {
      await inviteFriendToCommunity(token, communityId, selected);
      await loadData({ silent: true });
      setCommunityInviteDraftById((previous) => ({
        ...previous,
        [communityId]: '',
      }));
      setFriendStatus('Convite enviado para a comunidade.');
    } catch (error) {
      setFriendError(error?.message || 'Não foi possível enviar convite para a comunidade.');
    } finally {
      setFriendActionLoadingId('');
    }
  };

  const handleAcceptCommunityInvite = async (communityId) => {
    setFriendActionLoadingId(`community-accept-${communityId}`);
    setFriendError('');
    setFriendStatus('');

    try {
      await acceptCommunityInvite(token, communityId);
      await loadData({ silent: true });
      setFriendStatus('Convite para comunidade aceite.');
    } catch (error) {
      setFriendError(error?.message || 'Não foi possível aceitar o convite da comunidade.');
    } finally {
      setFriendActionLoadingId('');
    }
  };

  const handleDeclineCommunityInvite = async (communityId) => {
    setFriendActionLoadingId(`community-decline-${communityId}`);
    setFriendError('');
    setFriendStatus('');

    try {
      await declineCommunityInvite(token, communityId);
      await loadData({ silent: true });
      setFriendStatus('Convite para comunidade recusado.');
    } catch (error) {
      setFriendError(error?.message || 'Não foi possível recusar o convite da comunidade.');
    } finally {
      setFriendActionLoadingId('');
    }
  };

  return (
    <Layout>
      <div className="page nutri-social-page">
        <div className="container-xl">
          <div className="page-header d-print-none mb-3">
            <div className="row align-items-center w-100 g-2">
              <div className="col">
                <h2 className="page-title mb-1">NutriSocial</h2>
                <div className="text-secondary">Partilha pratos, reage com kudos e comenta com a tua rede.</div>
              </div>
              <div className="col-auto d-flex align-items-center gap-2">
                <span className="badge bg-orange-lt text-orange d-inline-flex align-items-center gap-2 py-2 px-3">
                  <Flame size={14} /> Streak {streakCount} dias
                </span>
              </div>
            </div>
          </div>

          <nav className="card mb-3" aria-label="Navegação NutriSocial">
            <div className="card-body py-2">
              <div className="nutri-social-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'feed'}
                  className={`nutri-social-tab ${activeTab === 'feed' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('feed')}
                title="Feed"
                aria-label="Feed"
              >
                  Feed
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'friends'}
                  className={`nutri-social-tab ${activeTab === 'friends' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('friends')}
                title="Amigos"
                aria-label="Amigos"
              >
                  Amigos
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'meal'}
                  className={`nutri-social-tab ${activeTab === 'meal' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('meal')}
                title="Registar Refeição"
                aria-label="Registar Refeição"
              >
                  Registar Refeição
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'profile'}
                  className={`nutri-social-tab ${activeTab === 'profile' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('profile')}
                title="Perfil"
                aria-label="Perfil"
              >
                  Perfil
                </button>
              </div>
            </div>
          </nav>

          {activeTab === 'feed' || activeTab === 'profile' ? (
            <div className="card mb-3">
              <div className="card-body py-3">
                <div className="d-flex gap-3 flex-nowrap overflow-auto nutri-social-stories" aria-label="Rede ativa">
                  {storyUsers.map((user, index) => (
                    <button key={`story-${user.id}`} type="button" className="nutri-social-story-item">
                      <span className="nutri-social-story-avatar">{String(user?.name || '').trim().slice(0, 2).toUpperCase() || String(user.id).slice(-2)}</span>
                      <span className="nutri-social-story-label">{index === 0 ? 'Tu' : user.name}</span>
                    </button>
                  ))}
                  {storyUsers.length === 0 ? <p className="text-secondary mb-0">Adiciona amigos para veres mais atividade social.</p> : null}
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === 'friends' ? (
            <section className="card mb-3 nutri-social-friends-shell">
              <div className="card-body nutri-social-friends-body">
                <header className="nutri-social-friends-header">
                  <div>
                    <h1>Rede de Amigos</h1>
                    <p>Organiza amizades, pedidos e comunidades num só lugar.</p>
                  </div>
                  <div className="nutri-social-active-counter" title="Amigos ativos">
                    <Users size={16} />
                    <span>{activeFriendsCount} ativos</span>
                  </div>
                </header>

                <form className="nutri-social-search-card" onSubmit={handleSendFriendRequest}>
                  <label className="form-label mb-1">Adicionar novo amigo</label>
                  <div className="nutri-social-search-input-wrap">
                    <Search size={16} aria-hidden="true" />
                    <input
                      className="form-control"
                      type="text"
                      value={friendSearchQuery}
                      onChange={(event) => {
                        setFriendSearchQuery(event.target.value);
                        setFriendError('');
                        setFriendStatus('');
                      }}
                      placeholder="Procura por nome ou email para enviar pedido"
                    />
                  </div>
                  <small className="text-secondary">Escreve pelo menos 2 caracteres para pesquisar.</small>

                  <div className="nutri-social-search-actions">
                    <select
                      className="form-select"
                      value={selectedFriendId}
                      onChange={(event) => setSelectedFriendId(event.target.value)}
                      disabled={friendSuggestions.length === 0}
                    >
                      <option value="">Seleciona um utilizador</option>
                      {friendSuggestions.map((suggestion) => (
                        <option key={`friend-suggestion-${suggestion.id}`} value={suggestion.id}>
                          {suggestion.name || `Utilizador #${suggestion.id}`}
                          {suggestion.email ? ` (${suggestion.email})` : ''}
                          {` · ${relationStatusLabel(suggestion.relationStatus)}`}
                        </option>
                      ))}
                    </select>

                    <button
                      type="submit"
                      className="nutri-social-submit"
                      disabled={
                        friendActionLoadingId === 'send'
                        || !selectedFriendSuggestion
                        || String(selectedFriendSuggestion?.relationStatus || '').toUpperCase() !== 'NONE'
                      }
                    >
                      <UserPlus size={16} />
                      {friendActionLoadingId === 'send' ? 'A enviar...' : 'Adicionar amigo'}
                    </button>
                  </div>
                  {isSearchingUsers ? <small className="text-secondary">A pesquisar utilizadores...</small> : null}
                </form>

                <div className="nutri-social-subtabs" role="tablist" aria-label="Gestão social">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={friendsPanelTab === 'friends'}
                    className={`nutri-social-subtab ${friendsPanelTab === 'friends' ? 'is-active' : ''}`}
                    onClick={() => setFriendsPanelTab('friends')}
                  >
                    Amigos <span className="nutri-social-subtab-badge">{friendUsers.length}</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={friendsPanelTab === 'requests'}
                    className={`nutri-social-subtab ${friendsPanelTab === 'requests' ? 'is-active' : ''}`}
                    onClick={() => setFriendsPanelTab('requests')}
                  >
                    Pedidos <span className="nutri-social-subtab-badge">{pendingRequestsCount}</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={friendsPanelTab === 'communities'}
                    className={`nutri-social-subtab ${friendsPanelTab === 'communities' ? 'is-active' : ''}`}
                    onClick={() => setFriendsPanelTab('communities')}
                  >
                    Comunidades <span className="nutri-social-subtab-badge">{communities.length}</span>
                  </button>
                </div>

                {friendToast ? (
                  <div className={`nutri-social-toast ${friendToast.type === 'error' ? 'is-error' : 'is-success'}`} role="status" aria-live="polite">
                    {friendToast.type === 'error' ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
                    <span>{friendToast.message}</span>
                  </div>
                ) : null}

                {friendsLoading ? (
                  <div className="nutri-social-loading-state">
                    <div className="spinner-border spinner-border-sm text-primary" role="status" aria-hidden="true" />
                    <span>A carregar dados da rede...</span>
                  </div>
                ) : null}

                {!friendsLoading && friendsPanelTab === 'friends' ? (
                  <section className="nutri-social-friends-panel" aria-label="Lista de amigos">
                    <div className="nutri-social-toolbar">
                      <div className="nutri-social-filters">
                        <button
                          type="button"
                          className={`nutri-social-filter-chip ${friendFilter === 'all' ? 'is-active' : ''}`}
                          onClick={() => setFriendFilter('all')}
                        >
                          Todos
                        </button>
                        <button
                          type="button"
                          className={`nutri-social-filter-chip ${friendFilter === 'online' ? 'is-active' : ''}`}
                          onClick={() => setFriendFilter('online')}
                        >
                          Online
                        </button>
                      </div>

                      <div className="nutri-social-sort">
                        <label htmlFor="friend-sort-select">Ordenar</label>
                        <select
                          id="friend-sort-select"
                          className="form-select form-select-sm"
                          value={friendSort}
                          onChange={(event) => setFriendSort(event.target.value)}
                        >
                          <option value="az">A → Z</option>
                          <option value="za">Z → A</option>
                        </select>
                      </div>
                    </div>

                    {sortedFilteredFriends.length === 0 ? (
                      <div className="nutri-social-empty-state">
                        <Users size={34} />
                        <h2>{friendFilter === 'online' ? 'Sem amigos online' : 'Ainda sem amigos'}</h2>
                        <p>{friendFilter === 'online' ? 'Nenhum amigo está ativo agora.' : 'Usa a pesquisa acima para começar a tua rede.'}</p>
                        <button
                          type="button"
                          className="nutri-social-secondary-btn"
                          onClick={() => {
                            setFriendFilter('all');
                            setFriendSearchQuery('');
                          }}
                        >
                          Ver todos
                        </button>
                      </div>
                    ) : (
                      <div className="nutri-social-friends-card-grid">
                        {sortedFilteredFriends.map((friend) => (
                          <article className="nutri-social-friend-card" key={`friend-id-${friend.id}`}>
                            <div className="nutri-social-friend-main">
                              <img
                                src={avatarForUser(friend.id, userDirectory)}
                                alt={friend.name || `Utilizador #${friend.id}`}
                                className="nutri-social-friend-avatar"
                                loading="lazy"
                              />
                              <div className="nutri-social-friend-meta">
                                <strong>{friend.name || `Utilizador #${friend.id}`}</strong>
                                <span>{friend.email || 'Sem email público'}</span>
                              </div>
                            </div>
                            <button
                              type="button"
                              className="nutri-social-remove-btn"
                              onClick={() => handleRemoveFriend(friend.id)}
                              disabled={friendActionLoadingId === `remove-${friend.id}`}
                            >
                              {friendActionLoadingId === `remove-${friend.id}` ? 'A remover...' : 'Remover'}
                            </button>
                          </article>
                        ))}
                      </div>
                    )}
                  </section>
                ) : null}

                {!friendsLoading && friendsPanelTab === 'requests' ? (
                  <section className="nutri-social-requests-panel" aria-label="Pedidos de amizade">
                    <article className="nutri-social-request-card">
                      <h2>Pedidos recebidos <span>({pendingReceived.length})</span></h2>
                      {pendingReceived.length === 0 ? (
                        <div className="nutri-social-empty-state compact">
                          <MessageCircle size={28} />
                          <p>Sem pedidos recebidos neste momento.</p>
                        </div>
                      ) : (
                        pendingReceived.map((request) => {
                          const requesterName = userDirectory.get(Number(request.requesterId))?.name || `Utilizador #${request.requesterId}`;
                          return (
                            <div className="nutri-social-friend-item" key={`request-received-${request.id}`}>
                              <span>{requesterName}</span>
                              <div className="nutri-social-actions">
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-primary"
                                  onClick={() => handleAcceptRequest(request.id)}
                                  disabled={friendActionLoadingId === `accept-${request.id}`}
                                >
                                  {friendActionLoadingId === `accept-${request.id}` ? 'A aceitar...' : 'Aceitar'}
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-danger"
                                  onClick={() => handleDeclineRequest(request.id)}
                                  disabled={friendActionLoadingId === `decline-${request.id}`}
                                >
                                  {friendActionLoadingId === `decline-${request.id}` ? 'A recusar...' : 'Recusar'}
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </article>

                    <article className="nutri-social-request-card">
                      <h2>Pedidos enviados <span>({pendingSent.length})</span></h2>
                      {pendingSent.length === 0 ? (
                        <div className="nutri-social-empty-state compact">
                          <MessageCircle size={28} />
                          <p>Sem pedidos enviados pendentes.</p>
                        </div>
                      ) : (
                        pendingSent.map((request) => {
                          const addresseeName = userDirectory.get(Number(request.addresseeId))?.name || `Utilizador #${request.addresseeId}`;
                          return (
                            <div className="nutri-social-friend-item" key={`request-sent-${request.id}`}>
                              <span>{addresseeName}</span>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-danger"
                                onClick={() => handleDeclineRequest(request.id)}
                                disabled={friendActionLoadingId === `decline-${request.id}`}
                              >
                                {friendActionLoadingId === `decline-${request.id}` ? 'A cancelar...' : 'Cancelar'}
                              </button>
                            </div>
                          );
                        })
                      )}
                    </article>
                  </section>
                ) : null}

                {!friendsLoading && friendsPanelTab === 'communities' ? (
                  <section className="nutri-social-friend-community">
                    <div className="nutri-social-section-divider" />
                    <h2 className="h6 mb-2">Comunidades</h2>
                    <form className="row g-2 mb-3" onSubmit={handleCreateCommunity}>
                      <div className="col">
                        <input
                          className="form-control"
                          type="text"
                          value={communityNameDraft}
                          onChange={(event) => setCommunityNameDraft(event.target.value)}
                          placeholder="Nome da comunidade"
                        />
                      </div>
                      <div className="col-auto">
                        <button type="submit" className="nutri-social-submit" disabled={friendActionLoadingId === 'community-create'}>
                          <Users size={14} />
                          {friendActionLoadingId === 'community-create' ? 'A criar...' : 'Criar comunidade'}
                        </button>
                      </div>
                    </form>

                    <div className="mb-3">
                      <h5 className="h6 mb-2">Convites para ti ({pendingCommunityInvites.length})</h5>
                      {pendingCommunityInvites.length === 0 ? (
                        <div className="nutri-social-empty-state compact">
                          <Users size={28} />
                          <p>Sem convites pendentes.</p>
                        </div>
                      ) : null}
                      {pendingCommunityInvites.map((invite) => (
                        <div className="nutri-social-friend-item" key={`community-pending-${invite.communityId}`}>
                          <span>{invite.communityName || `Comunidade #${invite.communityId}`} · por {invite.inviterName || `#${invite.inviterId}`}</span>
                          <div className="nutri-social-actions">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary"
                              onClick={() => handleAcceptCommunityInvite(invite.communityId)}
                              disabled={friendActionLoadingId === `community-accept-${invite.communityId}`}
                            >
                              {friendActionLoadingId === `community-accept-${invite.communityId}` ? 'A aceitar...' : 'Aceitar'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger"
                              onClick={() => handleDeclineCommunityInvite(invite.communityId)}
                              disabled={friendActionLoadingId === `community-decline-${invite.communityId}`}
                            >
                              {friendActionLoadingId === `community-decline-${invite.communityId}` ? 'A recusar...' : 'Recusar'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {communities.length === 0 ? (
                      <div className="nutri-social-empty-state compact">
                        <Users size={28} />
                        <p>Ainda não tens comunidades.</p>
                      </div>
                    ) : null}

                    {communities.map((community) => {
                      const isOwnerCommunity = Number(community.ownerUserId) === Number(currentUserId);
                      return (
                        <article className="nutri-social-community-item" key={community.id}>
                          <div className="row g-2 align-items-center">
                            <div className="col-12 col-md-5">
                              <label className="form-label mb-1">Nome</label>
                              <input
                                className="form-control form-control-sm"
                                type="text"
                                value={community.name}
                                onBlur={(event) => handleRenameCommunity(community.id, event.target.value)}
                                disabled={!isOwnerCommunity}
                              />
                            </div>
                            <div className="col-12 col-md-5">
                              <label className="form-label mb-1">Convidar amigo</label>
                              <select
                                className="form-select form-select-sm"
                                value={communityInviteDraftById[community.id] || ''}
                                onChange={(event) => setCommunityInviteDraftById((previous) => ({
                                  ...previous,
                                  [community.id]: event.target.value,
                                }))}
                                disabled={friendUsers.length === 0 || !isOwnerCommunity}
                              >
                                <option value="">Seleciona um amigo</option>
                                {friendUsers.map((friend) => (
                                  <option key={`community-invite-${community.id}-${friend.id}`} value={friend.id}>
                                    {friend.name || `Utilizador #${friend.id}`}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="col-12 col-md-2 d-grid">
                              <button
                                type="button"
                                className="btn btn-outline-primary btn-sm"
                                onClick={() => handleInviteFriendToCommunity(community.id)}
                                disabled={!isOwnerCommunity || friendActionLoadingId === `community-invite-${community.id}`}
                              >
                                {friendActionLoadingId === `community-invite-${community.id}` ? 'A enviar...' : 'Convidar'}
                              </button>
                            </div>
                          </div>

                          <div className="nutri-social-community-members mt-2">
                            <small className="text-secondary">Membros:</small>
                            <div className="nutri-social-id-cloud">
                              {community.memberIds.length === 0 ? (
                                <span>Sem amigos convidados</span>
                              ) : (
                                community.memberIds.map((memberId) => {
                                  const member = friendUsers.find((friend) => Number(friend.id) === Number(memberId));
                                  return <span key={`community-${community.id}-member-${memberId}`}>{member?.name || `#${memberId}`}</span>;
                                })
                              )}
                            </div>
                          </div>

                          {Array.isArray(community.pendingInviteUserIds) && community.pendingInviteUserIds.length > 0 ? (
                            <div className="nutri-social-community-members mt-2">
                              <small className="text-secondary">Convites pendentes:</small>
                              <div className="nutri-social-id-cloud">
                                {community.pendingInviteUserIds.map((memberId) => {
                                  const member = friendUsers.find((friend) => Number(friend.id) === Number(memberId));
                                  return <span key={`community-${community.id}-pending-${memberId}`}>{member?.name || `#${memberId}`}</span>;
                                })}
                              </div>
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </section>
                ) : null}
              </div>
            </section>
          ) : null}

          {activeTab === 'feed' || activeTab === 'profile' ? (
            <section className="card">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h3 className="card-title m-0">{activeTab === 'profile' ? 'Perfil · As tuas publicações' : 'Feed NutriSocial'}</h3>
              <div className="d-flex align-items-center gap-2">
                <span className="badge">Utilizador #{currentUserId || '—'}</span>
              </div>
            </div>
            <div className="card-body">
              {feedLoading ? <p className="text-secondary mb-2">A carregar feed...</p> : null}
              {!feedLoading && feedError ? <p className="text-danger mb-2">{feedError}</p> : null}
              {!feedLoading && !feedError && feedStatus ? <p className="text-success mb-2">{feedStatus}</p> : null}
              {!feedLoading && !feedError && activePostList.length === 0 ? (
                <p className="text-secondary mb-0">
                  {activeTab === 'profile'
                    ? 'Ainda não tens publicações no teu perfil.'
                    : 'Ainda não existem partilhas no teu feed.'}
                </p>
              ) : null}

              <div className="d-grid gap-3">
                {activePostList.map((post) => {
                  const interaction = getPostInteraction(post.id);
                  const kudosCount = Object.keys(interaction.kudosByUser || {}).length;
                  const hasKudoFromMe = Boolean(interaction.kudosByUser?.[String(currentUserId)]);
                  const comments = Array.isArray(interaction.comments) ? interaction.comments : [];
                  const imageSrc = normalizePostImage(post);
                  const sortedComments = [...comments]
                    .map((comment) => ({
                      ...comment,
                      createdAt: normalizeDateTimeValue(comment?.createdAt, comment?.created_at, comment?.currentTime, comment?.current_time),
                    }))
                    .sort((left, right) => new Date(right?.createdAt || 0).getTime() - new Date(left?.createdAt || 0).getTime());
                  const draftKey = String(post.id);
                  const isOwnPost = Number(post?.userId) === Number(currentUserId);
                  const mealType = mealTypeFromPost(post);
                  const mealTypeDisplay = mealTypeLabel(mealType) || 'Refeição';
                  const createdLabel = dayHourLabel(post?.currentTime || post?.createdAt);
                  const isEditingPost = editingPostId === draftKey;

                  return (
                    <article className="card nutri-social-feed-post" key={post.id}>
                      <div className="card-header nutri-social-post-header">
                        <div className="d-flex align-items-center gap-2">
                          <span className="avatar avatar-sm">{String(post.userId || '').slice(-2)}</span>
                          <div className="d-flex flex-column">
                            <span className="fw-semibold">{usernameFromId(post.userId, currentUserId, userDirectory)}</span>
                            <small className="text-secondary d-inline-flex align-items-center gap-1">
                              <Clock3 size={12} /> {createdLabel}
                            </small>
                          </div>
                        </div>

                        <div className="d-flex align-items-center gap-2">
                          <span className="badge bg-indigo-lt text-indigo">{mealTypeDisplay}</span>
                          <span className="badge bg-azure-lt text-azure">⭐ {post.rating}/5</span>
                          {isOwnPost ? (
                            <div className="dropdown">
                              <button
                                type="button"
                                className="btn btn-outline-secondary btn-sm"
                                onClick={() => setActivePostMenuId((previous) => (previous === draftKey ? '' : draftKey))}
                              >
                                •••
                              </button>
                              {activePostMenuId === draftKey ? (
                                <div className="nutri-social-post-menu">
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-primary"
                                    onClick={() => handleStartEditPost(post)}
                                  >
                                    <Pencil size={13} /> Editar
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-danger"
                                    onClick={() => handleDeletePost(post.id)}
                                  >
                                    <Trash2 size={13} /> Remover
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <NutriSocialPostImage
                        src={imageSrc}
                        alt={post.description || post.recipeName || 'Refeição partilhada'}
                      />

                      <div className="card-body">
                        <h4 className="h5 mb-1">{post.recipeName || `Receita #${post.recipeId}`}</h4>

                        {isEditingPost ? (
                          <div className="nutri-social-inline-edit mb-2">
                            <textarea
                              className="form-control"
                              rows={2}
                              value={editingDraft.description}
                              onChange={(event) => setEditingDraft((previous) => ({ ...previous, description: event.target.value }))}
                              placeholder="Descrição da publicação"
                            />
                            <div className="d-flex align-items-center gap-2">
                              <label className="form-label mb-0">Classificação</label>
                              <input
                                type="number"
                                min={1}
                                max={5}
                                className="form-control form-control-sm"
                                value={editingDraft.rating}
                                onChange={(event) => setEditingDraft((previous) => ({
                                  ...previous,
                                  rating: Math.max(1, Math.min(5, Number(event.target.value || 1))),
                                }))}
                                style={{ width: '84px' }}
                              />
                              <button type="button" className="btn btn-primary btn-sm" onClick={() => handleSavePostEdit(post.id)}>
                                Guardar
                              </button>
                              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={handleCancelEditPost}>
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-secondary mb-2">{post.description || 'Sem descrição.'}</p>
                        )}

                        <div className="nutri-social-post-actions mb-2">
                          <button
                            type="button"
                            className={`btn btn-sm ${hasKudoFromMe ? 'btn-primary' : 'btn-outline-primary'} d-inline-flex align-items-center gap-1`}
                            onClick={() => handleToggleKudo(post.id)}
                          >
                            <ThumbsUp size={14} />
                            Kudos {kudosCount}
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1"
                            onClick={() => handleOpenCommentsModal(post.id)}
                            aria-label={`Ver todos os comentários (${sortedComments.length})`}
                          >
                            <MessageCircle size={13} /> {sortedComments.length} comentários
                          </button>
                        </div>

                        {kudosCount > 0 ? (
                          (() => {
                            const kudoUsers = Object.entries(interaction.kudosByUser || {})
                              .map(([userId, createdAt]) => ({
                                userId: Number(userId),
                                createdAt: String(createdAt || ''),
                              }))
                              .filter((item) => Number.isInteger(item.userId) && item.userId > 0)
                              .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
                            const highlightedUsers = kudoUsers.slice(0, 3);
                            const remainingUsers = Math.max(0, kudoUsers.length - highlightedUsers.length);

                            return (
                              <div className="nutri-social-kudo-summary mb-2">
                                <div className="nutri-social-kudo-avatars">
                                  {highlightedUsers.map((item, index) => (
                                    <img
                                      key={`kudo-${post.id}-${item.userId}-${index}`}
                                      className="nutri-social-kudo-avatar"
                                      src={avatarForUser(item.userId, userDirectory)}
                                      alt={usernameFromId(item.userId, currentUserId, userDirectory)}
                                      title={usernameFromId(item.userId, currentUserId, userDirectory)}
                                    />
                                  ))}
                                </div>
                                <span className="nutri-social-kudo-text">
                                  {remainingUsers > 0
                                    ? `e mais ${remainingUsers} utilizadores`
                                    : highlightedUsers.length === 1
                                      ? '1 utilizador deu kudo'
                                      : `${highlightedUsers.length} utilizadores deram kudos`}
                                </span>
                              </div>
                            );
                          })()
                        ) : null}

                        <div className="nutri-social-quick-emoji">
                          {QUICK_EMOJI_COMMENTS.map((emoji) => (
                            <button
                              key={`quick-emoji-${post.id}-${emoji}`}
                              type="button"
                              className="nutri-social-emoji-chip"
                              onClick={() => handleQuickEmojiComment(post.id, emoji)}
                              aria-label={`Comentar ${emoji}`}
                              title={`Comentar ${emoji}`}
                            >
                              <img
                                className="nutri-social-emoji-icon"
                                src={emojiToTwemojiUrl(emoji)}
                                alt={emoji}
                                loading="lazy"
                                onError={(event) => {
                                  event.currentTarget.style.display = 'none';
                                }}
                              />
                              <span className="nutri-social-emoji-fallback">{emoji}</span>
                            </button>
                          ))}
                        </div>

                        <form className="nutri-social-comment-form" onSubmit={(event) => handleCommentSubmit(event, post.id)}>
                          <input
                            className="form-control"
                            type="text"
                            value={commentDrafts[draftKey] || ''}
                            onChange={(event) =>
                              setCommentDrafts((previous) => ({
                                ...previous,
                                [draftKey]: event.target.value,
                              }))
                            }
                            placeholder="Escreve um comentário..."
                          />
                          <button type="submit" className="btn btn-outline-primary btn-sm">
                            <Send size={14} />
                          </button>
                        </form>

                        {sortedComments.length > 0 ? (
                          <div className="nutri-social-comment-list mt-2">
                            {sortedComments.slice(0, 4).map((comment) => (
                              <div className="nutri-social-comment-item" key={comment.id}>
                                <strong>{usernameFromId(comment.userId, currentUserId, userDirectory)}</strong>
                                <span>{comment.text}</span>
                                <small>{prettyDate(comment.createdAt)}</small>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
            </section>
          ) : null}

          {expandedCommentsPostId ? (
            <div
              className="nutri-social-comments-modal-backdrop"
              onClick={handleCloseCommentsModal}
              role="presentation"
            >
              <div
                className="nutri-social-comments-modal"
                role="dialog"
                aria-modal="true"
                aria-label="Todos os comentários"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="nutri-social-comments-modal-header">
                  <h4 className="h6 mb-0">
                    Comentários · {expandedCommentsPost?.recipeName || `Receita #${expandedCommentsPost?.recipeId || expandedCommentsPostId}`}
                  </h4>
                  <button type="button" className="btn btn-sm btn-outline-secondary" onClick={handleCloseCommentsModal}>
                    Fechar
                  </button>
                </div>

                <div className="nutri-social-comments-modal-body">
                  {expandedComments.length === 0 ? (
                    <p className="text-secondary mb-0">Sem comentários para mostrar.</p>
                  ) : (
                    <div className="nutri-social-comment-list">
                      {expandedComments.map((comment) => (
                        <div className="nutri-social-comment-item" key={`modal-comment-${expandedCommentsPostId}-${comment.id}`}>
                          <strong>{usernameFromId(comment.userId, currentUserId, userDirectory)}</strong>
                          <span>{comment.text}</span>
                          <small>{prettyDate(comment.createdAt)}</small>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === 'meal' ? (
            <section className="card">
              <div className="card-header">
                <h3 className="card-title m-0">Registar Refeição</h3>
              </div>
              <div className="card-body">
                <p className="text-secondary mb-3">Regista aqui a tua refeição sem sair do NutriSocial.</p>
                <form className="d-grid gap-3" onSubmit={handleMealSubmit}>
                  <div>
                    <label className="form-label">Foto da refeição</label>
                    <input
                      className="form-control"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleMealPhotoChange}
                    />
                  </div>

                  {mealPhotoPreview ? (
                    <img
                      src={mealPhotoPreview}
                      alt="Pré-visualização da refeição"
                      className="img-fluid rounded border"
                      style={{ maxHeight: 320, objectFit: 'cover' }}
                    />
                  ) : null}

                  <div>
                    <label className="form-label">Descrição (opcional)</label>
                    <textarea
                      className="form-control"
                      rows={3}
                      value={mealDescription}
                      onChange={(event) => setMealDescription(event.target.value)}
                      placeholder="Ex: almoço com frango grelhado e legumes."
                    />
                  </div>

                  <div>
                    <label className="form-label mb-1">Visibilidade da refeição</label>
                    <div className="d-flex flex-wrap gap-3">
                      <label className="form-check d-inline-flex align-items-center gap-2 mb-0">
                        <input
                          className="form-check-input"
                          type="radio"
                          name="mealVisibility"
                          value="public"
                          checked={mealVisibility === 'public'}
                          onChange={(event) => setMealVisibility(event.target.value)}
                        />
                        <span className="form-check-label">Pública (aparece no NutriSocial)</span>
                      </label>
                      <label className="form-check d-inline-flex align-items-center gap-2 mb-0">
                        <input
                          className="form-check-input"
                          type="radio"
                          name="mealVisibility"
                          value="private"
                          checked={mealVisibility === 'private'}
                          onChange={(event) => setMealVisibility(event.target.value)}
                        />
                        <span className="form-check-label">Privada (só conta para streak)</span>
                      </label>
                    </div>
                  </div>

                  {mealVisibility === 'public' ? (
                    <div className="row g-3">
                      <div className="col-12 col-md-8">
                        <label className="form-label">Receita associada</label>
                        <select
                          className="form-select"
                          value={mealSelectedRecipeId}
                          onChange={(event) => setMealSelectedRecipeId(event.target.value)}
                          required
                        >
                          <option value="">Seleciona uma receita</option>
                          {mealRecipes.map((recipe) => (
                            <option key={recipe.id} value={recipe.id}>{recipe.name || `Receita #${recipe.id}`}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-12 col-md-4">
                        <label className="form-label">Avaliação (1-5)</label>
                        <input
                          className="form-control"
                          type="number"
                          min={1}
                          max={5}
                          value={mealRating}
                          onChange={(event) => setMealRating(event.target.value)}
                          required
                        />
                      </div>
                    </div>
                  ) : null}

                  <div className="d-flex flex-wrap gap-2">
                    <button type="submit" className="btn btn-primary" disabled={mealIsSubmitting}>
                      <Send size={16} />
                      {mealIsSubmitting ? 'A registar...' : 'Registar refeição'}
                    </button>
                  </div>

                  {mealSubmitStatus ? <p className="mb-0 text-secondary">{mealSubmitStatus}</p> : null}
                </form>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </Layout>
  );
}
