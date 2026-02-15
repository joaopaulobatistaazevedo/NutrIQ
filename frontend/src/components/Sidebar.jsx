import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronRight, LogOut } from 'lucide-react';
import { getMainNavItems } from '../config/navigation';
import { AUTH_KEY, PROFILE_KEY } from '../constants/storageKeys';
import { getUserRole } from '../utils/authSession';
import { useSocialNotifications } from '../context/SocialNotificationContext';
import '../styles/sidebar.css';

const clearNutribotSessionData = () => {
  const keysToRemove = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key) continue;
    if (key === PROFILE_KEY || key === AUTH_KEY || key.startsWith('nutribot_chat_')) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
};

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const role = getUserRole();
  const navItems = useMemo(() => getMainNavItems(role), [role]);
  const { pendingSocialNotificationCount } = useSocialNotifications();
  const [showNutriSocialPopup, setShowNutriSocialPopup] = useState(false);
  const [popupCount, setPopupCount] = useState(0);
  const previousCountRef = useRef(0);

  const isActive = (path) => location.pathname === path;

  const handleLogout = () => {
    clearNutribotSessionData();
    navigate('/login');
  };

  useEffect(() => {
    const previous = Number(previousCountRef.current || 0);
    const current = Number(pendingSocialNotificationCount || 0);
    previousCountRef.current = current;

    if (current > previous && current > 0) {
      setPopupCount(current);
      setShowNutriSocialPopup(true);

      const timeout = setTimeout(() => {
        setShowNutriSocialPopup(false);
      }, 5000);

      return () => clearTimeout(timeout);
    }

    if (current === 0) {
      setShowNutriSocialPopup(false);
      setPopupCount(0);
    }

    return undefined;
  }, [pendingSocialNotificationCount]);

  return (
    <div className="sidebar">
      <div className="sidebar-logo">
        <span className="sidebar-logo-text">NutrIQ</span>
      </div>
      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isNutriSocial = item.path === '/nutrisocial';
          const count = isNutriSocial ? pendingSocialNotificationCount : 0;

          return (
            <button
              key={item.path}
              className={`sidebar-item ${isActive(item.path) ? 'active' : ''} ${isNutriSocial ? 'sidebar-item-nutrisocial' : ''}`}
              onClick={() => navigate(item.path)}
              title={`${item.label} (${item.shortcut})`}
              aria-keyshortcuts={item.shortcut}
            >
              <Icon className="sidebar-item-icon" />
              <span className="sidebar-item-label">
                {item.label}
                {count > 0 && (
                  <span className="sidebar-nutrisocial-badge">
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </span>
              <span className="sidebar-item-kbd" aria-hidden="true">{item.shortcut}</span>
              <ChevronRight className="sidebar-item-arrow" />
              {isNutriSocial && showNutriSocialPopup && (
                <span className="sidebar-nutrisocial-popup" role="status" aria-live="polite">
                  {popupCount > 1
                    ? `${popupCount} convites novos`
                    : '1 convite novo'}
                </span>
              )}
            </button>
          );
        })}
      </nav>
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
