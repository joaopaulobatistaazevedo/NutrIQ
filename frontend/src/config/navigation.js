import {
  LayoutDashboard,
  CalendarDays,
  BookOpen,
  ShoppingCart,
  BarChart3,
  User,
} from 'lucide-react';

export const MAIN_NAV_ITEMS = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', shortcut: 'Alt+1', shortcutKey: '1' },
  { path: '/meal-plan', icon: CalendarDays, label: 'Plano Alimentar', shortcut: 'Alt+2', shortcutKey: '2' },
  { path: '/recipes', icon: BookOpen, label: 'Receitas', shortcut: 'Alt+3', shortcutKey: '3' },
  { path: '/shopping', icon: ShoppingCart, label: 'Lista de Compras', shortcut: 'Alt+4', shortcutKey: '4' },
  { path: '/progress', icon: BarChart3, label: 'Progresso', shortcut: 'Alt+5', shortcutKey: '5' },
  { path: '/profile', icon: User, label: 'Perfil', shortcut: 'Alt+6', shortcutKey: '6' },
];

export const PRIVATE_PATHS = MAIN_NAV_ITEMS.map((item) => item.path);

export const AUTH_REDIRECT_PATH = '/dashboard';
