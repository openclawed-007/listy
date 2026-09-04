import React from "react";
import { useAuth } from "../context/useAuth";

interface GoogleSignInButtonProps {
  className?: string;
  label?: string;
}

/**
 * The single "Continue with Google" action used by both the login card and the
 * marketing landing page, so error handling and busy state stay consistent.
 */
const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({
  className = "login-button",
  label = "Continue with Google",
}) => {
  const { login } = useAuth();
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  return (
    <>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button
        onClick={async () => {
          setError("");
          setBusy(true);
          try {
            await login();
          } catch (err) {
            setError(
              err instanceof Error
                ? err.message
                : "Unable to sign in right now. Please try again.",
            );
          } finally {
            setBusy(false);
          }
        }}
        className={className}
        type="button"
        disabled={busy}
        aria-busy={busy}
      >
        <img
          src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
          alt=""
          aria-hidden="true"
        />
        {busy ? "Signing in..." : label}
      </button>
    </>
  );
};

export default GoogleSignInButton;
