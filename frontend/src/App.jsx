import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ChatWidget from './components/ChatWidget';
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

function App() {
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
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/welcome-bot" element={<BotOnboarding />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/meal-plan" element={<MealPlan />} />
          <Route path="/recipes" element={<Recipes />} />
          <Route path="/shopping" element={<Shopping />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="*" element={<Navigate to="/dashboard" />} />
        </Routes>
      </Suspense>
      <ChatWidget />
    </BrowserRouter>
  );
}

export default App;
