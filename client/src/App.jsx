import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import DashboardLayout from './layouts/DashboardLayout.jsx';
import { Loader } from './components/ui.jsx';
import Login from './features/Login.jsx';
import Dashboard from './features/Dashboard.jsx';
import Company from './features/Company.jsx';
import Employees from './features/Employees.jsx';
import Attendance from './features/Attendance.jsx';
import Leaves from './features/Leaves.jsx';
import Salary from './features/Salary.jsx';
import Payroll from './features/Payroll.jsx';
import Payslips from './features/Payslips.jsx';
import Announcements from './features/Announcements.jsx';
import Notifications from './features/Notifications.jsx';
import AuditLogs from './features/AuditLogs.jsx';
import Profile from './features/Profile.jsx';

function Protected({ roles, children }) {
  const { user, loading } = useAuth();
  if (loading) return <Loader />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <div className="card"><h2>No access</h2><p className="muted">Your role ({user.role}) cannot open this page.</p></div>;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <Loader />;
  const staff = ['admin', 'hr'];
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route element={<Protected><DashboardLayout /></Protected>}>
        <Route index element={<Dashboard />} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="leaves" element={<Leaves />} />
        <Route path="payslips" element={<Payslips />} />
        <Route path="announcements" element={<Announcements />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="profile" element={<Profile />} />
        <Route path="employees" element={<Protected roles={staff}><Employees /></Protected>} />
        <Route path="salary" element={<Protected roles={staff}><Salary /></Protected>} />
        <Route path="payroll" element={<Protected roles={staff}><Payroll /></Protected>} />
        <Route path="company" element={<Protected roles={['admin']}><Company /></Protected>} />
        <Route path="audit" element={<Protected roles={['admin']}><AuditLogs /></Protected>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
