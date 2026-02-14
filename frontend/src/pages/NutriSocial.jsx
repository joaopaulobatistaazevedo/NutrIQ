import { useEffect, useMemo, useState } from 'react';
import { Camera, Share2, Flame, Send } from 'lucide-react';
import Layout from '../components/Layout';
import { fetchRecipes } from '../services/recipeService';
import { fetchMyProfile } from '../services/userService';
import { fetchNutriSocialFeed, registerMealPhoto } from '../services/nutriSocialService';
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

  const [shareOnNutriSocial, setShareOnNutriSocial] = useState(true);
  const [description, setDescription] = useState('');
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const [rating, setRating] = useState(5);
  const [photoPath, setPhotoPath] = useState('');
  const [photoPreview, setPhotoPreview] = useState('');

  const [recipes, setRecipes] = useState([]);
  const [feedPosts, setFeedPosts] = useState([]);

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
        const [feed, recipeList, myProfile] = await Promise.all([
          fetchNutriSocialFeed(token),
          fetchRecipes({ limit: 300 }),
          fetchMyProfile(token),
        ]);

        if (!mounted) return;
        setFeedPosts(Array.isArray(feed) ? feed : []);
        setRecipes(Array.isArray(recipeList) ? recipeList : []);
        setStreakCount(Math.max(0, Number(myProfile?.profile?.streakCount || 0)));
      } catch (error) {
        if (!mounted) return;
        setFeedError(error?.message || 'Não foi possível carregar o NutriSocial.');
      } finally {
        if (mounted) {
          setFeedLoading(false);
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

  return (
    <Layout>
      <div className="nutri-social-page">
        <header className="nutri-social-header">
          <h1>NutriSocial</h1>
          <p>Regista a tua refeição para aumentar o streak e partilha com a tua rede para motivar hábitos saudáveis.</p>
          <div className="nutri-social-streak">
            <Flame size={18} />
            <span>Streak atual: {streakCount} dias</span>
          </div>
        </header>

        <section className="nutri-social-card">
          <h2>Nova refeição</h2>
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
              {isSubmitting ? 'A registar...' : 'Registar refeição'}
            </button>

            {submitStatus ? <p className="nutri-social-status">{submitStatus}</p> : null}
          </form>
        </section>

        <section className="nutri-social-card">
          <h2>Feed NutriSocial</h2>
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
                    <span>⭐ {post.rating}/5</span>
                    <span>{prettyDate(post.createdAt)}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </Layout>
  );
}
