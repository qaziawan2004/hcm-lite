import { useEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import api, { errMsg } from '../api/client.js';
import useApi from '../utils/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, Empty, Field, Loader, Modal, PageHeader, Pager, useToast } from '../components/ui.jsx';
import { fmtDate, cap, isStaff } from '../utils/format.js';

const today = () => new Date().toLocaleDateString('en-CA');

function ApplyForm({ onDone, balance }) {
  const loc = useLocation();
  const toast = useToast();
  const [f, setF] = useState({ type: 'annual', from: today(), to: today(), reason: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => { const d = loc.state?.draft; if (d) { setF({ type: d.type, from: d.from, to: d.to, reason: d.reason }); setPrefilled(true); } }, [loc.state]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await api.post('/leaves', f); toast('Leave request sent for approval.'); setPrefilled(false); onDone(); }
    catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  };
  return (
    <form className="card leave-form" onSubmit={submit}>
      <h2>Apply for leave</h2>
      {prefilled && <div className="notice">Pre-filled by the AI assistant. Check the details before you submit.</div>}
      {err && <div className="error" role="alert">{err}</div>}
      <Field label="Leave type" hint={f.type !== 'unpaid' ? `${balance?.[f.type] ?? 0} day(s) left. Weekends are not counted.` : 'Unpaid days are deducted from your pay.'}>
        <select value={f.type} onChange={set('type')}>{['annual', 'sick', 'casual', 'unpaid'].map((t) => <option key={t} value={t}>{cap(t)}</option>)}</select></Field>
      <div className="form-grid"><Field label="From"><input type="date" value={f.from} onChange={set('from')} required /></Field><Field label="To"><input type="date" value={f.to} min={f.from} onChange={set('to')} required /></Field></div>
      <Field label="Reason"><textarea value={f.reason} onChange={set('reason')} required minLength={3} maxLength={300} /></Field>
      <button className="btn" disabled={busy}>{busy ? 'Sending…' : 'Submit request'}</button>
    </form>
  );
}

function MyLeaves({ reload, data }) {
  const toast = useToast();
  const cancel = async (id) => { try { await api.patch(`/leaves/${id}/cancel`); toast('Request cancelled.'); reload(); } catch (e) { toast(errMsg(e), 'err'); } };
  if (!data.length) return <div className="card"><Empty title="No leave requests yet">Apply for leave from the first tab.</Empty></div>;
  return <div className="table-wrap"><table className="tbl"><thead><tr><th>Type</th><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th><th>Reviewed by</th><th /></tr></thead>
    <tbody>{data.map((l) => <tr key={l._id}><td>{cap(l.type)}</td><td>{fmtDate(l.from)} – {fmtDate(l.to)}</td><td>{l.days}</td><td>{l.reason}</td><td><Badge>{l.status}</Badge></td><td>{l.reviewedBy?.name || '—'}{l.reviewNote && <><br /><small>{l.reviewNote}</small></>}</td>
      <td>{l.status === 'pending' && <button className="btn ghost sm" onClick={() => cancel(l._id)}>Cancel</button>}</td></tr>)}</tbody></table></div>;
}

function Approvals() {
  const toast = useToast();
  const [status, setStatus] = useState('pending'); const [page, setPage] = useState(1);
  const [dlg, setDlg] = useState(null); const [note, setNote] = useState('');
  const { data, loading, reload } = useApi('/leaves', { status: status || undefined, page });
  const decide = async () => {
    try { await api.patch(`/leaves/${dlg.leave._id}/decision`, { decision: dlg.decision, note }); toast(`Leave ${dlg.decision}.`); setDlg(null); setNote(''); reload(); }
    catch (e) { toast(errMsg(e), 'err'); }
  };
  return <>
    <div className="filters"><select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status filter"><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="">All</option></select></div>
    {loading ? <Loader /> : !data.items.length ? <div className="card"><Empty title="Nothing here">No leave requests match this filter.</Empty></div> : <>
      <div className="table-wrap"><table className="tbl"><thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th><th /></tr></thead>
        <tbody>{data.items.map((l) => <tr key={l._id}><td>{l.user?.name}<br /><small>{l.user?.department} · {l.user?.role}</small></td><td>{cap(l.type)}</td><td>{fmtDate(l.from)} – {fmtDate(l.to)}</td><td>{l.days}</td><td>{l.reason}</td><td><Badge>{l.status}</Badge></td>
          <td>{l.status === 'pending' && <div className="row gap"><button className="btn sm" onClick={() => setDlg({ leave: l, decision: 'approved' })}>Approve</button><button className="btn danger sm" onClick={() => setDlg({ leave: l, decision: 'rejected' })}>Reject</button></div>}</td></tr>)}</tbody></table></div>
      <Pager page={data.page} pages={data.pages} onChange={setPage} /></>}
    {dlg && <Modal title={`${dlg.decision === 'approved' ? 'Approve' : 'Reject'} leave for ${dlg.leave.user?.name}`} onClose={() => setDlg(null)}>
      <p>{cap(dlg.leave.type)} leave, {fmtDate(dlg.leave.from)} – {fmtDate(dlg.leave.to)} ({dlg.leave.days} working days).</p>
      <Field label="Note to the employee (optional)"><textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} /></Field>
      <div className="row gap end"><button className="btn ghost" onClick={() => setDlg(null)}>Cancel</button><button className={`btn ${dlg.decision === 'rejected' ? 'danger' : ''}`} onClick={decide}>Confirm {dlg.decision === 'approved' ? 'approval' : 'rejection'}</button></div></Modal>}
  </>;
}

export default function Leaves() {
  const { user, refresh } = useAuth();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') || 'apply';
  const mine = useApi('/leaves/my');
  const bal = useApi('/leaves/balance');
  const go = (t) => setSp({ tab: t });
  return (
    <>
      <PageHeader title="Leaves" sub="Apply for time off and track your requests." />
      <div className="tabs">
        <button className={tab === 'apply' ? 'on' : ''} onClick={() => go('apply')}>Apply</button>
        <button className={tab === 'mine' ? 'on' : ''} onClick={() => go('mine')}>My requests</button>
        {isStaff(user) && <button className={tab === 'approvals' ? 'on' : ''} onClick={() => go('approvals')}>Approvals</button>}
      </div>
      {tab === 'apply' && <div className="grid leave-layout">
        <ApplyForm balance={bal.data?.balance} onDone={() => { mine.reload(); bal.reload(); refresh(); go('mine'); }} />
        <div className="card"><h2>Your balance</h2>{Object.entries(bal.data?.balance || {}).map(([k, v]) => <div className="bal" key={k}><span>{cap(k)}</span><strong>{v} days</strong></div>)}</div></div>}
      {tab === 'mine' && (mine.loading ? <Loader /> : <MyLeaves data={mine.data.items} reload={() => { mine.reload(); bal.reload(); }} />)}
      {tab === 'approvals' && isStaff(user) && <Approvals />}
    </>
  );
}
