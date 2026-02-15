import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../services/authService';
import '../styles/auth.css';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  const token = String(searchParams.get('token') || '').trim();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setInfoMessage('');

    if (!token) {
      setErrorMessage('Link de recuperação inválido. Pede um novo email.');
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      setErrorMessage('A nova password deve ter pelo menos 6 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('As passwords não coincidem.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await resetPassword({ token, newPassword });
      setInfoMessage(response?.message || 'Password atualizada com sucesso.');
      setTimeout(() => navigate('/login', { replace: true }), 1200);
    } catch (error) {
      setErrorMessage(error.message || 'Não foi possível redefinir a password.');
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
          <h1>Redefinir password</h1>
          <p className="auth-sub">Escolhe uma nova password para a tua conta.</p>

          <form onSubmit={handleSubmit}>
            <div className="auth-field">
              <label>Nova password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <div className="auth-field">
              <label>Confirmar password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            {errorMessage && <p className="auth-error">{errorMessage}</p>}
            {infoMessage && <p className="auth-success">{infoMessage}</p>}

            <button type="submit" className="auth-submit" disabled={isSubmitting}>
              {isSubmitting ? 'A guardar...' : 'Guardar nova password'}
            </button>
          </form>

          <p className="auth-footer">
            <Link to="/login">Voltar ao login</Link>
          </p>
        </div>

        <div className="auth-visual">
          <div className="auth-visual-inner">
            <h2>Quase a entrar</h2>
            <p>Assim que guardares, já podes iniciar sessão com a nova password.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

