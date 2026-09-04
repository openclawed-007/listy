import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/useAuth";

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
      </div>
    );
  }

  // Anonymous users (auto-signed-in on a public shared page so they can edit a
  // QR/link list) are not real account holders. The personal list and import
  // flows require a full Google sign-in, so treat anonymous users as logged out.
  if (!user || user.isAnonymous) {
    // Dev / test server only: land on the guest list so features can be tried
    // without signing in. Production still requires login for protected routes.
    if (import.meta.env.DEV) {
      return <Navigate to="/guest" replace />;
    }
    // Only attach ?redirect= when returning somewhere other than home —
    // avoids ugly /login?redirect=%2F for the default case.
    const next = `${location.pathname}${location.search}`;
    if (!next || next === "/") {
      return <Navigate to="/login" replace />;
    }
    return (
      <Navigate to={`/login?redirect=${encodeURIComponent(next)}`} replace />
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
