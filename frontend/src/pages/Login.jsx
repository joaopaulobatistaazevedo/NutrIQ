// src/pages/Login.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import '../styles/auth.css';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    navigate('/dashboard');
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
            <a href="#" className="auth-forgot">Esqueceste-te da password?</a>
            <button type="submit" className="auth-submit">Entrar</button>
          </form>

          <p className="auth-footer">Ainda não tens conta? <a href="/register">Criar conta</a></p>
        </div>

        {/* Side visual */}
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