// src/components/Sidebar.jsx
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarDays,
  BookOpen,
  ShoppingCart,
  BarChart3,
  User,
  LogOut,
  ChevronRight,
} from 'lucide-react';
import '../styles/sidebar.css';

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/meal-plan', icon: CalendarDays, label: 'Plano Semanal' },
    { path: '/recipes', icon: BookOpen, label: 'Receitas' },
    { path: '/shopping', icon: ShoppingCart, label: 'Lista de Compras' },
    { path: '/progress', icon: BarChart3, label: 'Progresso' },
    { path: '/profile', icon: User, label: 'Perfil' },
  ];

  const isActive = (path) => location.pathname === path;

  const handleLogout = () => {
    // Por agora só navega para login
    navigate('/login');
  };

  return (
    <div className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <span className="sidebar-logo-text">NutrIQ</span>
      </div>

      {/* Menu */}
      <nav className="sidebar-nav">
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
          <button
            key={item.path}
            className={`sidebar-item ${isActive(item.path) ? 'active' : ''}`}
            onClick={() => navigate(item.path)}
          >
            <Icon className="sidebar-item-icon" />
            <span className="sidebar-item-label">{item.label}</span>
            <ChevronRight className="sidebar-item-arrow" />
          </button>
          );
        })}
      </nav>

      {/* Footer - Logout */}
      <div className="sidebar-footer">
        <button className="sidebar-logout" onClick={handleLogout}>
          <LogOut className="sidebar-item-icon" />
          <span className="sidebar-item-label">Sair</span>
          <ChevronRight className="sidebar-item-arrow" />
        </button>
      </div>
    </div>
  );
}