import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api } from '../api/client';
import type { ConsentInput, SessionUser } from '../api/types';

type AuthStatus = 'probing' | 'guest' | 'authenticated';

interface AuthContextValue {
  status: AuthStatus;
  user: SessionUser | null;
  login: (username: string, password: string) => Promise<SessionUser>;
  register: (username: string, password: string, consent: ConsentInput) => Promise<SessionUser>;
  logout: () => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('probing');
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    let active = true;
    api
      .checkSession()
      .then((session) => {
        if (!active) return;
        setUser({ username: session.username, role: session.role });
        setStatus('authenticated');
      })
      .catch(() => {
        if (!active) return;
        setUser(null);
        setStatus('guest');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const expire = () => {
      setUser(null);
      setStatus('guest');
    };
    window.addEventListener('sdl:auth-expired', expire);
    return () => window.removeEventListener('sdl:auth-expired', expire);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const response = await api.login(username, password);
    api.setAccess(response.access);
    const session = { username: response.username, role: response.role };
    setUser(session);
    setStatus('authenticated');
    return session;
  }, []);

  const register = useCallback(
    async (username: string, password: string, consent: ConsentInput) => {
      const response = await api.register(username, password, consent);
      api.setAccess(response.access);
      const session = { username: response.username, role: response.role };
      setUser(session);
      setStatus('authenticated');
      return session;
    },
    [],
  );

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
    setStatus('guest');
  }, []);

  const deleteAccount = useCallback(async (password: string) => {
    await api.deleteAccount(password);
    api.setAccess(null);
    setUser(null);
    setStatus('guest');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, register, logout, deleteAccount }),
    [status, user, login, register, logout, deleteAccount],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return value;
}
