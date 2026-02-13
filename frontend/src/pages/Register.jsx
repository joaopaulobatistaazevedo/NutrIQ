// src/pages/Register.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/auth.css';

export default function Register() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    // Por agora só navega para dashboard (sem validação)
    navigate('/dashboard');
  };

  return (
    <div className="auth-container">
      {/* Lado esquerdo - Form */}
      <div className="auth-form-side">
        <div className="auth-form">
          <div className="logo">
            <span className="logo-text">MealPlanner</span>
          </div>

          <h1>Cria a tua conta</h1>
          <p className="subtitle">Começa a planear as tuas refeições hoje</p>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Nome completo</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="João Silva"
                required
              />
            </div>

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
                placeholder="Mínimo 8 caracteres"
                required
              />
            </div>

            <div className="form-group">
              <label>Confirmar password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <button type="submit" className="btn-primary">
              Criar conta
            </button>
          </form>

          <p className="auth-footer">
            Já tens conta? <a href="/login">Entrar</a>
          </p>
        </div>
      </div>

      {/* Lado direito - Imagem/Branding */}
      <div className="auth-visual-side">
        <div className="visual-content">
          <h2>Junta-te a milhares de utilizadores</h2>
          <p>Que já poupam tempo e dinheiro nas suas refeições</p>
          
          <div className="stats">
            <div className="stat">
              <h3>10k+</h3>
              <p>Utilizadores ativos</p>
            </div>
            <div className="stat">
              <h3>50k+</h3>
              <p>Receitas criadas</p>
            </div>
            <div className="stat">
              <h3>€200+</h3>
              <p>Poupança média/mês</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}