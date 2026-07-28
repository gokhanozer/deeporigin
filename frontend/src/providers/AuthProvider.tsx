'use client';

/**
 * Authentication context.
 *
 * Holds the signed-in user for the whole app and exposes sign-in, sign-up and
 * sign-out actions. Any component can read auth state via {@link useAuth}
 * without prop-drilling.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getCurrentUser, login as loginRequest, register as registerRequest } from '../lib/api/auth';
import { clearStoredToken, getStoredToken, setStoredToken } from '../lib/token-storage';
import type { User } from '../lib/types';

/** Everything the auth context exposes. */
interface AuthContextValue {
  /** The signed-in user, or `null` when anonymous. */
  user: User | null;
  /** `true` during the initial session restore, before `user` is meaningful. */
  initializing: boolean;
  /** Convenience flag. */
  isAuthenticated: boolean;
  /** Signs in and stores the token. Throws `ApiError` on failure. */
  signIn: (email: string, password: string) => Promise<void>;
  /** Registers, signs in and stores the token. Throws `ApiError` on failure. */
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  /** Clears the session. */
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Provides authentication state to the tree below it.
 *
 * On mount it restores a session from the stored token by calling `/auth/me`.
 * Validating server-side (rather than trusting the token's presence) means an
 * expired or revoked token signs the user out immediately instead of letting
 * the UI show a logged-in shell whose every request then fails.
 *
 * @param props.children Subtree that needs auth state.
 */
export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setInitializing(false);
      return;
    }

    let cancelled = false;
    getCurrentUser()
      .then((restored) => {
        if (!cancelled) setUser(restored);
      })
      .catch(() => {
        // The token is invalid or expired — discard it.
        if (!cancelled) {
          clearStoredToken();
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) setInitializing(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const response = await loginRequest(email, password);
    setStoredToken(response.accessToken);
    setUser(response.user);
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName?: string) => {
    const response = await registerRequest(email, password, displayName);
    setStoredToken(response.accessToken);
    setUser(response.user);
  }, []);

  const signOut = useCallback(() => {
    clearStoredToken();
    setUser(null);
  }, []);

  // Memoised so consumers do not re-render on every provider render.
  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      initializing,
      isAuthenticated: user !== null,
      signIn,
      signUp,
      signOut,
    }),
    [user, initializing, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Reads the auth context.
 *
 * @returns The current auth state and actions.
 * @throws {Error} When called outside an {@link AuthProvider} — which is a
 *         programming error worth failing loudly on, rather than silently
 *         returning a "logged out" default.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }
  return context;
}
