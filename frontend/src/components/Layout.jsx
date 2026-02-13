// src/components/Layout.jsx
import Sidebar from './Sidebar';
import '../styles/layout.css';

export default function Layout({ children }) {
  return (
    <div className="layout">
      <Sidebar />
      <main className="layout-content">
        {children}
      </main>
    </div>
  );
}