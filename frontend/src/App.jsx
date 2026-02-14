import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import ChatWidget from './components/ChatWidget';
import ProtectedRoute from './components/ProtectedRoute';
import PublicOnlyRoute from './components/PublicOnlyRoute';
import { PRIVATE_PATHS } from './config/navigation';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import BotOnboarding from './pages/BotOnboarding';
import MealPlan from './pages/MealPlan';
import Recipes from './pages/Recipes';
import Shopping from './pages/Shopping';
import Progress from './pages/Progress';
import Profile from './pages/Profile';
import NutriSocial from './pages/NutriSocial';
import Nutritionist from './pages/Nutritionist';
import './styles/global.css';

function AppRoutes() {
  const location = useLocation();

  const privateElements = {
    '/dashboard': <Dashboard />,
    '/meal-plan': <MealPlan />,
    '/recipes': <Recipes />,
    '/shopping': <Shopping />,
    '/progress': <Progress />,
    '/profile': <Profile />,
    '/nutrisocial': <NutriSocial />,
    '/nutritionist': <Nutritionist />,
  };

  return (
    <Routes location={location} key={location.pathname}>
      <Route path="/" element={<Navigate to="/login" />} />
      <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
      <Route path="/register" element={<PublicOnlyRoute><Register /></PublicOnlyRoute>} />
      <Route path="/welcome-bot" element={<BotOnboarding />} />

      {PRIVATE_PATHS.map((path) => (
        <Route
          key={path}
          path={path}
          element={(
            <ProtectedRoute requiredRole={path === '/nutritionist' ? 'nutritionist' : undefined}>
              {privateElements[path]}
            </ProtectedRoute>
          )}
        />
      ))}

      <Route path="*" element={<Navigate to="/dashboard" />} />
    </Routes>
  );
}

function App() {

  return (
    <BrowserRouter>
      <AppRoutes />
      <ChatWidget />
    </BrowserRouter>
  );
}

export default App;
