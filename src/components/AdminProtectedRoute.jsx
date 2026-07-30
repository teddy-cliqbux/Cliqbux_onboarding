import { useEffect } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

const DefaultFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-cb-bg">
    <div className="w-8 h-8 border-4 border-cb-border border-t-cb-accent rounded-full animate-spin" />
  </div>
);

function StaffOnlyGate() {
  return (
    <div className="min-h-screen bg-cb-bg text-white flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-cb-surface border border-cb-border rounded-cb p-8">
        <p className="text-cb-caption text-cb-accent mb-1">Staff access only</p>
        <h1 className="font-display text-cb-title text-white mb-3">Admin tools</h1>
        <p className="text-cb-body text-gray-400 mb-6">
          Applications and Merchant Center are for Cliqbux staff with an Admin role.
          Merchants should use their magic link. If you need staff access, ask a
          Cliqbux admin to invite you.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/"
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-cb bg-cb-accent text-cb-bg text-cb-caption font-semibold"
          >
            Go home
          </Link>
          <button
            type="button"
            onClick={() => base44.auth.logout('/login')}
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-cb border border-cb-border text-cb-caption text-gray-300 hover:text-white"
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Gates /admin/* to authenticated Base44 app Users with role === 'admin'.
 * Redirects logged-out visitors to /login?from_url=… (not the Base44 editor).
 */
export default function AdminProtectedRoute() {
  const location = useLocation();
  const {
    user,
    isAuthenticated,
    isLoadingAuth,
    isLoadingPublicSettings,
    authChecked,
    authError,
    checkUserAuth,
  } = useAuth();

  useEffect(() => {
    if (!authChecked && !isLoadingAuth) {
      checkUserAuth();
    }
  }, [authChecked, isLoadingAuth, checkUserAuth]);

  if (isLoadingPublicSettings || isLoadingAuth || !authChecked) {
    return <DefaultFallback />;
  }

  if (authError?.type === 'user_not_registered') {
    return <UserNotRegisteredError />;
  }

  if (!isAuthenticated) {
    const from = location.pathname + location.search;
    return <Navigate to={`/login?from_url=${encodeURIComponent(from)}`} replace />;
  }

  if (user?.role !== 'admin') {
    return <StaffOnlyGate />;
  }

  return <Outlet />;
}
