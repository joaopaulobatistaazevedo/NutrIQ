import { useCallback, useEffect, useMemo, useState } from 'react';
import { Flame, MessageCircle, Send, ThumbsUp, UserPlus, Users, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import {
  acceptFriendRequest,
  addPostComment,
  declineFriendRequest,
  fetchFriends,
  fetchNutriSocialFeed,
  fetchPostInteractionsMap,
  fetchPendingReceivedRequests,
  fetchPendingSentRequests,
  resolveNutriSocialImageUrl,
  searchUsersForFriendRequest,
  sendFriendRequest,
  togglePostKudo,
} from '../services/nutriSocialService';
import { fetchMyProfile } from '../services/userService';
import { getAuthSession } from '../utils/authSession';
import '../styles/nutrisocial.css';

const FALLBACK_POST_IMAGE = 'https://placehold.co/860x520/e2e8f0/475569?text=NutriSocial';

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

export default function NutriSocial() {
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
  const [activePanel, setActivePanel] = useState('');

  const [feedPosts, setFeedPosts] = useState([]);
  const [friendIds, setFriendIds] = useState([]);
  const [friendUsers, setFriendUsers] = useState([]);
  const [pendingReceived, setPendingReceived] = useState([]);
  const [pendingSent, setPendingSent] = useState([]);
  const [interactionsByPost, setInteractionsByPost] = useState({});
  const [commentDrafts, setCommentDrafts] = useState({});

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
      const [feed, profile, friends, receivedRequests, sentRequests] = await Promise.all([
        fetchNutriSocialFeed(token),
        fetchMyProfile(token),
        fetchFriends(token),
        fetchPendingReceivedRequests(token),
        fetchPendingSentRequests(token),
      ]);

      const normalizedFeed = (Array.isArray(feed) ? feed : []).filter((post) => !isInvalidLegacyBlobPath(post));
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
      announceFriendRequestRefresh();
      void hydratePostInteractions(normalizedFeed);
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
  }, [announceFriendRequestRefresh, hydratePostInteractions, sessionName, token]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

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

    if (activePanel !== 'friends' || !token) {
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
  }, [activePanel, friendSearchQuery, token]);

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

  const getPostInteraction = (postId) => {
    const key = String(postId || '').trim();
    return interactionsByPost[key] || { kudosByUser: {}, comments: [] };
  };

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

  const togglePanel = (panelName) => {
    setActivePanel((previous) => (previous === panelName ? '' : panelName));
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
                <Link to="/progress" className="btn btn-primary btn-sm">Registar refeição</Link>
              </div>
            </div>
          </div>

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

          {activePanel === 'friends' ? (
            <section className="card mb-3">
              <div className="card-header d-flex justify-content-between align-items-center">
                <h3 className="card-title m-0">Rede de amigos</h3>
                <button type="button" className="btn btn-icon" onClick={() => setActivePanel('')}>
                  <X size={16} />
                </button>
              </div>

              <div className="card-body">
                <form className="row g-2 mb-3" onSubmit={handleSendFriendRequest}>
                  <div className="col">
                    <label className="form-label">Procurar por nome</label>
                    <input
                      className="form-control"
                      type="text"
                      value={friendSearchQuery}
                      onChange={(event) => {
                        setFriendSearchQuery(event.target.value);
                        setFriendError('');
                        setFriendStatus('');
                      }}
                      placeholder="Ex: joao"
                    />
                    <div className="form-text">
                      Escreve pelo menos 2 caracteres para pesquisar utilizadores.
                    </div>
                  </div>
                  <div className="col-12">
                    <label className="form-label">Resultados</label>
                    <select
                      className="form-select"
                      value={selectedFriendId}
                      onChange={(event) => setSelectedFriendId(event.target.value)}
                      disabled={friendSuggestions.length === 0}
                    >
                      <option value="">Seleciona um utilizador</option>
                      {friendSuggestions.map((suggestion) => (
                        <option key={`friend-suggestion-${suggestion.id}`} value={suggestion.id}>
                          {suggestion.name || `Utilizador #${suggestion.id}`} {suggestion.email ? `(${suggestion.email})` : ''} - {relationStatusLabel(suggestion.relationStatus)}
                        </option>
                      ))}
                    </select>
                    {isSearchingUsers ? <div className="form-text">A pesquisar utilizadores...</div> : null}
                  </div>
                  <div className="col-auto d-flex align-items-end">
                    <button
                      type="submit"
                      className="btn btn-primary d-inline-flex align-items-center gap-2"
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
                </form>

                {friendStatus ? <p className="text-secondary mb-2">{friendStatus}</p> : null}
                {friendError ? <p className="text-danger mb-2">{friendError}</p> : null}
                {friendsLoading ? <p className="text-secondary mb-0">A carregar amizades...</p> : null}

                {!friendsLoading ? (
                  <div className="row g-3">
                    <div className="col-12 col-lg-4">
                      <div className="border rounded-3 p-3 h-100">
                        <h4 className="h6 mb-2">Amigos ({friendIds.length})</h4>
                        {friendUsers.length === 0 ? <p className="text-secondary mb-0">Ainda sem amizades ativas.</p> : null}
                        {friendUsers.length > 0 ? (
                          <div className="d-flex flex-column gap-2">
                            {friendUsers.map((friend) => (
                              <div className="small" key={`friend-id-${friend.id}`}>
                                <strong>{friend.name || `Utilizador #${friend.id}`}</strong>
                                {friend.email ? <span className="text-secondary"> ({friend.email})</span> : null}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="col-12 col-lg-4">
                      <div className="border rounded-3 p-3 h-100">
                        <h4 className="h6 mb-2">Pedidos recebidos ({pendingReceived.length})</h4>
                        {pendingReceived.length === 0 ? <p className="text-secondary mb-0">Sem pedidos recebidos.</p> : null}
                        {pendingReceived.map((request) => (
                          <div className="d-flex justify-content-between align-items-center gap-2 mb-2" key={`request-received-${request.id}`}>
                            <span className="small text-secondary">De #{request.requesterId}</span>
                            <div className="d-flex gap-2">
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
                                {friendActionLoadingId === `decline-${request.id}` ? 'Recusar...' : 'Recusar'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="col-12 col-lg-4">
                      <div className="border rounded-3 p-3 h-100">
                        <h4 className="h6 mb-2">Pedidos enviados ({pendingSent.length})</h4>
                        {pendingSent.length === 0 ? <p className="text-secondary mb-0">Sem pedidos enviados pendentes.</p> : null}
                        {pendingSent.map((request) => (
                          <div className="d-flex justify-content-between align-items-center gap-2 mb-2" key={`request-sent-${request.id}`}>
                            <span className="small text-secondary">Para #{request.addresseeId}</span>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger"
                              onClick={() => handleDeclineRequest(request.id)}
                              disabled={friendActionLoadingId === `decline-${request.id}`}
                            >
                              {friendActionLoadingId === `decline-${request.id}` ? 'A cancelar...' : 'Cancelar'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          <section className="card">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h3 className="card-title m-0">Feed NutriSocial</h3>
              <div className="d-flex align-items-center gap-2">
                <span className="badge">Utilizador #{currentUserId || '—'}</span>
                <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => togglePanel('friends')}>
                  <Users size={14} />
                  Amigos
                </button>
              </div>
            </div>
            <div className="card-body">
              {feedLoading ? <p className="text-secondary mb-2">A carregar feed...</p> : null}
              {!feedLoading && feedError ? <p className="text-danger mb-2">{feedError}</p> : null}
              {!feedLoading && !feedError && feedStatus ? <p className="text-success mb-2">{feedStatus}</p> : null}
              {!feedLoading && !feedError && feedPosts.length === 0 ? <p className="text-secondary mb-0">Ainda não existem partilhas no teu feed.</p> : null}

              <div className="d-grid gap-3">
                {feedPosts.map((post) => {
                  const interaction = getPostInteraction(post.id);
                  const kudosCount = Object.keys(interaction.kudosByUser || {}).length;
                  const hasKudoFromMe = Boolean(interaction.kudosByUser?.[String(currentUserId)]);
                  const comments = Array.isArray(interaction.comments) ? interaction.comments : [];
                  const imageSrc = normalizePostImage(post);
                  const sortedComments = [...comments].sort(
                    (left, right) => new Date(right?.createdAt || 0).getTime() - new Date(left?.createdAt || 0).getTime(),
                  );
                  const draftKey = String(post.id);

                  return (
                    <article className="card" key={post.id}>
                      <div className="card-header d-flex justify-content-between align-items-center">
                        <div className="d-flex align-items-center gap-2">
                          <span className="avatar avatar-sm">{String(post.userId || '').slice(-2)}</span>
                          <span className="fw-semibold">{usernameFromId(post.userId, currentUserId, userDirectory)}</span>
                        </div>
                        <span className="badge bg-azure-lt text-azure">⭐ {post.rating}/5</span>
                      </div>

                      <NutriSocialPostImage
                        src={imageSrc}
                        alt={post.description || post.recipeName || 'Refeição partilhada'}
                      />

                      <div className="card-body">
                        <h4 className="h5 mb-1">{post.recipeName || `Receita #${post.recipeId}`}</h4>
                        <p className="text-secondary mb-2">{post.description || 'Sem descrição.'}</p>

                        <div className="nutri-social-post-actions mb-2">
                          <button
                            type="button"
                            className={`btn btn-sm ${hasKudoFromMe ? 'btn-primary' : 'btn-outline-primary'} d-inline-flex align-items-center gap-1`}
                            onClick={() => handleToggleKudo(post.id)}
                          >
                            <ThumbsUp size={14} />
                            Kudos {kudosCount}
                          </button>
                          <span className="badge bg-secondary-lt">
                            <MessageCircle size={13} /> {sortedComments.length} comentários
                          </span>
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

                        <div className="d-flex flex-wrap gap-2 mt-2">
                          <span className="badge bg-secondary-lt">🕒 {prettyDate(post.createdAt)}</span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>
        </div>
      </div>
    </Layout>
  );
}
