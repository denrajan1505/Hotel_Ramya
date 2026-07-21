import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Loader from '../common/Loader';

export default function ProtectedRoute({ children, permission }) {
  const { user, loading, can } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-primary-950">
        <Loader label="Loading Hotel Ramyas Credit Control…" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (permission && !can(permission)) return <Navigate to="/dashboard" replace />;

  return children;
}
