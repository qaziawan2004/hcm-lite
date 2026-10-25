import { useState } from 'react';
import useApi from '../utils/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, Empty, Loader, PageHeader, Pager, Stat } from '../components/ui.jsx';
import { CheckInCard } from './Dashboard.jsx';
import { fmtDate, fmtTime, thisMonth, isStaff } from '../utils/format.js';

export default function Attendance() {
  const { user } = useAuth();
  const [tab, setTab] = useState('mine');
  const [month, setMonth] = useState(thisMonth());
  const [page, setPage] = useState(1);
  const [date, setDate] = useState('');
  const mine = useApi('/attendance/my', { month }, tab === 'mine');
  const all = useApi('/attendance', { month, page, date: date || undefined }, tab === 'all');

  return (
    <>
      <PageHeader title="Attendance" sub="Check in when you start and check out when you finish." />
      <CheckInCard onChange={() => { mine.reload(); all.reload(); }} />
      <div style={{ height: '1.2rem' }} />
      {isStaff(user) && <div className="tabs"><button className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>My attendance</button><button className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>All employees</button></div>}
      <div className="filters">
        <input type="month" value={month} onChange={(e) => { setMonth(e.target.value || thisMonth()); setPage(1); }} aria-label="Month" />
        {tab === 'all' && <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setPage(1); }} aria-label="Specific date" />}
      </div>
      {tab === 'mine' ? (mine.loading ? <Loader /> : <>
        <div className="grid g4" style={{ marginBottom: '1rem' }}><Stat label="Present" value={mine.data.summary.present} tone="good" /><Stat label="Late" value={mine.data.summary.late} tone="warn" /><Stat label="Hours worked" value={mine.data.summary.hours} /></div>
        <Table rows={mine.data.items} />
      </>) : (all.loading ? <Loader /> : <><Table rows={all.data.items} showUser /><Pager page={all.data.page} pages={all.data.pages} onChange={setPage} /></>)}
    </>
  );
}

function Table({ rows, showUser }) {
  if (!rows.length) return <div className="card"><Empty title="No attendance records">Nothing recorded for this period.</Empty></div>;
  return (
    <div className="table-wrap"><table className="tbl"><thead><tr><th>Date</th>{showUser && <><th>Employee</th><th>Department</th></>}<th>Check in</th><th>Check out</th><th>Hours</th><th>Status</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r._id}><td>{fmtDate(r.date)}</td>{showUser && <><td>{r.user?.name} <small>{r.user?.employeeId}</small></td><td>{r.user?.department}</td></>}<td>{fmtTime(r.checkIn)}</td><td>{fmtTime(r.checkOut)}</td><td>{r.hours || '—'}</td><td><Badge>{r.status}</Badge></td></tr>)}</tbody></table></div>
  );
}
