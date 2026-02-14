// src/components/Sidebar.jsx
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LogOut,
  ChevronRight,
} from 'lucide-react';
import { MAIN_NAV_ITEMS } from '../config/navigation';
import { AUTH_KEY, PROFILE_KEY } from '../constants/storageKeys';
import '../styles/sidebar.css';

const clearNutribotSessionData = () => {
  const keysToRemove = [];

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key) {
      continue;
    }

    if (key === PROFILE_KEY || key === AUTH_KEY || key.startsWith('nutribot_chat_')) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => localStorage.removeItem(key));
};

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path) => location.pathname === path;

  const handleLogout = () => {
    clearNutribotSessionData();
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
        {MAIN_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isNutriSocial = item.path === '/nutrisocial';
          return (
          <button
            key={item.path}
            className={`sidebar-item ${isActive(item.path) ? 'active' : ''} ${isNutriSocial ? 'sidebar-item-nutrisocial' : ''}`}
            onClick={() => navigate(item.path)}
            title={`${item.label} (${item.shortcut})`}
            aria-keyshortcuts={item.shortcut}
          >
            <Icon className="sidebar-item-icon" />
            <span className="sidebar-item-label">{item.label}</span>
            <span className="sidebar-item-kbd" aria-hidden="true">{item.shortcut}</span>
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
