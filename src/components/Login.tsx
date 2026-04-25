import React from "react";
import { useAuth } from "../context/useAuth";
import { isFirebaseConfigured } from "../firebase";
import { ShoppingBag, AlertTriangle } from "lucide-react";

const Login: React.FC = () => {
  const { login } = useAuth();
  const [loginError, setLoginError] = React.useState("");
  const [isLoggingIn, setIsLoggingIn] = React.useState(false);

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-logo">
          <ShoppingBag size={28} strokeWidth={2} />
        </div>

        <h1 className="login-title">CartLink</h1>
        <p className="login-subtitle">
          Your simple, beautiful shopping companion.
        </p>

        {!isFirebaseConfigured ? (
          <div className="setup-warning">
            <AlertTriangle size={20} className="warning-icon" />
            <div>
              <strong>Setup required</strong>
              <p>
                Update <code>src/firebase.ts</code> with your Firebase
                credentials to enable sign-in.
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
            <p className="recaptcha-notice">
              Protected by reCAPTCHA and the Google{" "}
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
              >
                Privacy Policy
              </a>{" "}
              and{" "}
              <a
                href="https://policies.google.com/terms"
                target="_blank"
                rel="noopener noreferrer"
              >
                Terms of Service
              </a>
              .
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default Login;
