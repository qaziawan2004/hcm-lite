export const money = (n, cur = 'PKR') => `${cur} ${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
export const fmtDate = (s) => (s ? new Date(`${String(s).slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—');
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const monthLabel = (m) => (m ? new Date(`${m}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : '');
export const thisMonth = () => new Date().toLocaleDateString('en-CA').slice(0, 7);
export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
export const isStaff = (u) => ['admin', 'hr'].includes(u?.role);
// HR can only manage plain employees; admin manages all
export const canManage = (me, target) => me.role === 'admin' || (me.role === 'hr' && target.role === 'employee');
