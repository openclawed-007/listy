import { createContext } from "react";
import type { User } from "firebase/auth";

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  authError?: string;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
