import { useState } from 'react';
import api, { errMsg, downloadPayslip } from '../api/client.js';
import useApi from '../utils/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, Confirm, Empty, Loader, PageHeader, Stat, useToast } from '../components/ui.jsx';
import { money, monthLabel, thisMonth } from '../utils/format.js';

export default function Payroll() {
  const { user, company } = useAuth();
  const toast = useToast();
  const [month, setMonth] = useState(thisMonth());
  const [confirm, setConfirm] = useState(null);
  const { data, loading, reload } = useApi('/payroll', { month });
  const cur = company?.currency;

  const run = async () => {
    try {
      const { data: r } = await api.post('/payroll/run', { month });
      toast(`${r.created} payslip(s) generated${r.skippedExisting ? `, ${r.skippedExisting} already existed` : ''}${r.skippedNoSalary.length ? `. No salary set for: ${r.skippedNoSalary.join(', ')}` : ''}.`);
      reload();
    } catch (e) { toast(errMsg(e), 'err'); }
  };
  const pay = async () => { try { const r = await api.post('/payroll/mark-paid', { month }); toast(`${r.data.updated} payslip(s) marked as paid and employees notified.`); reload(); } catch (e) { toast(errMsg(e), 'err'); } setConfirm(null); };
  const del = async (id) => { try { await api.delete(`/payroll/${id}`); toast('Deleted. Run payroll again to regenerate.'); reload(); } catch (e) { toast(errMsg(e), 'err'); } setConfirm(null); };
  const download = async (p) => {
    try { await downloadPayslip(p._id, `payslip-${p.user?.employeeId}-${p.month}.pdf`); }
    catch (e) { toast(errMsg(e), 'err'); }
  };
  const hasUnpaid = data?.items.some((p) => p.status === 'generated');

  return (
    <>
      <PageHeader title="Payroll" sub="Net pay = basic + allowances − fixed deductions − unpaid days (gross ÷ working days per day).">
        <input type="month" value={month} max={thisMonth()} onChange={(e) => setMonth(e.target.value || thisMonth())} aria-label="Payroll month" style={{ width: 'auto' }} />
        <button className="btn accent" onClick={run}>Run payroll</button>
        <button className="btn" disabled={!hasUnpaid} onClick={() => setConfirm({ kind: 'pay' })}>Mark all as paid</button>
      </PageHeader>
      {loading ? <Loader /> : !data.items.length ? <div className="card"><Empty title={`No payroll for ${monthLabel(month)}`}>Make sure each employee has a salary, then choose Run payroll. Running it twice never duplicates payslips.</Empty></div> : <>
        <div className="grid g4" style={{ marginBottom: '1rem' }}><Stat label="Gross pay" value={money(data.totals.gross, cur)} /><Stat label="Total deductions" value={money(data.totals.deductions, cur)} tone="warn" /><Stat label="Net payable" value={money(data.totals.net, cur)} tone="good" /></div>
        <div className="table-wrap"><table className="tbl"><thead><tr><th>Employee</th><th className="num">Present</th><th className="num">Paid leave</th><th className="num">Unpaid days</th><th className="num">Gross</th><th className="num">Deductions</th><th className="num">Net pay</th><th>Status</th><th /></tr></thead>
          <tbody>{data.items.map((p) => <tr key={p._id}><td>{p.user?.name}<br /><small>{p.user?.employeeId}</small></td><td className="num">{p.presentDays}/{p.workingDays}</td><td className="num">{p.paidLeaveDays}</td><td className="num">{p.unpaidDays}</td>
            <td className="num">{money(p.gross, cur)}</td><td className="num">{money(p.totalDeductions, cur)}</td><td className="num"><strong>{money(p.netPay, cur)}</strong></td><td><Badge>{p.status}</Badge></td>
            <td><div className="row gap"><button className="btn ghost sm" onClick={() => download(p)}>PDF</button>
              {user.role === 'admin' && p.status === 'generated' && <button className="btn ghost sm" onClick={() => setConfirm({ kind: 'del', id: p._id })}>Delete</button>}</div></td></tr>)}</tbody></table></div></>}
      {confirm?.kind === 'pay' && <Confirm title={`Mark ${monthLabel(month)} payroll as paid?`} message="Employees will be notified and can download their payslips. Paid payroll can no longer be deleted." yesLabel="Mark as paid" onYes={pay} onNo={() => setConfirm(null)} />}
      {confirm?.kind === 'del' && <Confirm title="Delete this payroll record?" message="Use this to fix salary or attendance data, then run payroll again." danger yesLabel="Delete" onYes={() => del(confirm.id)} onNo={() => setConfirm(null)} />}
    </>
  );
}
