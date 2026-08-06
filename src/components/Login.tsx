import React from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Check,
  Download,
  Link2,
  Moon,
  ShoppingBasket,
  Sun,
} from "lucide-react";
import { useAuth } from "../context/useAuth";
import { isFirebaseConfigured } from "../firebase";
import { useDarkMode } from "../hooks/useDarkMode";
import { useInstallPrompt } from "../hooks/useInstallPrompt";
import BrandMark from "./BrandMark";

const BENEFITS = [
  {
    icon: ShoppingBasket,
    label: "Smart add",
    detail: "“2 milk” just works",
  },
  {
    icon: Link2,
    label: "Share live",
    detail: "Shop together, in sync",
  },
  {
    icon: Check,
    label: "Works offline",
    detail: "Syncs when you're back",
  },
] as const;

const GoogleLogo: React.FC = () => (
  <svg viewBox="0 0 48 48" width={20} height={20} aria-hidden="true">
    <path
      fill="#EA4335"
      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
    />
    <path
      fill="#4285F4"
      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
    />
    <path
      fill="#FBBC05"
      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
    />
    <path
      fill="#34A853"
      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
    />
  </svg>
);

const Login: React.FC = () => {
  const { login } = useAuth();
  const { dark, toggle } = useDarkMode();
  const { canInstall, install } = useInstallPrompt();
  const [loginError, setLoginError] = React.useState("");
  const [isLoggingIn, setIsLoggingIn] = React.useState(false);

  const handleLogin = async () => {
    setLoginError("");
    setIsLoggingIn(true);
    try {
      await login();
    } catch (err) {
      setLoginError(
        err instanceof Error
          ? err.message
          : "Unable to sign in right now. Please try again.",
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="login-container">
      <button
        type="button"
        className="login-theme-toggle"
        onClick={toggle}
        aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
        title={dark ? "Light mode" : "Dark mode"}
      >
        {dark ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      <div className="login-card">
        <div className="login-hero">
          <div className="login-logo" aria-hidden="true">
            <BrandMark className="brand-mark login-brand-mark" />
          </div>
          <div className="login-hero-copy">
            <p className="login-kicker">Welcome to</p>
            <h1 className="login-title">
              Cart<em>Link</em>
            </h1>
          </div>
        </div>

        <p className="login-subtitle">
          Grocery runs, minus the chaos. One smart list, sorted by aisle and
          shared with the people you shop with.
        </p>

        <ul className="login-benefits" aria-label="Why you'll like CartLink">
          {BENEFITS.map(({ icon: Icon, label, detail }) => (
            <li key={label}>
              <span className="login-benefit-icon" aria-hidden="true">
                <Icon size={16} strokeWidth={2.25} />
              </span>
              <span className="login-benefit-copy">
                <strong>{label}</strong>
                <span>{detail}</span>
              </span>
            </li>
          ))}
        </ul>

        {!isFirebaseConfigured ? (
          <div className="setup-warning">
            <AlertTriangle size={20} className="warning-icon" />
            <div>
              <strong>Setup required</strong>
              <p>
                Create <code>.env.local</code> from <code>.env.example</code>{" "}
                and add your Firebase credentials to enable sign-in.
              </p>
            </div>
          </div>
        ) : (
          <div className="login-actions">
            {loginError && (
              <p className="form-error" role="alert">
                {loginError}
              </p>
            )}

            <button
              onClick={() => void handleLogin()}
              className="login-button"
              type="button"
              disabled={isLoggingIn}
              aria-busy={isLoggingIn}
            >
              <GoogleLogo />
              {isLoggingIn ? "Signing in…" : "Continue with Google"}
            </button>

            <div className="login-divider" role="separator">
              <span>or</span>
            </div>

            <Link className="guest-button" to="/guest">
              Try it as a guest
            </Link>
            <p className="login-trust">
              No account needed to start — your list stays private on this
              device and comes with you when you sign in.
            </p>

            <div className="login-footer-links">
              {canInstall && (
                <button
                  className="install-button"
                  type="button"
                  onClick={() => void install()}
                >
                  <Download size={16} strokeWidth={2.25} />
                  Install app
                </button>
              )}
              <Link className="login-code-link" to="/join">
                Have a share code?
              </Link>
            </div>

            <p className="login-legal">
              Protected by reCAPTCHA ·{" "}
              <Link to="/privacy">Privacy</Link>
              {" · "}
              <Link to="/terms">Terms</Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;
