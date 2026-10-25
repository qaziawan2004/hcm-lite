import { useState } from 'react';
import api, { errMsg } from '../api/client.js';
import useApi from '../utils/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Empty, Field, Loader, Modal, PageHeader, useToast } from '../components/ui.jsx';
import { money, fmtDate } from '../utils/format.js';

const sum = (a = []) => a.reduce((t, i) => t + (Number(i.amount) || 0), 0);

function Items({ label, items, setItems }) {
  const upd = (i, k, v) => setItems(items.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  return (
    <div style={{ marginBottom: '.9rem' }}><strong style={{ fontSize: '.85rem' }}>{label}</strong>
      {items.map((it, i) => <div className="line-item" key={i} style={{ marginTop: '.4rem' }}>
        <input placeholder="Name" value={it.name} onChange={(e) => upd(i, 'name', e.target.value)} aria-label={`${label} name`} />
        <input type="number" min="0" placeholder="Amount" value={it.amount} onChange={(e) => upd(i, 'amount', e.target.value)} aria-label={`${label} amount`} />
        <button type="button" className="icon-btn" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="Remove">✕</button></div>)}
      <button type="button" className="btn ghost sm" style={{ marginTop: '.4rem' }} onClick={() => setItems([...items, { name: '', amount: '' }])}>Add line</button>
    </div>
  );
}

function SalaryForm({ row, onClose, onSaved }) {
  const toast = useToast();
  const s = row.salary;
  const [basic, setBasic] = useState(s?.basic ?? '');
  const [allowances, setA] = useState(s?.allowances?.length ? s.allowances : [{ name: 'House rent', amount: '' }]);
  const [deductions, setD] = useState(s?.deductions?.length ? s.deductions : [{ name: 'Income tax', amount: '' }]);
  const [effectiveFrom, setEff] = useState(new Date().toLocaleDateString('en-CA'));
  const [err, setErr] = useState('');
  const gross = Number(basic || 0) + sum(allowances);
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    try {
      await api.post('/salary', { userId: row.user._id, basic, allowances: allowances.filter((a) => a.name && a.amount !== ''), deductions: deductions.filter((a) => a.name && a.amount !== ''), effectiveFrom });
      toast('Salary saved.'); onSaved();
    } catch (x) { setErr(errMsg(x)); }
  };
  return (
    <Modal title={`Salary for ${row.user.name}`} onClose={onClose} wide>
      <form onSubmit={submit}>
        {err && <div className="error" role="alert">{err}</div>}
        <div className="form-grid"><Field label="Basic salary (monthly)"><input type="number" min="0" value={basic} onChange={(e) => setBasic(e.target.value)} required /></Field>
          <Field label="Effective from" hint="Creates a new version. Earlier payroll is unchanged."><input type="date" value={effectiveFrom} onChange={(e) => setEff(e.target.value)} required /></Field></div>
        <Items label="Allowances" items={allowances} setItems={setA} />
        <Items label="Fixed deductions" items={deductions} setItems={setD} />
        <p><strong>Gross {money(gross)}</strong> · Fixed deductions {money(sum(deductions))} · Before unpaid-day deductions: <strong>{money(gross - sum(deductions))}</strong></p>
        <div className="row gap end"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn">Save salary</button></div>
      </form>
    </Modal>
  );
}

function History({ row, onClose }) {
  const { data, loading } = useApi(`/salary/history/${row.user._id}`);
  return (
    <Modal title={`Salary history: ${row.user.name}`} onClose={onClose} wide>
      {loading ? <Loader /> : !data.items.length ? <Empty title="No salary versions yet" /> : <div className="table-wrap"><table className="tbl"><thead><tr><th>Effective</th><th className="num">Basic</th><th className="num">Allowances</th><th className="num">Deductions</th><th>Set by</th></tr></thead>
        <tbody>{data.items.map((s) => <tr key={s._id}><td>{fmtDate(s.effectiveFrom)}</td><td className="num">{money(s.basic)}</td><td className="num">{money(sum(s.allowances))}</td><td className="num">{money(sum(s.deductions))}</td><td>{s.createdBy?.name}</td></tr>)}</tbody></table></div>}
    </Modal>
  );
}

export default function Salary() {
  const { company } = useAuth();
  const { data, loading, reload } = useApi('/salary');
  const [edit, setEdit] = useState(null); const [hist, setHist] = useState(null);
  const cur = company?.currency;
  return (
    <>
      <PageHeader title="Salaries" sub="Monthly salary structure for each active employee. Payroll uses the latest version in effect." />
      {loading ? <Loader /> : <div className="table-wrap"><table className="tbl"><thead><tr><th>Employee</th><th>Department</th><th className="num">Basic</th><th className="num">Allowances</th><th className="num">Fixed deductions</th><th className="num">Gross</th><th /></tr></thead>
        <tbody>{data.items.map((r) => <tr key={r.user._id}><td>{r.user.name}<br /><small>{r.user.employeeId}</small></td><td>{r.user.department || '—'}</td>
          {r.salary ? <><td className="num">{money(r.salary.basic, cur)}</td><td className="num">{money(sum(r.salary.allowances), cur)}</td><td className="num">{money(sum(r.salary.deductions), cur)}</td><td className="num"><strong>{money(r.salary.basic + sum(r.salary.allowances), cur)}</strong></td></> : <td colSpan={4} className="muted">No salary set</td>}
          <td><div className="row gap"><button className="btn sm" onClick={() => setEdit(r)}>{r.salary ? 'Update' : 'Set salary'}</button>{r.salary && <button className="btn ghost sm" onClick={() => setHist(r)}>History</button>}</div></td></tr>)}</tbody></table></div>}
      {edit && <SalaryForm row={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      {hist && <History row={hist} onClose={() => setHist(null)} />}
    </>
  );
}
