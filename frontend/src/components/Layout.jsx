// src/components/Layout.jsx
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import { MAIN_NAV_ITEMS } from '../config/navigation';
import '../styles/layout.css';

export default function Layout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();

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

      const match = MAIN_NAV_ITEMS.find((item) => item.shortcutKey === event.key);
      if (!match || match.path === location.pathname) {
        return;
      }

      event.preventDefault();
      navigate(match.path);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [location.pathname, navigate]);

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