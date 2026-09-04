import React, { Suspense, lazy } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { PreferencesProvider } from "./context/PreferencesContext";
import { useAuth } from "./context/useAuth";
import ProtectedRoute from "./components/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import "./App.css";
import "./styles/auth.css";
import "./styles/dialogs-and-sharing.css";
import "./styles/responsive-and-themes.css";

const ShoppingList = lazy(() => import("./components/ShoppingList"));
const Landing = lazy(() => import("./components/Landing"));
const Login = lazy(() => import("./components/Login"));
const GuestList = lazy(() => import("./components/GuestList"));
const PublicSharedList = lazy(() => import("./components/PublicSharedList"));
const JoinShare = lazy(() => import("./components/JoinShare"));
const NotFound = lazy(() => import("./components/NotFound"));
const PrivacyPage = lazy(() =>
  import("./components/LegalPage").then((m) => ({ default: m.PrivacyPage })),
);
const TermsPage = lazy(() =>
  import("./components/LegalPage").then((m) => ({ default: m.TermsPage })),
);

const AppLoader: React.FC = () => (
  <div className="loading-screen">
    <div className="loading-spinner" />
  </div>
);

function getSafeRedirectPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

const AuthRedirect: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const redirect = getSafeRedirectPath(
    new URLSearchParams(location.search).get("redirect"),
  );

  if (loading) return <AppLoader />;
  if (user) return <Navigate to={redirect} replace />;
  return <>{children}</>;
};

/**
 * The root URL is the marketing front door for visitors and the actual list
 * for account holders. Rendering the landing page here (rather than bouncing
 * to /login) means search engines and shared links land on real content.
 */
export const Home: React.FC = () => {
  const { user, loading } = useAuth();
  if (loading) return <AppLoader />;
  if (user && !user.isAnonymous) return <ShoppingList />;
  return <Landing />;
};

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <PreferencesProvider>
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
                <Route path="/" element={<Home />} />
                <Route
                  path="/import/:shareId"
                  element={
                    <ProtectedRoute>
                      <ShoppingList />
                    </ProtectedRoute>
                  }
                />
                <Route path="/guest" element={<GuestList />} />
                <Route path="/join" element={<JoinShare />} />
                <Route path="/c/:code" element={<PublicSharedList />} />
                <Route path="/share/:shareId" element={<PublicSharedList />} />
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="/terms" element={<TermsPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </Router>
        </PreferencesProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
};

export default App;
