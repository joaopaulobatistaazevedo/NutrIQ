import { Navigate, useLocation } from 'react-router-dom';
import { getUserRole, isAuthenticated } from '../utils/authSession';

export default function ProtectedRoute({ children, requiredRole }) {
  const location = useLocation();

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (requiredRole) {
    const role = getUserRole();
    if (role !== requiredRole) {
      return <Navigate to={role === 'nutritionist' ? '/nutritionist' : '/dashboard'} replace />;
    }
  }

  return children;
}
