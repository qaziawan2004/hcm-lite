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

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    return data;
  };
  const setup = async (body) => {
    const { data } = await api.post('/auth/setup', body);
    return data;
  };
  const completeLogin = async (challengeId, code) => {
    const { data } = await api.post('/auth/otp/verify', { challengeId, code });
    localStorage.setItem('hcm_token', data.token);
    await loadSession();
    return data.user;
  };
  const logout = () => { localStorage.removeItem('hcm_token'); setUser(null); setCompany(null); };

  return <Ctx.Provider value={{ user, setUser, company, setCompany, loading, login, setup, completeLogin, logout, refresh: loadSession }}>{children}</Ctx.Provider>;
}
