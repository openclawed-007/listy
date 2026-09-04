import { createContext } from "react";
import type { User } from "firebase/auth";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: () => Promise<void>;
  /**
   * Silent Firebase Anonymous Auth. Used only by the public share page so a
   * QR/link visitor can edit when the owner allows it; anonymous sessions are
   * treated as signed-out everywhere else in the app.
   */
  loginAnonymously: () => Promise<void>;
  logout: () => Promise<void>;
  authError?: string;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
