import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../api/client.js';
import ChatWidget from '../components/ChatWidget.jsx';

const I = {
  grid: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></>,
  clock: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
  cal: <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" /></>,
  msg: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  dollar: <><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>,
  card: <><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></>,
  brief: <><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></>,
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
};
const Icon = ({ n }) => <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{I[n]}</svg>;

const NAV = [
  ['Workspace', [['/', 'Dashboard', 'grid', ['admin', 'hr', 'employee']], ['/attendance', 'Attendance', 'clock', ['admin', 'hr', 'employee']], ['/leaves', 'Leaves', 'cal', ['admin', 'hr', 'employee']], ['/payslips', 'My payslips', 'file', ['admin', 'hr', 'employee']], ['/announcements', 'Announcements', 'msg', ['admin', 'hr', 'employee']]]],
  ['People and pay', [['/employees', 'Employees', 'users', ['admin', 'hr']], ['/salary', 'Salaries', 'dollar', ['admin', 'hr']], ['/payroll', 'Payroll', 'card', ['admin', 'hr']]]],
  ['Administration', [['/company', 'Company setup', 'brief', ['admin']], ['/audit', 'Audit logs', 'shield', ['admin']]]],
  ['Account', [['/profile', 'My profile', 'user', ['admin', 'hr', 'employee']]]],
];
const initials = (name = '') => name.trim().split(/\s+/).filter(Boolean).map((word) => word[0]).slice(0, 2).join('').toUpperCase();

export default function DashboardLayout() {
  const { user, company, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => { setOpen(false); }, [loc.pathname]);
  useEffect(() => {
    let live = true;
    const load = () => api.get('/notifications').then((r) => live && setUnread(r.data.unread)).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    window.addEventListener('notif-changed', load);
    return () => { live = false; clearInterval(t); window.removeEventListener('notif-changed', load); };
  }, [loc.pathname]);

  return (
    <div className="shell">
      <aside className={`side ${open ? 'open' : ''}`}>
        <div className="brand"><span className="logo">H</span><span>{company?.name || 'HCM Lite'}</span></div>
        <nav className="nav" aria-label="Main">
          {NAV.map(([group, links]) => {
            const items = links.filter(([, , , roles]) => roles.includes(user.role));
            return items.length ? (
              <div key={group}><div className="nav-group">{group}</div>
                {items.map(([to, label, icon]) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}><Icon n={icon} />{label}</NavLink>)}
              </div>) : null;
          })}
        </nav>
        <div className="who"><span className="avatar">{initials(user.name)}</span><div><strong>{user.name || 'Complete your profile'}</strong><br /><small>Signed in as {user.role === 'hr' ? 'HR' : user.role[0].toUpperCase() + user.role.slice(1)}</small></div></div>
      </aside>
      <div className="main">
        <header className="top">
          <div className="row gap"><button className="btn ghost sm menu-btn" onClick={() => setOpen(!open)} aria-label="Toggle menu">Menu</button>
            <span className="muted">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
          <div className="row gap">
            <button className="bell" onClick={() => nav('/notifications')} aria-label={`Notifications, ${unread} unread`}>🔔{unread > 0 && <i>{unread}</i>}</button>
            <button className="btn ghost sm" onClick={() => { logout(); nav('/login'); }}>Sign out</button>
          </div>
        </header>
        <main className="content">
          {user.mustChangePassword && <div className="notice">You are using a temporary password. <a href="/profile">Change it now</a>.</div>}
          <Outlet />
        </main>
      </div>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <ChatWidget />
    </div>
  );
}
