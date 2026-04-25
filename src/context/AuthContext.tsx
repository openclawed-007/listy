import React, { useEffect, useState } from "react";
import { 
  onAuthStateChanged, 
  signInWithPopup, 
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => Boolean(auth));

  useEffect(() => {
    if (!auth) return undefined;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const login = async () => {
    if (!auth || !googleProvider) {
      throw new Error("Firebase credentials are not configured yet.");
    }

    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
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
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
