import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokenStore, errorMessage } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = tokenStore.get();
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get('/auth/me')
      .then((res) => setUser(res.data.user))
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  async function authenticate(path, payload) {
    try {
      const res = await api.post(`/auth/${path}`, payload);
      tokenStore.set(res.data.token);
      setUser(res.data.user);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  }

  const value = useMemo(
    () => ({
      user,
      loading,
      login: (payload) => authenticate('login', payload),
      register: (payload) => authenticate('register', payload),
      logout: () => {
        tokenStore.clear();
        setUser(null);
      },
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
