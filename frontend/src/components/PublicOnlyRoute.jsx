import { Navigate } from 'react-router-dom';
import { getUserRole, isAuthenticated } from '../utils/authSession';

export default function PublicOnlyRoute({ children }) {
  if (isAuthenticated()) {
    const role = getUserRole();
    return <Navigate to={role === 'nutritionist' ? '/nutritionist' : '/dashboard'} replace />;
  }

  return children;
}
