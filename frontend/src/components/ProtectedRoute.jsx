import { Navigate, useLocation } from 'react-router-dom';
import { getUserRole, isAuthenticated } from '../utils/authSession';

export default function ProtectedRoute({ children, requiredRole }) {
  const location = useLocation();

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const role = getUserRole();

  if (requiredRole) {
    if (role !== requiredRole) {
      return <Navigate to={role === 'nutritionist' ? '/nutritionist' : '/dashboard'} replace />;
    }
  } else if (role === 'nutritionist' && location.pathname !== '/nutrisocial') {
    return <Navigate to="/nutritionist" replace />;
  }

  return children;
}
