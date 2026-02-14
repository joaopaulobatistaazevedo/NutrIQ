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

  const togglePanel = (panelName) => {
    setActivePanel((previous) => (previous === panelName ? '' : panelName));
  };

  return (
    <Layout>
      <div className="nutri-social-page">
        <header className="nutri-social-header">
          <h1>NutriSocial</h1>
          <p>Feed saudável da tua rede, com ações rápidas para publicar e gerir amizades.</p>
          <div className="nutri-social-streak">
            <Flame size={18} />
            <span>Streak atual: {streakCount} dias</span>
          </div>
        </header>

        {activePanel === 'post' ? (
          <section className="nutri-social-sheet">
            <div className="nutri-social-sheet-head">
              <h2>Nova publicação</h2>
              <button type="button" className="nutri-social-icon-btn" onClick={() => setActivePanel('')}>
                <X size={16} />
              </button>
            </div>
            <form className="nutri-social-form" onSubmit={handleSubmit}>
              <label className="nutri-social-field file-input">
                <span><Camera size={16} /> Tirar foto da refeição</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={onPhotoChange}
                />
              </label>

              {photoPreview ? (
                <img src={photoPreview} alt="Pré-visualização da refeição" className="nutri-social-preview" />
              ) : null}

              <label className="nutri-social-field">
                <span>Descrição (opcional)</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Ex: Prato com proteína e legumes."
                  rows={3}
                />
              </label>

              <label className="nutri-social-share-toggle">
                <input
                  type="checkbox"
                  checked={shareOnNutriSocial}
                  onChange={(event) => setShareOnNutriSocial(event.target.checked)}
                />
                <span><Share2 size={16} /> Partilhar no NutriSocial</span>
              </label>

              {shareOnNutriSocial ? (
                <>
                  <label className="nutri-social-field">
                    <span>Receita associada</span>
                    <select
                      value={selectedRecipeId}
                      onChange={(event) => setSelectedRecipeId(event.target.value)}
                      required
                    >
                      <option value="">Seleciona uma receita</option>
                      {sortedRecipes.map((recipe) => (
                        <option key={recipe?.id} value={recipe?.id}>{recipe?.name || `Receita #${recipe?.id}`}</option>
                      ))}
                    </select>
                  </label>

                  <label className="nutri-social-field">
                    <span>Avaliação (1-5)</span>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={rating}
                      onChange={(event) => setRating(event.target.value)}
                      required
                    />
                  </label>
                </>
              ) : null}

              <button type="submit" className="nutri-social-submit" disabled={isSubmitting}>
                <Send size={16} />
                {isSubmitting ? 'A registar...' : 'Publicar'}
              </button>

              {submitStatus ? <p className="nutri-social-status">{submitStatus}</p> : null}
            </form>
          </section>
        ) : null}

        {activePanel === 'friends' ? (
          <section className="nutri-social-sheet">
            <div className="nutri-social-sheet-head">
              <h2>Rede de amigos</h2>
              <button type="button" className="nutri-social-icon-btn" onClick={() => setActivePanel('')}>
                <X size={16} />
              </button>
            </div>

            <form className="nutri-social-inline-form" onSubmit={handleSendFriendRequest}>
              <label className="nutri-social-field">
                <span>ID do utilizador</span>
                <input
                  type="number"
                  min={1}
                  value={newFriendId}
                  onChange={(event) => setNewFriendId(event.target.value)}
                  placeholder="Ex: 2"
                />
              </label>
              <button
                type="submit"
                className="nutri-social-submit"
                disabled={friendActionLoadingId === 'send'}
              >
                <Send size={16} />
                {friendActionLoadingId === 'send' ? 'A enviar...' : 'Enviar'}
              </button>
            </form>

            {friendStatus ? <p className="nutri-social-feedback">{friendStatus}</p> : null}
            {friendError ? <p className="nutri-social-feedback error">{friendError}</p> : null}

            {friendsLoading ? <p className="nutri-social-feedback">A carregar amizades...</p> : null}
            {!friendsLoading ? (
              <div className="nutri-social-friends-grid">
                <div className="nutri-social-friend-list">
                  <h3>Amigos ({friendIds.length})</h3>
                  {friendIds.length === 0 ? <p className="nutri-social-feedback">Ainda sem amizades ativas.</p> : null}
                  {friendIds.length > 0 ? (
                    <div className="nutri-social-id-cloud">
                      {friendIds.map((friendId) => (
                        <span key={`friend-id-${friendId}`}>#{friendId}</span>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="nutri-social-friend-list">
                  <h3>Pedidos recebidos ({pendingReceived.length})</h3>
                  {pendingReceived.length === 0 ? <p className="nutri-social-feedback">Sem pedidos recebidos.</p> : null}
                  {pendingReceived.map((request) => (
                    <div className="nutri-social-friend-item" key={`request-received-${request.id}`}>
                      <span>De utilizador #{request.requesterId}</span>
                      <div className="nutri-social-actions">
                        <button
                          type="button"
                          className="nutri-social-secondary-btn"
                          onClick={() => handleAcceptRequest(request.id)}
                          disabled={friendActionLoadingId === `accept-${request.id}`}
                        >
                          {friendActionLoadingId === `accept-${request.id}` ? 'A aceitar...' : 'Aceitar'}
                        </button>
                        <button
                          type="button"
                          className="nutri-social-secondary-btn danger"
                          onClick={() => handleDeclineRequest(request.id)}
                          disabled={friendActionLoadingId === `decline-${request.id}`}
                        >
                          {friendActionLoadingId === `decline-${request.id}` ? 'Recusar...' : 'Recusar'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="nutri-social-friend-list">
                  <h3>Pedidos enviados ({pendingSent.length})</h3>
                  {pendingSent.length === 0 ? <p className="nutri-social-feedback">Sem pedidos enviados pendentes.</p> : null}
                  {pendingSent.map((request) => (
                    <div className="nutri-social-friend-item" key={`request-sent-${request.id}`}>
                      <span>Para utilizador #{request.addresseeId}</span>
                      <button
                        type="button"
                        className="nutri-social-secondary-btn danger"
                        onClick={() => handleDeclineRequest(request.id)}
                        disabled={friendActionLoadingId === `decline-${request.id}`}
                      >
                        {friendActionLoadingId === `decline-${request.id}` ? 'A cancelar...' : 'Cancelar'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="nutri-social-card">
          <div className="nutri-social-feed-head">
            <h2>Feed NutriSocial</h2>
            <span className="nutri-social-feed-user">Utilizador #{currentUserId || '—'}</span>
          </div>
          {feedLoading ? <p className="nutri-social-feedback">A carregar feed...</p> : null}
          {!feedLoading && feedError ? <p className="nutri-social-feedback error">{feedError}</p> : null}
          {!feedLoading && !feedError && feedPosts.length === 0 ? (
            <p className="nutri-social-feedback">Ainda não existem partilhas no teu feed.</p>
          ) : null}

          <div className="nutri-social-feed">
            {feedPosts.map((post) => (
              <article className="nutri-social-post" key={post.id}>
                <img src={normalizePostImage(post)} alt={post.description || post.recipeName || 'Refeição partilhada'} />
                <div className="nutri-social-post-body">
                  <h3>{post.recipeName || `Receita #${post.recipeId}`}</h3>
                  <p>{post.description || 'Sem descrição.'}</p>
                  <div className="nutri-social-post-meta">
                    <span>👤 #{post.userId}</span>
                    <span>⭐ {post.rating}/5</span>
                    <span>{prettyDate(post.createdAt)}</span>
                  </div>
                </div>
              </article>
            ))}
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
    </Layout>
  );
}
