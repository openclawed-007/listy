import React, { useEffect, useState } from "react";
import { 
  getRedirectResult,
  onAuthStateChanged, 
  signInWithPopup, 
  signInWithRedirect,
  signOut,
  type AuthError,
  type User,
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { AuthContext } from "./AuthContext.shared";

function getLoginErrorMessage(error: unknown): string {
  const authError = error as Partial<AuthError> | undefined;
  const code = authError?.code ?? "";
  if (code === "auth/popup-closed-by-user") return "Sign-in popup was closed before completing login.";
  if (code === "auth/cancelled-popup-request") return "Another sign-in attempt is in progress.";
  if (code === "auth/popup-blocked") return "Browser blocked the sign-in popup. Allow popups and try again.";
  return "Unable to sign in right now. Please try again.";
}

const POPUP_FALLBACK_CODES = new Set([
  "auth/popup-blocked",
  "auth/operation-not-supported-in-this-environment",
]);

/**
 * Installed PWAs (notably iOS) report a popup the OS bounced as
 * "closed by user", so only there do we treat that as a reason to fall back
 * to redirect sign-in. In a normal tab closing the popup means "not now" and
 * must not yank the user off to Google.
 */
function isStandaloneDisplay(): boolean {
  try {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

function shouldFallBackToRedirect(code: string): boolean {
  if (POPUP_FALLBACK_CODES.has(code)) return true;
  return code === "auth/popup-closed-by-user" && isStandaloneDisplay();
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => Boolean(auth));
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    if (!auth) return undefined;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!auth) return undefined;
    // Completes the PWA/mobile redirect flow and surfaces cancel/fail errors
    // that onAuthStateChanged does not report.
    void getRedirectResult(auth).catch((error) => {
      console.error("Redirect Login Error:", error);
      setAuthError(getLoginErrorMessage(error));
    });
  }, []);

  const login = async () => {
    if (!auth || !googleProvider) {
      throw new Error("Firebase credentials are not configured yet.");
    }

    setAuthError("");
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      const code = (error as Partial<AuthError> | undefined)?.code ?? "";
      if (shouldFallBackToRedirect(code)) {
        // Popups are unreliable in installed PWAs and some mobile browsers;
        // fall back to a full-page redirect sign-in.
        try {
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (redirectError) {
          console.error("Redirect Login Error:", redirectError);
          throw new Error(getLoginErrorMessage(redirectError));
        }
      }
      console.error("Login Error:", error);
      throw new Error(getLoginErrorMessage(error));
    }
  };

  const logout = async () => {
    if (!auth) return;

    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout Error:", error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, authError }}>
      {children}
    </AuthContext.Provider>
  );
};
