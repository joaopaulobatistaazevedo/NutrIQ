import {
  LayoutDashboard,
  CalendarDays,
  BookOpen,
  ShoppingCart,
  User,
  Users,
  BriefcaseMedical,
} from 'lucide-react';

const USER_NAV_ITEMS = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', shortcut: 'Alt+1', shortcutKey: '1' },
  { path: '/meal-plan', icon: CalendarDays, label: 'Plano Alimentar', shortcut: 'Alt+2', shortcutKey: '2' },
  { path: '/recipes', icon: BookOpen, label: 'Receitas', shortcut: 'Alt+3', shortcutKey: '3' },
  { path: '/shopping', icon: ShoppingCart, label: 'Lista de Compras', shortcut: 'Alt+4', shortcutKey: '4' },
  { path: '/profile', icon: User, label: 'Perfil', shortcut: 'Alt+5', shortcutKey: '5' },
  { path: '/nutrisocial', icon: Users, label: 'NutriSocial', shortcut: 'Alt+6', shortcutKey: '6' },
];

const NUTRITIONIST_NAV_ITEMS = [
  { path: '/nutritionist', icon: BriefcaseMedical, label: 'Painel Nutri', shortcut: 'Alt+1', shortcutKey: '1' },
];

export function getMainNavItems(role = 'user') {
  return role === 'nutritionist' ? NUTRITIONIST_NAV_ITEMS : USER_NAV_ITEMS;
}

export const MAIN_NAV_ITEMS = USER_NAV_ITEMS;

export const PRIVATE_PATHS = [
  ...USER_NAV_ITEMS.map((item) => item.path),
  '/progress',
  '/nutritionist',
];

export const AUTH_REDIRECT_PATH = '/dashboard';
