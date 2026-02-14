import { useEffect, useMemo, useState } from 'react';
import { Flame, MessageCircle, Send, ThumbsUp, UserPlus, Users, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import {
  acceptFriendRequest,
  addPostComment,
  declineFriendRequest,
  fetchFriends,
  fetchNutriSocialFeed,
  fetchPendingReceivedRequests,
  fetchPendingSentRequests,
  getPostInteractions,
  sendFriendRequest,
  togglePostKudo,
} from '../services/nutriSocialService';
import { fetchMyProfile } from '../services/userService';
import { getAuthSession } from '../utils/authSession';
import '../styles/nutrisocial.css';

function normalizePostImage(post) {
  const image = String(post?.picturePath || '').trim();
  if (image) return image;
  return 'https://placehold.co/860x520/e2e8f0/475569?text=NutriSocial';
}

function prettyDate(value) {
  if (!value) return 'agora';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'agora';
  return parsed.toLocaleString('pt-PT');
}

function usernameFromId(userId, currentUserId) {
  if (Number(userId) === Number(currentUserId)) {
    return 'Tu';
  }
  return `Chef #${userId}`;
}

export default function NutriSocial() {
  const authSession = getAuthSession();
  const token = String(authSession?.token || '').trim();
  const currentUserId = Number(authSession?.userId || 0);

  const [streakCount, setStreakCount] = useState(0);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState('');

  const [friendsLoading, setFriendsLoading] = useState(true);
  const [friendActionLoadingId, setFriendActionLoadingId] = useState('');
  const [friendStatus, setFriendStatus] = useState('');
  const [friendError, setFriendError] = useState('');
  const [newFriendId, setNewFriendId] = useState('');
  const [activePanel, setActivePanel] = useState('');

  const [feedPosts, setFeedPosts] = useState([]);
  const [friendIds, setFriendIds] = useState([]);
  const [pendingReceived, setPendingReceived] = useState([]);
  const [pendingSent, setPendingSent] = useState([]);
  const [interactionsByPost, setInteractionsByPost] = useState({});
  const [commentDrafts, setCommentDrafts] = useState({});

  const loadData = async () => {
    if (!token) {
      setFeedLoading(false);
      setFriendsLoading(false);
      setFeedError('Sessão inválida. Faz login novamente.');
      return;
    }

    setFeedLoading(true);
    setFriendsLoading(true);
    setFeedError('');

    try {
      const [feed, profile, friends, receivedRequests, sentRequests] = await Promise.all([
        fetchNutriSocialFeed(token),
        fetchMyProfile(token),
        fetchFriends(token),
        fetchPendingReceivedRequests(token),
        fetchPendingSentRequests(token),
      ]);

      setFeedPosts(Array.isArray(feed) ? feed : []);
      setStreakCount(Math.max(0, Number(profile?.profile?.streakCount || 0)));
      setFriendIds(Array.isArray(friends) ? friends : []);
      setPendingReceived(Array.isArray(receivedRequests) ? receivedRequests : []);
      setPendingSent(Array.isArray(sentRequests) ? sentRequests : []);
    } catch (error) {
      setFeedError(error?.message || 'Não foi possível carregar o NutriSocial.');
    } finally {
      setFeedLoading(false);
      setFriendsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [token]);

  useEffect(() => {
    const postIds = feedPosts.map((post) => post?.id).filter(Boolean);
    setInteractionsByPost(getPostInteractions(postIds));
  }, [feedPosts]);

  const storyIds = useMemo(() => {
    const unique = [currentUserId, ...friendIds].filter((value, index, array) => value && array.indexOf(value) === index);
    return unique.slice(0, 10);
  }, [currentUserId, friendIds]);

  const getPostInteraction = (postId) => {
    const key = String(postId || '').trim();
    return interactionsByPost[key] || { kudosByUser: {}, comments: [] };
  };

  const handleSendFriendRequest = async (event) => {
    event.preventDefault();
    const cleanId = String(newFriendId || '').trim();

    if (!cleanId) {
      setFriendError('Indica um ID de utilizador para enviar o pedido.');
      return;
    }

    setFriendActionLoadingId('send');
    setFriendError('');
    setFriendStatus('');

    try {
      await sendFriendRequest(token, cleanId);
      await loadData();
      setFriendStatus('Pedido de amizade enviado com sucesso.');
      setNewFriendId('');
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

  const handleToggleKudo = (postId) => {
    try {
      const updated = togglePostKudo(postId, currentUserId);
      setInteractionsByPost((previous) => ({
        ...previous,
        [String(postId)]: updated,
      }));
    } catch (error) {
      setFeedError(error?.message || 'Não foi possível atualizar o kudo.');
    }
  };

  const handleCommentSubmit = (event, postId) => {
    event.preventDefault();
    const key = String(postId);
    const draft = String(commentDrafts[key] || '').trim();

    if (!draft) {
      return;
    }

    try {
      const updated = addPostComment(postId, currentUserId, draft);
      setInteractionsByPost((previous) => ({
        ...previous,
        [key]: updated,
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
                {storyIds.map((id, index) => (
                  <button key={`story-${id}`} type="button" className="nutri-social-story-item">
                    <span className="nutri-social-story-avatar">{String(id).slice(-2)}</span>
                    <span className="nutri-social-story-label">{index === 0 ? 'Tu' : `#${id}`}</span>
                  </button>
                ))}
                {storyIds.length === 0 ? <p className="text-secondary mb-0">Adiciona amigos para veres mais atividade social.</p> : null}
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
                    <label className="form-label">ID do utilizador</label>
                    <input
                      className="form-control"
                      type="number"
                      min={1}
                      value={newFriendId}
                      onChange={(event) => setNewFriendId(event.target.value)}
                      placeholder="Ex: 2"
                    />
                  </div>
                  <div className="col-auto d-flex align-items-end">
                    <button type="submit" className="btn btn-primary d-inline-flex align-items-center gap-2" disabled={friendActionLoadingId === 'send'}>
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
                        {friendIds.length === 0 ? <p className="text-secondary mb-0">Ainda sem amizades ativas.</p> : null}
                        {friendIds.length > 0 ? (
                          <div className="d-flex flex-wrap gap-2">
                            {friendIds.map((friendId) => (
                              <span className="badge" key={`friend-id-${friendId}`}>#{friendId}</span>
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
              {!feedLoading && !feedError && feedPosts.length === 0 ? <p className="text-secondary mb-0">Ainda não existem partilhas no teu feed.</p> : null}

              <div className="d-grid gap-3">
                {feedPosts.map((post) => {
                  const interaction = getPostInteraction(post.id);
                  const kudosCount = Object.keys(interaction.kudosByUser || {}).length;
                  const hasKudoFromMe = Boolean(interaction.kudosByUser?.[String(currentUserId)]);
                  const comments = Array.isArray(interaction.comments) ? interaction.comments : [];
                  const draftKey = String(post.id);

                  return (
                    <article className="card" key={post.id}>
                      <div className="card-header d-flex justify-content-between align-items-center">
                        <div className="d-flex align-items-center gap-2">
                          <span className="avatar avatar-sm">{String(post.userId || '').slice(-2)}</span>
                          <span className="fw-semibold">{usernameFromId(post.userId, currentUserId)}</span>
                        </div>
                        <span className="badge bg-azure-lt text-azure">⭐ {post.rating}/5</span>
                      </div>

                      <img src={normalizePostImage(post)} alt={post.description || post.recipeName || 'Refeição partilhada'} className="nutri-social-feed-image" />

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
                            <MessageCircle size={13} /> {comments.length} comentários
                          </span>
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

                        {comments.length > 0 ? (
                          <div className="nutri-social-comment-list mt-2">
                            {comments.slice(0, 4).map((comment) => (
                              <div className="nutri-social-comment-item" key={comment.id}>
                                <strong>{usernameFromId(comment.userId, currentUserId)}</strong>
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
