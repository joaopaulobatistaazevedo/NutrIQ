import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { getStoredRoleForEmail, setAuthSession } from '../utils/authSession';
import { loginUser } from '../services/authService';
import { fetchMyProfile } from '../services/userService';
import { PROFILE_KEY } from '../constants/storageKeys';
import '../styles/auth.css';

function mapSexToUi(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'M') return 'Masculino';
  if (normalized === 'F') return 'Feminino';
  if (normalized === 'OTHER') return 'Outro';
  return '';
}

function buildLocalProfileFromApi(apiUser) {
  const remoteProfile = apiUser?.profile || {};
  return {
    username: String(apiUser?.name || '').trim(),
    location: '',
    sex: mapSexToUi(remoteProfile?.sex),
    weight:
      remoteProfile?.weightKg !== undefined && remoteProfile?.weightKg !== null
        ? String(remoteProfile.weightKg)
        : '',
    height:
      remoteProfile?.heightCm !== undefined && remoteProfile?.heightCm !== null
        ? String(remoteProfile.heightCm)
        : '',
    age:
      remoteProfile?.age !== undefined && remoteProfile?.age !== null
        ? String(remoteProfile.age)
        : '',
  };
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      const trimmedEmail = email.trim();
      const role = getStoredRoleForEmail(trimmedEmail);

      const auth = await loginUser({
        email: trimmedEmail,
        password,
      });

      setAuthSession({
        userId: auth.userId,
        token: auth.token,
        email: trimmedEmail,
        role,
      });

      try {
        const apiUser = await fetchMyProfile(auth.token);
        const existingRaw = localStorage.getItem(PROFILE_KEY);
        const existingProfile = existingRaw ? JSON.parse(existingRaw) : null;
        const mappedProfile = buildLocalProfileFromApi(apiUser);
        localStorage.setItem(
          PROFILE_KEY,
          JSON.stringify({
            ...mappedProfile,
            location: existingProfile?.location || mappedProfile.location,
          }),
        );
      } catch {
        // Keep login successful even if profile sync fails.
      }

      const roleDefaultRedirect = role === 'nutritionist' ? '/nutritionist' : '/dashboard';
      const redirectTo = location.state?.from || roleDefaultRedirect;
      navigate(redirectTo, { replace: true });
    } catch (error) {
      setErrorMessage(error.message || 'Não foi possível fazer login.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-blob ab-1" />
      <div className="auth-blob ab-2" />
      <div className="auth-blob ab-3" />
      <div className="auth-noise" />

      <div className="auth-card">
        <div className="auth-card-inner">
          <span className="auth-logo">NutrIQ</span>
          <h1>Bem-vindo de volta</h1>
          <p className="auth-sub">Entra na tua conta para continuar</p>

          <form onSubmit={handleSubmit}>
            <div className="auth-field">
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="o.teu@email.com" required />
            </div>
            <div className="auth-field">
              <label>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
            </div>
            {errorMessage && <p className="auth-error">{errorMessage}</p>}
            <button type="button" className="auth-forgot">Esqueceste-te da password?</button>
            <button type="submit" className="auth-submit" disabled={isSubmitting}>
              {isSubmitting ? 'A entrar...' : 'Entrar'}
            </button>
          </form>

          <p className="auth-footer">Ainda não tens conta? <Link to="/register">Criar conta</Link></p>
        </div>

        <div className="auth-visual">
          <div className="auth-visual-inner">
            <h2>Planeia as tuas refeições de forma simples</h2>
            <p>Poupa tempo e dinheiro com planos personalizados</p>
            <div className="auth-features">
              {['Planos semanais personalizados', 'Lista de compras automática', 'Receitas saudáveis e económicas'].map((f) => (
                <div className="auth-feature" key={f}>
                  <span className="auth-feature-ic"><Check size={14} strokeWidth={3} /></span>
                  <span>{f}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
