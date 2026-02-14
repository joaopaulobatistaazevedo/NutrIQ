// src/pages/Register.jsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { setAuthSession } from '../utils/authSession';
import { registerUser } from '../services/authService';
import '../styles/auth.css';

export default function Register() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (password !== confirmPassword) {
      setErrorMessage('As passwords não coincidem.');
      return;
    }

    if (password.length < 8) {
      setErrorMessage('A password deve ter pelo menos 8 caracteres.');
      return;
    }

    setIsSubmitting(true);
    try {
      const auth = await registerUser({
        name: name.trim(),
        email: email.trim(),
        password,
      });

      setAuthSession({
        userId: auth.userId,
        token: auth.token,
        email: email.trim(),
        name: name.trim(),
      });

      navigate('/welcome-bot', { state: { name: name.trim() }, replace: true });
    } catch (error) {
      setErrorMessage(error.message || 'Não foi possível criar a conta.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      {/* Animated blobs */}
      <div className="auth-blob ab-1" />
      <div className="auth-blob ab-2" />
      <div className="auth-blob ab-3" />
      <div className="auth-noise" />

      <div className="auth-card">
        <div className="auth-card-inner">
          <span className="auth-logo">NutrIQ</span>
          <h1>Cria a tua conta</h1>
          <p className="auth-sub">Começa a planear as tuas refeições hoje</p>

          <form onSubmit={handleSubmit}>
            <div className="auth-field">
              <label>Nome completo</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="João Silva" required />
            </div>
            <div className="auth-field">
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="o.teu@email.com" required />
            </div>
            <div className="auth-field">
              <label>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" required />
            </div>
            <div className="auth-field">
              <label>Confirmar password</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" required />
            </div>
            {errorMessage && <p className="auth-error">{errorMessage}</p>}
            <button type="submit" className="auth-submit" disabled={isSubmitting}>
              {isSubmitting ? 'A criar conta...' : 'Criar conta'}
            </button>
          </form>

          <p className="auth-footer">Já tens conta? <Link to="/login">Entrar</Link></p>
        </div>

        {/* Side visual */}
        <div className="auth-visual">
          <div className="auth-visual-inner">
            <h2>Junta-te a milhares de utilizadores</h2>
            <p>Que já poupam tempo e dinheiro nas suas refeições</p>
            <div className="auth-stats-grid">
              {[
                { num: '10k+', label: 'Utilizadores ativos' },
                { num: '50k+', label: 'Receitas criadas' },
                { num: '€200+', label: 'Poupança média/mês' },
              ].map((s) => (
                <div className="auth-stat" key={s.num}>
                  <strong>{s.num}</strong>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
