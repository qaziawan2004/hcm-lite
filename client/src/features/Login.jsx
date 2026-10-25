import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { errMsg } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Field } from '../components/ui.jsx';

const DEMO = [['Admin', 'admin@hcmlite.com', 'Admin@1234'], ['HR', 'hr@hcmlite.com', 'Hr@12345'], ['Employee', 'employee@hcmlite.com', 'Employee@123']];
const POINTS = [
  ['Attendance and leave', 'Check-ins, late marks, approvals and balances, always current.'],
  ['Payroll without spreadsheets', 'Salary structures, monthly runs and downloadable payslips.'],
  ['An assistant that reads your records', 'Ask a question or describe a leave request in plain words.'],
];

export default function Login() {
  const { login, setup } = useAuth();
  const nav = useNavigate();
  const [state, setState] = useState('checking'); // checking | down | setup | login
  const [f, setF] = useState({ companyName: '', name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const check = () => {
    setState('checking');
    setConnectionError('');
    api.get('/auth/setup-status').then(({ data }) => {
      if (typeof data?.needsSetup !== 'boolean') {
        setConnectionError('The API URL is pointing to the frontend instead of the API. Set VITE_API_URL to your deployed API origin in Vercel, then redeploy the frontend.');
        setState('down');
        return;
      }
      setState(data.needsSetup ? 'setup' : 'login');
    }).catch(() => {
      setConnectionError('The API is not responding. Verify the API deployment and set VITE_API_URL to its origin in Vercel, then redeploy the frontend.');
      setState('down');
    });
  };
  useEffect(check, []);

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const result = state === 'setup' ? await setup(f) : await login(f.email, f.password);
      sessionStorage.setItem('hcm_otp_challenge', result.challengeId);
      sessionStorage.setItem('hcm_otp_email', result.email);
      nav('/otp-verify', { state: { challengeId: result.challengeId, email: result.email } });
    }
    catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  };

  return (
    <div className="auth">
      <div className="auth-art">
        <div className="brand-lg">HCM <b>Lite</b></div>
        <div>
          <h1>Run your people operations from one calm workspace.</h1>
          <ul className="points">{POINTS.map(([t, d]) => <li key={t}><strong>{t}</strong><span>{d}</span></li>)}</ul>
        </div>
      </div>
      <div className="auth-form">
        {state === 'checking' && <p className="muted">Connecting…</p>}
        {state === 'down' && (
          <div className="auth-card">
            <h2>Can't connect to the API</h2>
            <div className="error" role="alert">{connectionError}</div>
            <button className="btn" style={{ width: '100%' }} onClick={check}>Try again</button>
          </div>
        )}
        {(state === 'setup' || state === 'login') && (
          <form className="auth-card" onSubmit={submit}>
            <h2>{state === 'setup' ? 'Set up your company' : 'Welcome back'}</h2>
            <p className="muted" style={{ marginTop: 0 }}>{state === 'setup' ? 'This is a fresh install. Create your company and the first admin account. Admins can add HR accounts, and HR or admins can add employees.' : 'Sign in with your work account. Your name and verified account role will appear after sign-in.'}</p>
            {err && <div className="error" role="alert">{err}</div>}
            {state === 'setup' && <>
              <Field label="Company name"><input value={f.companyName} onChange={set('companyName')} required /></Field>
              <Field label="Your full name"><input value={f.name} onChange={set('name')} required autoComplete="name" /></Field>
            </>}
            <Field label="Work email"><input type="email" value={f.email} onChange={set('email')} required autoComplete="username" /></Field>
            <Field label="Password" hint={state === 'setup' ? 'At least 8 characters.' : undefined}><input type="password" value={f.password} onChange={set('password')} required minLength={state === 'setup' ? 8 : undefined} autoComplete={state === 'setup' ? 'new-password' : 'current-password'} /></Field>
            <button className="btn lg" style={{ width: '100%' }} disabled={busy}>{busy ? 'Please wait…' : state === 'setup' ? 'Create company and sign in' : 'Sign in'}</button>
            {state === 'login' && <p className="muted" style={{ fontSize: '.85rem', marginBottom: 0 }}>Don't have an account or forgot your password? Ask an admin to create an HR account, or ask HR to create an employee account or reset your password.</p>}
            {state === 'login' && import.meta.env.VITE_SHOW_DEMO === 'true' && (
              <div className="demo"><strong>Demo accounts</strong>
                {DEMO.map(([r, e, p]) => <div key={r}><button type="button" onClick={() => setF({ ...f, email: e, password: p })}>Use {r}</button> <span className="muted">{e}</span></div>)}
              </div>)}
          </form>
        )}
      </div>
    </div>
  );
}
