import React, { Suspense, lazy } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { useAuth } from "./context/useAuth";
import ProtectedRoute from "./components/ProtectedRoute";
import './App.css';

const ShoppingList = lazy(() => import("./components/ShoppingList"));
const Login = lazy(() => import("./components/Login"));

const AppLoader: React.FC = () => (
  <div className="loading-screen">
    <div className="loading-spinner" />
  </div>
);

const AuthRedirect: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const requestedRedirect = new URLSearchParams(location.search).get("redirect") || "/";
  const redirect = requestedRedirect.startsWith("/") ? requestedRedirect : "/";

  if (loading) return <AppLoader />;
  if (user) return <Navigate to={redirect} replace />;
  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <Router>
        <Suspense fallback={<AppLoader />}>
          <Routes>
            <Route
              path="/login"
              element={
                <AuthRedirect>
                  <Login />
                </AuthRedirect>
              }
            />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <ShoppingList />
                </ProtectedRoute>
              }
            />
            <Route
              path="/import/:shareId"
              element={
                <ProtectedRoute>
                  <ShoppingList />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </Suspense>
      </Router>
    </AuthProvider>
  );
};

export default App;
