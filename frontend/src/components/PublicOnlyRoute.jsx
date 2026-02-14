import { Navigate } from 'react-router-dom';
import { AUTH_REDIRECT_PATH } from '../config/navigation';
import { isAuthenticated } from '../utils/authSession';

export default function PublicOnlyRoute({ children }) {
  if (isAuthenticated()) {
    return <Navigate to={AUTH_REDIRECT_PATH} replace />;
  }

  return children;
}
