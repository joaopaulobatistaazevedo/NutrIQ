// src/pages/Login.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
    <div className="auth-container">
      {/* Lado esquerdo - Form */}
      <div className="auth-form-side">
        <div className="auth-form">
          <div className="logo">
            <span className="logo-text">NutrIQ</span>
          </div>

          <h1>Bem-vindo de volta</h1>
          <p className="subtitle">Entra na tua conta para continuar</p>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="o.teu@email.com"
                required
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <a href="#" className="forgot-password">Esqueceste-te da password?</a>

            <button type="submit" className="btn-primary">
              Entrar
            </button>
          </form>

          <p className="auth-footer">
            Ainda não tens conta? <a href="/register">Criar conta</a>
          </p>
        </div>
      </div>

      {/* Lado direito - Imagem/Branding */}
      <div className="auth-visual-side">
        <div className="visual-content">
          <h2>Planeia as tuas refeições de forma simples</h2>
          <p>Poupa tempo e dinheiro com planos personalizados</p>
          
          <div className="features">
            <div className="feature">
              <span className="feature-icon">✓</span>
              <span>Planos semanais personalizados</span>
            </div>
            <div className="feature">
              <span className="feature-icon">✓</span>
              <span>Lista de compras automática</span>
            </div>
            <div className="feature">
              <span className="feature-icon">✓</span>
              <span>Receitas saudáveis e económicas</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}