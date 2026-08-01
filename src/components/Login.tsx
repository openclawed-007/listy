import React from "react";
import { useAuth } from "../context/useAuth";
import { isFirebaseConfigured } from "../firebase";
import { AlertTriangle } from "lucide-react";
import BrandMark from "./BrandMark";
import { Check, Download, Link2, ShoppingBasket } from "lucide-react";
import { useInstallPrompt } from "../hooks/useInstallPrompt";

const Login: React.FC = () => {
  const { login } = useAuth();
  const [loginError, setLoginError] = React.useState("");
  const [isLoggingIn, setIsLoggingIn] = React.useState(false);
  const { canInstall, install } = useInstallPrompt();

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-logo">
          <BrandMark className="brand-mark login-brand-mark" />
        </div>

        <h1 className="login-title">CartLink</h1>
        <p className="login-kicker">The list built for the shop</p>
        <p className="login-subtitle">
          Type naturally, find items by aisle, and keep everyone in sync.
        </p>

        <ul className="login-benefits" aria-label="Why use CartLink">
          <li><ShoppingBasket size={17} /><span><strong>Faster adding</strong> — “2 milk” understands quantity and aisle.</span></li>
          <li><Link2 size={17} /><span><strong>Simple sharing</strong> — send a link; visitors can shop without an account.</span></li>
          <li><Check size={17} /><span><strong>Reliable anywhere</strong> — real-time sync with offline support.</span></li>
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
          <>
            {loginError && (
              <p className="form-error" role="alert">
                {loginError}
              </p>
            )}
            <button
              onClick={async () => {
                setLoginError("");
                setIsLoggingIn(true);
                try {
                  await login();
                } catch (err) {
                  const message =
                    err instanceof Error
                      ? err.message
                      : "Unable to sign in right now. Please try again.";
                  setLoginError(message);
                } finally {
                  setIsLoggingIn(false);
                }
              }}
              className="login-button"
              type="button"
              disabled={isLoggingIn}
              aria-busy={isLoggingIn}
            >
              <img
                src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                alt="Google"
              />
              {isLoggingIn ? "Signing in..." : "Continue with Google"}
            </button>
            <p className="login-trust">Free to use · No adverts · Your lists stay private until you share them.</p>
            {canInstall && (
              <button className="install-button" type="button" onClick={() => void install()}>
                <Download size={17} /> Install CartLink
              </button>
            )}
            <p className="login-legal">
              Secure sign-in protected by reCAPTCHA · Google{" "}
              <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Privacy</a>
              {" · "}
              <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer">Terms</a>
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default Login;
