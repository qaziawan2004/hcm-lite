import { useEffect, useState } from 'react';
import api, { errMsg } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Field, PageHeader, useToast } from '../components/ui.jsx';

export default function Company() {
  const { company, setCompany } = useAuth();
  const toast = useToast();
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (company) setF({ ...company, departments: company.departments.join('\n'), designations: company.designations.join('\n') });
  }, [company]);
  if (!f) return null;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setQ = (k) => (e) => setF({ ...f, leaveQuota: { ...f.leaveQuota, [k]: e.target.value } });
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const body = { ...f, departments: f.departments.split('\n'), designations: f.designations.split('\n') };
      const { data } = await api.put('/company', body); setCompany(data.company); toast('Company settings saved.');
    } catch (x) { toast(errMsg(x), 'err'); } finally { setBusy(false); }
  };
  return (
    <>
      <PageHeader title="Company setup" sub="Details, work hours, departments and yearly leave quotas." />
      <form onSubmit={save} className="grid g2" style={{ alignItems: 'start' }}>
        <div className="card"><h2>Company</h2>
          <Field label="Company name"><input value={f.name || ''} onChange={set('name')} required /></Field>
          <div className="form-grid"><Field label="Email"><input type="email" value={f.email || ''} onChange={set('email')} /></Field><Field label="Phone"><input value={f.phone || ''} onChange={set('phone')} /></Field></div>
          <Field label="Address"><input value={f.address || ''} onChange={set('address')} /></Field>
          <Field label="Currency code"><input value={f.currency || ''} onChange={set('currency')} maxLength={5} /></Field>
        </div>
        <div className="card"><h2>Work hours</h2>
          <div className="form-grid"><Field label="Start time"><input type="time" value={f.workStart} onChange={set('workStart')} /></Field><Field label="End time"><input type="time" value={f.workEnd} onChange={set('workEnd')} /></Field></div>
          <Field label="Grace period (minutes)" hint="Check-ins after start time plus this grace are marked late."><input type="number" min="0" value={f.graceMinutes} onChange={set('graceMinutes')} /></Field>
          <h2 style={{ marginTop: '1rem' }}>Yearly leave quota</h2>
          <div className="form-grid">{['annual', 'sick', 'casual'].map((k) => <Field key={k} label={k[0].toUpperCase() + k.slice(1)}><input type="number" min="0" value={f.leaveQuota[k]} onChange={setQ(k)} /></Field>)}</div>
          <small>The quota applies to employees created from now on. Edit existing balances on the employee record.</small>
        </div>
        <div className="card"><h2>Departments</h2><Field label="One per line"><textarea rows={7} value={f.departments} onChange={set('departments')} /></Field></div>
        <div className="card"><h2>Designations</h2><Field label="One per line"><textarea rows={7} value={f.designations} onChange={set('designations')} /></Field></div>
        <div><button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></div>
      </form>
    </>
  );
}
