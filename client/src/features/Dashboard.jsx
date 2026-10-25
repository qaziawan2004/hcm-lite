import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts';
import api, { errMsg, downloadPayslip } from '../api/client.js';
import useApi from '../utils/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Loader, Stat, useToast, Badge } from '../components/ui.jsx';
import { fmtTime, fmtDate, money, monthLabel, cap } from '../utils/format.js';

const COLORS = ['#14524f', '#f0b429', '#1f5f99', '#b3261e', '#7a9e9b', '#8e5ea2'];

export function CheckInCard({ onChange }) {
  const toast = useToast();
  const { data, reload } = useApi('/attendance/today');
  const [now, setNow] = useState(new Date());
  const [busy, setBusy] = useState(false);
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const rec = data?.record;
  const act = async (path) => {
    setBusy(true);
    try { await api.post(`/attendance/${path}`); toast(path === 'check-in' ? 'Checked in.' : 'Checked out. See you tomorrow.'); await reload(); onChange?.(); }
    catch (e) { toast(errMsg(e), 'err'); } finally { setBusy(false); }
  };
  return (
    <div className="clock">
      <div>
        <div className="time">{now.toLocaleTimeString('en-GB')}</div>
        <small>{rec ? `Checked in at ${fmtTime(rec.checkIn)}${rec.status === 'late' ? ' (late)' : ''}${rec.checkOut ? ` · out at ${fmtTime(rec.checkOut)} · ${rec.hours}h` : ''}` : 'You have not checked in yet today.'}</small>
      </div>
      {!rec && <button className="btn accent" disabled={busy} onClick={() => act('check-in')}>Check in</button>}
      {rec && !rec.checkOut && <button className="btn accent" disabled={busy} onClick={() => act('check-out')}>Check out</button>}
      {rec?.checkOut && <Badge tone="good">Day complete</Badge>}
    </div>
  );
}

function AISummary() {
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const run = async () => { setBusy(true); setErr(''); try { setText((await api.post('/ai/summary')).data.summary); } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); } };
  return (
    <div className="card ai-card">
      <div className="row between"><h2 style={{ margin: 0 }}>AI summary</h2><button className="btn sm" onClick={run} disabled={busy}>{busy ? 'Summarizing…' : text ? 'Refresh' : 'Summarize my dashboard'}</button></div>
      {err && <p className="muted">{err}</p>}
      {text && <pre>{text}</pre>}
      {!text && !err && <p className="muted" style={{ margin: '.5rem 0 0' }}>Get a short read-out of what needs your attention, based on live records.</p>}
    </div>
  );
}

function Announcements({ items }) {
  return (
    <div className="card"><div className="row between"><h2>Latest announcements</h2><Link to="/announcements">View all</Link></div>
      {items?.length ? items.map((a) => <div className="ann" key={a._id}><h3>{a.title}</h3><small>{fmtDate(a.createdAt)}</small><p style={{ margin: '.3rem 0 0' }}>{a.body}</p></div>) : <p className="muted">No announcements yet.</p>}
    </div>
  );
}

function LeaveBalance({ b }) {
  return <div className="card"><h2>Leave balance</h2>{Object.entries(b || {}).map(([k, v]) => <div className="bal" key={k}><span>{cap(k)}</span><strong>{v} days</strong></div>)}<div style={{ marginTop: '.8rem' }}><Link to="/leaves?tab=apply">Apply for leave</Link></div></div>;
}

export default function Dashboard() {
  const { user, company } = useAuth();
  const { data: d, loading, error, reload } = useApi('/dashboard');
  if (loading && !d) return <Loader />;
  if (error) return <div className="error">{error}</div>;
  if (!d) return <Loader />;
  const cur = company?.currency;
  const emp = d.role === 'admin' ? d.mine : d;
  const firstName = typeof user?.name === 'string' && user.name.trim()
    ? user.name.trim().split(/\s+/)[0]
    : 'there';

  return (
    <>
      <div className="page-head">
        <div><h1>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {firstName}</h1><p className="muted">{d.role === 'admin' ? `Company overview for ${fmtDate(d.date)}.` : 'Here is your day at a glance.'}</p></div>
        <button className="btn ghost sm" onClick={reload} disabled={loading} aria-label="Refresh dashboard data">
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <div className="grid" style={{ gap: '1.1rem' }}>
        <CheckInCard onChange={reload} />
        {d.role === 'admin' && <>
          <div className="grid g4">
            <Stat label="Active employees" value={d.totalEmployees} tone="info" />
            <Stat label="Present today" value={d.presentToday} tone="good" sub={d.weekend ? 'Weekend' : undefined} />
            <Stat label="Late today" value={d.lateToday} tone="warn" />
            <Stat label="On leave today" value={d.onLeaveToday} tone="info" />
            <Stat label="Absent today" value={d.absentToday} tone="bad" />
            <Link to="/leaves?tab=approvals" style={{ textDecoration: 'none', color: 'inherit' }}><Stat label="Pending leave requests" value={d.pendingLeaves} tone="warn" /></Link>
            <Stat label={`Net payroll ${monthLabel(d.payroll.month)}`} value={d.payroll.count ? money(d.payroll.net, cur) : '—'} sub={d.payroll.count ? `${d.payroll.paid}/${d.payroll.count} paid` : 'Not run yet'} />
          </div>
          <AISummary />
          <div className="grid g2">
            <div className="card"><h2>Check-ins, last working days</h2>
              <div style={{ height: 240 }}><ResponsiveContainer><BarChart data={d.attendanceTrend}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="present" name="Checked in" fill="#14524f" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></div>
            <div className="card"><h2>Employees by department</h2>
              <div style={{ height: 240 }}><ResponsiveContainer><PieChart><Pie data={d.byDepartment} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>{d.byDepartment.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></div></div>
            <div className="card"><h2>Leave days taken this year</h2>
              {d.leaveByType.length ? <div style={{ height: 220 }}><ResponsiveContainer><BarChart data={d.leaveByType}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="value" name="Days" fill="#f0b429" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div> : <p className="muted">No approved leave yet this year.</p>}</div>
            <Announcements items={d.announcements} />
          </div>
        </>}
        <div className="grid g2">
          <LeaveBalance b={emp.leaveBalance} />
          <div className="card"><h2>This month</h2>
            <div className="bal"><span>Days present</span><strong>{emp.monthPresent}</strong></div><div className="bal"><span>Late arrivals</span><strong>{emp.monthLate}</strong></div>
            <div className="bal"><span>Hours worked</span><strong>{emp.monthHours}</strong></div><div className="bal"><span>Pending leave requests</span><strong>{emp.pendingLeaves}</strong></div>
            {emp.latestPayslip && <div className="row between" style={{ marginTop: '.8rem' }}><span>Latest payslip: {monthLabel(emp.latestPayslip.month)}</span><button className="btn ghost sm" onClick={() => downloadPayslip(emp.latestPayslip._id, `payslip-${emp.latestPayslip.month}.pdf`)}>Download PDF</button></div>}
          </div>
          {d.role !== 'admin' && <Announcements items={d.announcements} />}
          {d.role !== 'admin' && d.upcomingLeaves?.length > 0 && <div className="card"><h2>Upcoming approved leave</h2>{d.upcomingLeaves.map((l) => <div className="bal" key={l._id}><span>{cap(l.type)}: {fmtDate(l.from)} – {fmtDate(l.to)}</span><strong>{l.days}d</strong></div>)}</div>}
        </div>
        {d.role !== 'admin' && <AISummary />}
      </div>
    </>
  );
}
