import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ChatWidget from './components/ChatWidget';
import ProtectedRoute from './components/ProtectedRoute';
import PublicOnlyRoute from './components/PublicOnlyRoute';
import { PRIVATE_PATHS } from './config/navigation';
import './styles/global.css';

const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const BotOnboarding = lazy(() => import('./pages/BotOnboarding'));
const MealPlan = lazy(() => import('./pages/MealPlan'));
const Recipes = lazy(() => import('./pages/Recipes'));
const Shopping = lazy(() => import('./pages/Shopping'));
const Progress = lazy(() => import('./pages/Progress'));
const Profile = lazy(() => import('./pages/Profile'));
const NutriSocial = lazy(() => import('./pages/NutriSocial'));
const Nutritionist = lazy(() => import('./pages/Nutritionist'));

function App() {
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
    <BrowserRouter>
      <Suspense
        fallback={(
          <div className="app-route-loading" role="status" aria-live="polite">
            <div className="app-route-loading-dot" />
            <span>A carregar...</span>
          </div>
        )}
      >
        <Routes>
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
      </Suspense>
      <ChatWidget />
    </BrowserRouter>
  );
}

export default App;
