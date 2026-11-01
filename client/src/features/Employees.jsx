import { useState } from 'react';
import api, { errMsg } from '../api/client.js';
import useApi from '../utils/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, Confirm, Empty, Field, Loader, Modal, PageHeader, Pager, useToast } from '../components/ui.jsx';
import { fmtDate, canManage } from '../utils/format.js';

const DEFAULT_DEPARTMENTS = ['Engineering', 'Human Resources', 'Finance', 'Sales', 'Operations'];
const DEFAULT_DESIGNATIONS = ['Manager', 'Senior Associate', 'Associate', 'Intern'];

function EmployeeForm({ initial, onClose, onSaved }) {
  const { user: me, company } = useAuth();
  const toast = useToast();
  const edit = !!initial;
  const departments = company?.departments?.length ? company.departments : DEFAULT_DEPARTMENTS;
  const designations = company?.designations?.length ? company.designations : DEFAULT_DESIGNATIONS;
  const [f, setF] = useState(initial ? { ...initial } : { name: '', email: '', role: 'employee', department: '', designation: '', phone: '', gender: '', joinDate: new Date().toLocaleDateString('en-CA') });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const { data } = edit ? await api.put(`/employees/${initial._id}`, f) : await api.post('/employees', f);
      toast(edit ? 'Employee updated.' : 'Employee registered.'); onSaved(data.temporaryPassword ? { user: data.user, pw: data.temporaryPassword } : null);
    } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  };
  return (
    <Modal title={edit ? 'Edit employee' : 'Register employee'} onClose={onClose} wide>
      <form onSubmit={submit}>
        {err && <div className="error" role="alert">{err}</div>}
        <div className="form-grid">
          <Field label="Full name"><input value={f.name} onChange={set('name')} required /></Field>
          <Field label="Work email"><input type="email" value={f.email} onChange={set('email')} required /></Field>
          <Field label="Gender (optional)"><select value={f.gender || ''} onChange={set('gender')}><option value="">Prefer not to specify</option><option value="female">Female</option><option value="male">Male</option><option value="prefer_not_to_say">Prefer not to say</option></select></Field>
          <Field label="Department"><select value={f.department} onChange={set('department')}><option value="">Select…</option>{departments.map((d) => <option key={d}>{d}</option>)}</select></Field>
          <Field label="Designation"><select value={f.designation} onChange={set('designation')}><option value="">Select…</option>{designations.map((d) => <option key={d}>{d}</option>)}</select></Field>
          <Field label="Phone"><input value={f.phone} onChange={set('phone')} /></Field>
          <Field label="Join date"><input type="date" value={f.joinDate} onChange={set('joinDate')} /></Field>
          <Field label="Role" hint={me.role !== 'admin' ? 'Only the owner can assign HR or owner roles.' : undefined}>
            <select value={f.role} onChange={set('role')} disabled={me.role !== 'admin'}><option value="employee">Employee</option><option value="hr">HR</option><option value="admin">Owner</option></select></Field>
        </div>
        {!edit && <small>A temporary password is generated and shown once after you save.</small>}
        <div className="row gap end" style={{ marginTop: '1rem' }}><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={busy}>{busy ? 'Saving…' : edit ? 'Save changes' : 'Register'}</button></div>
      </form>
    </Modal>
  );
}

