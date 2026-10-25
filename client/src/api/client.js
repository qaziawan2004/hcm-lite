import axios from 'axios';

const api = axios.create({ baseURL: `${import.meta.env.VITE_API_URL || ''}/api` });

api.interceptors.request.use((c) => {
  const t = localStorage.getItem('hcm_token');
  if (t) c.headers.Authorization = `Bearer ${t}`;
  return c;
});
api.interceptors.response.use((r) => r, (e) => {
  const url = e.config?.url || '';
  if (e.response?.status === 401 && !url.includes('/auth/login') && !url.includes('/auth/setup')) {
    localStorage.removeItem('hcm_token');
    if (!location.pathname.startsWith('/login')) location.href = '/login';
  }
  return Promise.reject(e);
});

export const errMsg = (e) => e?.response?.data?.message || e?.message || 'Something went wrong.';

export async function downloadPayslip(id, filename) {
  const res = await api.get(`/payroll/${id}/payslip`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
export default api;
