import { useState } from 'react';
import useApi from '../utils/useApi.js';
import { Badge, Empty, Loader, PageHeader, Pager } from '../components/ui.jsx';
import { fmtDateTime } from '../utils/format.js';

export default function AuditLogs() {
  const [q, setQ] = useState(''); const [action, setAction] = useState(''); const [page, setPage] = useState(1);
  const { data, loading } = useApi('/audit-logs', { q: q || undefined, action: action || undefined, page });
  return (
    <>
      <PageHeader title="Audit logs" sub="A record of who did what. Visible to admins only." />
      <div className="filters">
        <input placeholder="Search person or details" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Search" />
        <select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} aria-label="Action"><option value="">All actions</option>{data?.actions.map((a) => <option key={a}>{a}</option>)}</select>
      </div>
      {loading && !data ? <Loader /> : !data.items.length ? <div className="card"><Empty title="No log entries match" /></div> : <>
        <div className="table-wrap"><table className="tbl"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr></thead>
          <tbody>{data.items.map((l) => <tr key={l._id}><td data-label="When" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(l.createdAt)}</td><td data-label="Who">{l.actorName || '—'} <Badge>{l.role || 'system'}</Badge></td><td data-label="Action"><code>{l.action}</code></td><td data-label="Details">{l.details}</td></tr>)}</tbody></table></div>
        <Pager page={data.page} pages={data.pages} onChange={setPage} /></>}
    </>
  );
}