export default function Employees() {
  const { user: me, company } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState(''); const [department, setDept] = useState(''); const [status, setStatus] = useState(''); const [page, setPage] = useState(1);
  const [form, setForm] = useState(null); const [confirm, setConfirm] = useState(null); const [pw, setPw] = useState(null); const [history, setHistory] = useState(null); const [terminationReason, setTerminationReason] = useState('');
  const { data, loading, error, reload } = useApi('/employees', { q: q || undefined, department: department || undefined, status: status || undefined, page });

  const toggle = async (u) => { try { await api.patch(`/employees/${u._id}/status`, { status: u.status === 'active' ? 'inactive' : 'active' }); toast('Status updated.'); reload(); } catch (e) { toast(errMsg(e), 'err'); } setConfirm(null); };
  const terminate = async () => {
    try {
      await api.patch(`/employees/${confirm.u._id}/status`, { status: 'terminated', reason: terminationReason });
      toast(`${confirm.u.name} was terminated and removed from active dashboards and future payroll.`);
      setConfirm(null); setTerminationReason(''); reload();
    } catch (e) { toast(errMsg(e), 'err'); }
  };
  const exportCsv = async () => {
    try {
      const { data: file } = await api.get('/employees/export.csv', {
        params: { q: q || undefined, department: department || undefined, status: status || undefined },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url; link.download = 'employees.csv'; document.body.appendChild(link); link.click(); link.remove();
      URL.revokeObjectURL(url);
    } catch (e) { toast(errMsg(e), 'err'); }
  };
  const reset = async (u) => { try { const r = await api.post(`/employees/${u._id}/reset-password`); setPw({ user: u, pw: r.data.temporaryPassword }); } catch (e) { toast(errMsg(e), 'err'); } setConfirm(null); };

  return (
    <>
      <PageHeader title="Employees" sub="Register people, update their details and manage access."><button className="btn ghost" onClick={exportCsv}>Export CSV</button><button className="btn accent" onClick={() => setForm({})}>Register employee</button></PageHeader>
      <div className="filters">
        <input placeholder="Search name, email or ID" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Search" />
        <select value={department} onChange={(e) => { setDept(e.target.value); setPage(1); }} aria-label="Department"><option value="">All departments</option>{(company?.departments?.length ? company.departments : DEFAULT_DEPARTMENTS).map((d) => <option key={d}>{d}</option>)}</select>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status"><option value="">Any status</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="terminated">Terminated</option></select>
      </div>
      {error && <div className="error">{error}</div>}
      {loading && !data ? <Loader /> : !data?.items.length ? <div className="card"><Empty title="No employees found">Try a different search, or register a new employee.</Empty></div> : <>
        <div className="table-wrap"><table className="tbl"><thead><tr><th>ID</th><th>Name</th><th>Department</th><th>Designation</th><th>Role</th><th>Joined</th><th>Status</th><th /></tr></thead>
          <tbody>{data.items.map((u) => <tr key={u._id}><td data-label="ID">{u.employeeId}</td><td data-label="Name">{u.name}<br /><small>{u.email}</small></td><td data-label="Department">{u.department || '—'}</td><td data-label="Designation">{u.designation || '—'}</td><td data-label="Role"><Badge>{u.role === 'admin' ? 'Owner' : u.role === 'hr' ? 'HR' : 'Employee'}</Badge></td><td data-label="Joined">{fmtDate(u.joinDate)}</td><td data-label="Status"><Badge>{u.status}</Badge>{u.terminationDate && <><br /><small>{fmtDate(u.terminationDate)}</small></>}</td>
            <td data-label="">{canManage(me, u) && <div className="row gap wrap"><button className="btn ghost sm" onClick={() => setForm(u)}>Edit</button>
              {!!u.statusHistory?.length && <button className="btn ghost sm" onClick={() => setHistory(u)}>Status history</button>}
              {u._id !== me._id && <button className="btn ghost sm" onClick={() => setConfirm({ u, kind: 'status' })}>{u.status === 'active' ? 'Deactivate' : 'Activate'}</button>}
              {u._id !== me._id && u.status !== 'terminated' && <button className="btn danger sm" onClick={() => { setTerminationReason(''); setConfirm({ u, kind: 'terminate' }); }}>Terminate</button>}
              <button className="btn ghost sm" onClick={() => setConfirm({ u, kind: 'reset' })}>Reset password</button></div>}</td></tr>)}</tbody></table></div>
        <Pager page={data.page} pages={data.pages} onChange={setPage} /></>}
      {form && <EmployeeForm initial={form._id ? form : null} onClose={() => setForm(null)} onSaved={(created) => { setForm(null); reload(); if (created) setPw(created); }} />}
      {confirm?.kind === 'status' && <Confirm title={`${confirm.u.status === 'active' ? 'Deactivate' : 'Activate'} ${confirm.u.name}?`} message={confirm.u.status === 'active' ? 'They will no longer be able to sign in or be included in payroll.' : 'They will be able to sign in again.'} danger={confirm.u.status === 'active'} yesLabel={confirm.u.status === 'active' ? 'Deactivate' : 'Activate'} onYes={() => toggle(confirm.u)} onNo={() => setConfirm(null)} />}
      {confirm?.kind === 'terminate' && <Modal title={`Terminate ${confirm.u.name}?`} onClose={() => setConfirm(null)}>
        <p>This records an employment-status change, blocks sign-in, and excludes the employee from active dashboards and future payroll. Existing records are retained.</p>
        <Field label="Reason for termination"><textarea value={terminationReason} onChange={(e) => setTerminationReason(e.target.value)} required minLength={3} maxLength={300} /></Field>
        <div className="row gap end" style={{ marginTop: '1rem' }}><button className="btn ghost" onClick={() => setConfirm(null)}>Cancel</button><button className="btn danger" onClick={terminate} disabled={terminationReason.trim().length < 3}>Confirm termination</button></div>
      </Modal>}
      {history && <Modal title={`${history.name} — status history`} onClose={() => setHistory(null)}>
        {history.statusHistory.map((entry, index) => <div className="ann" key={`${entry.date}-${index}`}>
          <strong>{entry.from} → {entry.to}</strong><br /><small>{fmtDate(entry.date)} · {entry.changedBy?.name || 'Unknown user'}</small>
          {entry.reason && <p style={{ margin: '.3rem 0 0' }}>{entry.reason}</p>}
        </div>)}
      </Modal>}
      {confirm?.kind === 'reset' && <Confirm title={`Reset password for ${confirm.u.name}?`} message="A new temporary password will be generated. Their current password stops working." yesLabel="Reset password" onYes={() => reset(confirm.u)} onNo={() => setConfirm(null)} />}
      {pw && <Modal title="Temporary password" onClose={() => setPw(null)}><p>Share this with <strong>{pw.user.name}</strong> securely. It is shown only once, and they must change it after signing in.</p><div className="temp">{pw.pw}</div><div className="row end" style={{ marginTop: '1rem' }}><button className="btn" onClick={() => setPw(null)}>Done</button></div></Modal>}
    </>
  );
}
