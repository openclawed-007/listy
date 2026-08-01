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
    detail: "“2 milk” picks quantity and aisle",
  },
  {
    icon: Link2,
    label: "Share live",
    detail: "Code, link or QR — shop together",
  },
  {
    icon: Check,
    label: "Works offline",
    detail: "Syncs when you’re back online",
  },
] as const;

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
        <div className="login-logo" aria-hidden="true">
          <BrandMark className="brand-mark login-brand-mark" />
        </div>

        <p className="login-kicker">Shopping lists, simplified</p>
        <h1 className="login-title">
          Cart<em>Link</em>
        </h1>
        <p className="login-subtitle">
          One smart field. Sorted by aisle. Shared in real time.
        </p>

        <ul className="login-benefits" aria-label="Why use CartLink">
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
              <img
                src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                alt=""
                width={20}
                height={20}
              />
              {isLoggingIn ? "Signing in…" : "Continue with Google"}
            </button>

            <div className="login-divider" role="separator">
              <span>or start without an account</span>
            </div>

            <Link className="guest-button" to="/guest">
              Continue as guest
            </Link>
            <p className="login-trust">
              Private on this device. Sign in later — your list comes with you.
            </p>

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

            <p className="login-code-link">
              <Link to="/join">Have a share code?</Link>
            </p>

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
