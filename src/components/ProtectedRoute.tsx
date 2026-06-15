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
  // flows require a full Google sign-in, so treat anonymous users as logged out
  // here and send them to the login screen.
  if (!user || user.isAnonymous) {
    const redirect = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?redirect=${redirect}`} />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
