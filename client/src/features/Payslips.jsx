import { downloadPayslip, errMsg } from '../api/client.js';
import useApi from '../utils/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, Empty, Loader, PageHeader, useToast } from '../components/ui.jsx';
import { money, monthLabel, fmtDate } from '../utils/format.js';

export default function Payslips() {
  const { company } = useAuth();
  const toast = useToast();
  const { data, loading } = useApi('/payroll/my');
  const cur = company?.currency;
  const rows = data?.items || [];
  const download = async (p) => {
    try { await downloadPayslip(p._id, `payslip-${p.month}.pdf`); }
    catch (e) { toast(errMsg(e), 'err'); }
  };
  return (
    <>
      <PageHeader title="My payslips" sub="Payslips appear here once payroll for the month has been paid." />
      {loading ? <Loader /> : !rows.length ? <div className="card"><Empty title="No payslips yet">Your first payslip will appear after payroll is processed.</Empty></div> :
        <div className="table-wrap"><table className="tbl"><thead><tr><th>Month</th><th className="num">Gross</th><th className="num">Deductions</th><th className="num">Net pay</th><th>Status</th><th>Paid on</th><th /></tr></thead>
          <tbody>{rows.map((p) => <tr key={p._id}><td data-label="Month">{monthLabel(p.month)}</td><td data-label="Gross" className="num">{money(p.gross, cur)}</td><td data-label="Deductions" className="num">{money(p.totalDeductions, cur)}</td><td data-label="Net pay" className="num"><strong>{money(p.netPay, cur)}</strong></td><td data-label="Status"><Badge>{p.status}</Badge></td><td data-label="Paid on">{p.paidAt ? fmtDate(p.paidAt) : '—'}</td>
            <td data-label="">{p.status === 'paid' ? <button className="btn ghost sm" onClick={() => download(p)}>Download PDF</button> : <small>Not published yet</small>}</td></tr>)}</tbody></table></div>}
    </>
  );
}
