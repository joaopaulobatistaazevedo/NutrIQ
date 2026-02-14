import { useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import { getMainNavItems } from '../config/navigation';
import { getUserRole } from '../utils/authSession';
import '../styles/layout.css';

export default function Layout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const role = getUserRole();
  const navItems = useMemo(() => getMainNavItems(role), [role]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }

      const target = event.target;
      const isTypingField =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      if (isTypingField) {
        return;
      }

      const match = navItems.find((item) => item.shortcutKey === event.key);
      if (!match || match.path === location.pathname) {
        return;
      }

      event.preventDefault();
      navigate(match.path);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [location.pathname, navigate, navItems]);

  return (
    <div className="layout">
      <a className="skip-link" href="#main-content">Saltar para conteúdo</a>
      <Sidebar />
      <main id="main-content" className="layout-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
