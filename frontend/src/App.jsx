import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import BotOnboarding from './pages/BotOnboarding';
import MealPlan from './pages/MealPlan';
import ChatWidget from './components/ChatWidget';
import './styles/global.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/welcome-bot" element={<BotOnboarding />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/meal-plan" element={<MealPlan />} />
      </Routes>
      <ChatWidget />
    </BrowserRouter>
  );
}

export default App;
