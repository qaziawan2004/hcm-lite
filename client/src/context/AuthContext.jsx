import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from '../api/client.js';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(!!localStorage.getItem('hcm_token'));

  const loadSession = useCallback(async () => {
    try {
      const [me, co] = await Promise.all([api.get('/auth/me'), api.get('/company')]);
      setUser(me.data.user); setCompany(co.data.company);
    } catch { localStorage.removeItem('hcm_token'); setUser(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (localStorage.getItem('hcm_token')) loadSession(); }, [loadSession]);

  const start = async (path, body) => {
    const { data } = await api.post(path, body);
    localStorage.setItem('hcm_token', data.token);
    await loadSession();
    return data.user;
  };
  const login = (email, password) => start('/auth/login', { email, password });
  const setup = (body) => start('/auth/setup', body);
  const logout = () => { localStorage.removeItem('hcm_token'); setUser(null); setCompany(null); };

  return <Ctx.Provider value={{ user, setUser, company, setCompany, loading, login, setup, logout, refresh: loadSession }}>{children}</Ctx.Provider>;
}
