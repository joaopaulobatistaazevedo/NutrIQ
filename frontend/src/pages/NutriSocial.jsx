import { useEffect, useMemo, useState } from 'react';
import { Camera, Flame, Plus, Send, Share2, Users, X } from 'lucide-react';
import Layout from '../components/Layout';
import { fetchRecipes } from '../services/recipeService';
import { fetchMyProfile } from '../services/userService';
import {
  acceptFriendRequest,
  declineFriendRequest,
  fetchFriends,
  fetchNutriSocialFeed,
  fetchPendingReceivedRequests,
  fetchPendingSentRequests,
  registerMealPhoto,
  sendFriendRequest,
} from '../services/nutriSocialService';
import { getAuthSession } from '../utils/authSession';
import '../styles/nutrisocial.css';

function buildPreviewFromFile(file) {
  if (!file) return '';
  return URL.createObjectURL(file);
}

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

export default function NutriSocial() {
  const authSession = getAuthSession();
  const token = String(authSession?.token || '').trim();

  const [streakCount, setStreakCount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState('');
  const [feedError, setFeedError] = useState('');
  const [feedLoading, setFeedLoading] = useState(true);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [friendActionLoadingId, setFriendActionLoadingId] = useState('');
  const [friendStatus, setFriendStatus] = useState('');
  const [friendError, setFriendError] = useState('');
  const [newFriendId, setNewFriendId] = useState('');
  const [activePanel, setActivePanel] = useState('');

  const [shareOnNutriSocial, setShareOnNutriSocial] = useState(true);
  const [description, setDescription] = useState('');
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const [rating, setRating] = useState(5);
  const [photoPath, setPhotoPath] = useState('');
  const [photoPreview, setPhotoPreview] = useState('');

  const [recipes, setRecipes] = useState([]);
  const [feedPosts, setFeedPosts] = useState([]);
  const [friendIds, setFriendIds] = useState([]);
  const [pendingReceived, setPendingReceived] = useState([]);
  const [pendingSent, setPendingSent] = useState([]);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      if (!token) {
        if (mounted) {
          setFeedLoading(false);
          setFeedError('Sessão inválida. Faz login novamente.');
        }
        return;
      }

      setFeedLoading(true);
      setFeedError('');

      try {
        const [feed, recipeList, myProfile, friends, receivedRequests, sentRequests] = await Promise.all([
          fetchNutriSocialFeed(token),
          fetchRecipes({ limit: 300 }),
          fetchMyProfile(token),
          fetchFriends(token),
          fetchPendingReceivedRequests(token),
          fetchPendingSentRequests(token),
        ]);

        if (!mounted) return;
        setFeedPosts(Array.isArray(feed) ? feed : []);
        setRecipes(Array.isArray(recipeList) ? recipeList : []);
        setStreakCount(Math.max(0, Number(myProfile?.profile?.streakCount || 0)));
        setFriendIds(Array.isArray(friends) ? friends : []);
        setPendingReceived(Array.isArray(receivedRequests) ? receivedRequests : []);
        setPendingSent(Array.isArray(sentRequests) ? sentRequests : []);
      } catch (error) {
        if (!mounted) return;
        setFeedError(error?.message || 'Não foi possível carregar o NutriSocial.');
      } finally {
        if (mounted) {
          setFeedLoading(false);
          setFriendsLoading(false);
        }
      }
    };

    void run();

    return () => {
      mounted = false;
    };
  }, [token]);

  const sortedRecipes = useMemo(
    () => [...recipes].sort((left, right) => String(left?.name || '').localeCompare(String(right?.name || ''))),
    [recipes],
  );

  const onPhotoChange = (event) => {
    const file = event?.target?.files?.[0];
    if (!file) {
      return;
    }

    if (photoPreview && photoPreview.startsWith('blob:')) {
      URL.revokeObjectURL(photoPreview);
    }

    const preview = buildPreviewFromFile(file);
    setPhotoPreview(preview);
    setPhotoPath(preview);
    setSubmitStatus('');
  };

  const refreshFeed = async () => {
    if (!token) return;
    const refreshed = await fetchNutriSocialFeed(token);
    setFeedPosts(Array.isArray(refreshed) ? refreshed : []);
  };

  const refreshFriendData = async () => {
    if (!token) return;
    const [friends, receivedRequests, sentRequests] = await Promise.all([
      fetchFriends(token),
      fetchPendingReceivedRequests(token),
      fetchPendingSentRequests(token),
    ]);
    setFriendIds(Array.isArray(friends) ? friends : []);
    setPendingReceived(Array.isArray(receivedRequests) ? receivedRequests : []);
    setPendingSent(Array.isArray(sentRequests) ? sentRequests : []);
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
      await refreshFriendData();
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
      await refreshFriendData();
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
      await refreshFriendData();
      setFriendStatus('Pedido removido.');
    } catch (error) {
      setFriendError(error?.message || 'Não foi possível recusar o pedido.');
    } finally {
      setFriendActionLoadingId('');
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!token) {
      setSubmitStatus('Sessão inválida. Faz login novamente.');
      return;
    }

    const cleanPhotoPath = String(photoPath || '').trim();
    if (!cleanPhotoPath) {
      setSubmitStatus('Tira uma foto da refeição para atualizar o streak.');
      return;
    }

    if (shareOnNutriSocial) {
      if (!selectedRecipeId) {
        setSubmitStatus('Seleciona uma receita para partilhar no NutriSocial.');
        return;
      }
    }

    setIsSubmitting(true);
    setSubmitStatus('');

    try {
      const payload = {
        picturePath: cleanPhotoPath,
        description: String(description || '').trim() || null,
        shareOnNutriSocial,
        recipeId: shareOnNutriSocial ? Number(selectedRecipeId) : null,
        rating: shareOnNutriSocial ? Number(rating) : null,
      };

      const result = await registerMealPhoto(token, payload);
      const nextStreak = Number(result?.streakCount || 0);
      setStreakCount(Number.isFinite(nextStreak) ? nextStreak : 0);

      if (shareOnNutriSocial) {
        await refreshFeed();
      }

      setSubmitStatus(
        shareOnNutriSocial
          ? 'Foto registada, streak atualizado e partilhada no NutriSocial.'
          : 'Foto registada e streak atualizado com sucesso.',
      );

      setDescription('');
      setSelectedRecipeId('');
      setRating(5);
    } catch (error) {
      setSubmitStatus(error?.message || 'Não foi possível registar a foto.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentUserId = Number(authSession?.userId || 0);

  const storyIds = useMemo(() => {
    const unique = [currentUserId, ...friendIds].filter((value, index, array) => value && array.indexOf(value) === index);
    return unique.slice(0, 10);
  }, [currentUserId, friendIds]);

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
                <div className="text-secondary">Feed saudável da tua rede com ações rápidas.</div>
              </div>
              <div className="col-auto">
                <span className="badge bg-orange-lt text-orange d-inline-flex align-items-center gap-2 py-2 px-3">
                  <Flame size={14} /> Streak {streakCount} dias
                </span>
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
                {storyIds.length === 0 ? (
                  <p className="text-secondary mb-0">Adiciona amigos para veres mais atividade social.</p>
                ) : null}
              </div>
            </div>
          </div>

          {activePanel === 'post' ? (
            <section className="card mb-3">
              <div className="card-header d-flex justify-content-between align-items-center">
                <h3 className="card-title m-0">Nova publicação</h3>
                <button type="button" className="btn btn-icon" onClick={() => setActivePanel('')}>
                  <X size={16} />
                </button>
            </div>
              <div className="card-body">
                <form className="nutri-social-form" onSubmit={handleSubmit}>
                  <label className="form-label d-flex align-items-center gap-2"><Camera size={16} /> Tirar foto da refeição</label>
                  <input
                    className="form-control mb-3"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={onPhotoChange}
                  />

                  {photoPreview ? (
                    <img src={photoPreview} alt="Pré-visualização da refeição" className="nutri-social-preview mb-3" />
                  ) : null}

                  <label className="form-label">Descrição (opcional)</label>
                  <textarea
                    className="form-control mb-3"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Ex: Prato com proteína e legumes."
                    rows={3}
                  />

                  <label className="form-check mb-3 d-inline-flex align-items-center gap-2">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={shareOnNutriSocial}
                      onChange={(event) => setShareOnNutriSocial(event.target.checked)}
                    />
                    <span className="form-check-label d-inline-flex align-items-center gap-2"><Share2 size={16} /> Partilhar no NutriSocial</span>
                  </label>

                  {shareOnNutriSocial ? (
                    <>
                      <label className="form-label">Receita associada</label>
                      <select
                        className="form-select mb-3"
                        value={selectedRecipeId}
                        onChange={(event) => setSelectedRecipeId(event.target.value)}
                        required
                      >
                        <option value="">Seleciona uma receita</option>
                        {sortedRecipes.map((recipe) => (
                          <option key={recipe?.id} value={recipe?.id}>{recipe?.name || `Receita #${recipe?.id}`}</option>
                        ))}
                      </select>

                      <label className="form-label">Avaliação (1-5)</label>
                      <input
                        className="form-control mb-3"
                        type="number"
                        min={1}
                        max={5}
                        value={rating}
                        onChange={(event) => setRating(event.target.value)}
                        required
                      />
                    </>
                  ) : null}

                  <button type="submit" className="btn btn-primary w-100 d-inline-flex align-items-center justify-content-center gap-2" disabled={isSubmitting}>
                    <Send size={16} />
                    {isSubmitting ? 'A registar...' : 'Publicar'}
                  </button>

                  {submitStatus ? <p className="text-secondary mt-2 mb-0">{submitStatus}</p> : null}
                </form>
              </div>
            </section>
          ) : null}

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
                    <button
                      type="submit"
                      className="btn btn-primary d-inline-flex align-items-center gap-2"
                      disabled={friendActionLoadingId === 'send'}
                    >
                      <Send size={16} />
                      {friendActionLoadingId === 'send' ? 'A enviar...' : 'Enviar'}
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
              <span className="badge">Utilizador #{currentUserId || '—'}</span>
            </div>
            <div className="card-body">
              {feedLoading ? <p className="text-secondary mb-2">A carregar feed...</p> : null}
              {!feedLoading && feedError ? <p className="text-danger mb-2">{feedError}</p> : null}
              {!feedLoading && !feedError && feedPosts.length === 0 ? (
                <p className="text-secondary mb-0">Ainda não existem partilhas no teu feed.</p>
              ) : null}

              <div className="d-grid gap-3">
                {feedPosts.map((post) => (
                  <article className="card" key={post.id}>
                    <div className="card-header d-flex justify-content-between align-items-center">
                      <div className="d-flex align-items-center gap-2">
                        <span className="avatar avatar-sm">{String(post.userId || '').slice(-2)}</span>
                        <span className="fw-semibold">Utilizador #{post.userId}</span>
                      </div>
                      <span className="badge bg-azure-lt text-azure">⭐ {post.rating}/5</span>
                    </div>
                    <img src={normalizePostImage(post)} alt={post.description || post.recipeName || 'Refeição partilhada'} className="nutri-social-feed-image" />
                    <div className="card-body">
                      <h4 className="h5 mb-1">{post.recipeName || `Receita #${post.recipeId}`}</h4>
                      <p className="text-secondary mb-2">{post.description || 'Sem descrição.'}</p>
                      <div className="d-flex flex-wrap gap-2">
                        <span className="badge bg-secondary-lt">🕒 {prettyDate(post.createdAt)}</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <div className="nutri-social-fab-stack" aria-label="Ações rápidas NutriSocial">
            <button
              type="button"
              className={`nutri-social-fab nutri-social-fab-main ${activePanel === 'post' ? 'active' : ''}`}
              onClick={() => togglePanel('post')}
              aria-label="Nova publicação"
            >
              <Plus size={22} />
            </button>
            <button
              type="button"
              className={`nutri-social-fab nutri-social-fab-friends ${activePanel === 'friends' ? 'active' : ''}`}
              onClick={() => togglePanel('friends')}
              aria-label="Gerir amigos"
            >
              <Users size={18} />
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
