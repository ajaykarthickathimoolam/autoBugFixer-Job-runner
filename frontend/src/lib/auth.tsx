import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, clearSession, getPageAccess, getToken, getUsername, setSession } from './api';
import type { PageKey } from './types';

interface AuthContextValue {
  token: string | null;
  username: string | null;
  pageAccess: PageKey[] | null;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(getToken());
  const [username, setUsername] = useState<string | null>(getUsername());
  const [pageAccess, setPageAccess] = useState<PageKey[] | null>(getPageAccess());

  // Page access is cached at login time; refresh it on load so an admin's later change (or a
  // newly added page) shows up without forcing a re-login. A 401 here is already handled by the
  // request() helper (clears session, redirects to /login); any other failure just keeps the
  // cached values for this load.
  useEffect(() => {
    const currentToken = getToken();
    if (!currentToken) return;
    api
        .me()
        .then((res) => {
          setSession(currentToken, res.username, res.pageAccess);
          setUsername(res.username);
          setPageAccess(res.pageAccess);
        })
        .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applySession(res: { token: string; username: string; pageAccess: PageKey[] }) {
    setSession(res.token, res.username, res.pageAccess);
    setToken(res.token);
    setUsername(res.username);
    setPageAccess(res.pageAccess);
  }

  async function login(usernameInput: string, password: string) {
    applySession(await api.login(usernameInput, password));
  }

  async function register(usernameInput: string, password: string) {
    applySession(await api.register(usernameInput, password));
  }

  function logout() {
    clearSession();
    setToken(null);
    setUsername(null);
    setPageAccess(null);
  }

  return (
      <AuthContext.Provider value={{ token, username, pageAccess, login, register, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
