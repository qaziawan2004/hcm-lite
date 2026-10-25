import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import DashboardLayout from './layouts/DashboardLayout.jsx';
import { Loader } from './components/ui.jsx';

const Login = lazy(() => import('./features/Login.jsx'));
const Dashboard = lazy(() => import('./features/Dashboard.jsx'));
const Company = lazy(() => import('./features/Company.jsx'));
const Employees = lazy(() => import('./features/Employees.jsx'));
const Attendance = lazy(() => import('./features/Attendance.jsx'));
const Leaves = lazy(() => import('./features/Leaves.jsx'));
const Salary = lazy(() => import('./features/Salary.jsx'));
const Payroll = lazy(() => import('./features/Payroll.jsx'));
const Payslips = lazy(() => import('./features/Payslips.jsx'));
const Announcements = lazy(() => import('./features/Announcements.jsx'));
const Notifications = lazy(() => import('./features/Notifications.jsx'));
const AuditLogs = lazy(() => import('./features/AuditLogs.jsx'));
const Profile = lazy(() => import('./features/Profile.jsx'));

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
    <Suspense fallback={<Loader />}>
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
    </Suspense>
  );
}
