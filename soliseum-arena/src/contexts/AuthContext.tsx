/**
 * Auth context for Soliseum API - wallet sign-in flow.
 * Flow: nonce -> sign with wallet -> verify -> store token.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import { fetchAuthNonce, fetchAuthVerify } from "@/lib/api";

const AUTH_TOKEN_KEY = "soliseum_auth_token";
const AUTH_EXPIRY_KEY = "soliseum_auth_expiry";

interface AuthContextValue {
  token: string | null;
  isLoading: boolean;
  error: string | null;
  login: () => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { publicKey, signMessage, connected } = useWallet();
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const stored = localStorage.getItem(AUTH_TOKEN_KEY);
    const expiry = localStorage.getItem(AUTH_EXPIRY_KEY);
    if (stored && expiry && Date.now() < parseInt(expiry, 10)) return stored;
    return null;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const logout = useCallback(() => {
    setToken(null);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_EXPIRY_KEY);
    setError(null);
  }, []);

  // Clear token when wallet disconnects
  useEffect(() => {
    if (!connected) logout();
  }, [connected, logout]);

  const login = useCallback(async (): Promise<boolean> => {
    if (!publicKey || !signMessage) {
      setError("Wallet not connected or does not support message signing");
      return false;
    }
    setIsLoading(true);
    setError(null);
    try {
      const walletAddress = publicKey.toBase58();
      const { nonce } = await fetchAuthNonce(walletAddress);
      const messageBytes = new TextEncoder().encode(nonce);
      const signatureBytes = await signMessage(messageBytes);
      const signature = bs58.encode(signatureBytes);
      const res = await fetchAuthVerify(walletAddress, signature, nonce);
      if (!res.ok || !res.token) {
        setError(res.error ?? "Verification failed");
        return false;
      }
      const expiresAt = Date.now() + (res.expiresIn ?? 24 * 60 * 60 * 1000);
      setToken(res.token);
      localStorage.setItem(AUTH_TOKEN_KEY, res.token);
      localStorage.setItem(AUTH_EXPIRY_KEY, String(expiresAt));
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, signMessage]);

  const value: AuthContextValue = {
    token,
    isLoading,
    error,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
