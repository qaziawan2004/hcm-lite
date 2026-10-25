import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import api, { errMsg } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Field } from '../components/ui.jsx';

export default function OtpVerify() {
  const { completeLogin } = useAuth();
  const location = useLocation();
  const nav = useNavigate();
  const challengeId = location.state?.challengeId || sessionStorage.getItem('hcm_otp_challenge');
  const email = location.state?.email || sessionStorage.getItem('hcm_otp_email');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  if (!challengeId) return <Navigate to="/login" replace />;

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await completeLogin(challengeId, code);
      sessionStorage.removeItem('hcm_otp_challenge');
      sessionStorage.removeItem('hcm_otp_email');
      nav('/', { replace: true });
    } catch (err) {
      setError(errMsg(err));
      if (err.response?.status === 410 || err.response?.status === 429) {
        sessionStorage.removeItem('hcm_otp_challenge');
        sessionStorage.removeItem('hcm_otp_email');
      }
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const { data } = await api.post('/auth/otp/resend', { challengeId });
      setNotice(data.message);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth-art">
        <div className="brand-lg">HCM <b>Lite</b></div>
        <div><h1>One more step to keep your account secure.</h1></div>
      </div>
      <div className="auth-form">
        <form className="auth-card" onSubmit={submit}>
          <h2>Verify your email</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Enter the six-digit code sent to {email || 'your email address'}. The code expires in one minute.
          </p>
          {error && <div className="error" role="alert">{error}</div>}
          {notice && <div className="notice" role="status">{notice}</div>}
          <Field label="Verification code">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              autoFocus
            />
          </Field>
          <button className="btn lg" style={{ width: '100%' }} disabled={busy || code.length !== 6}>
            {busy ? 'Please wait…' : 'Verify and sign in'}
          </button>
          <button type="button" className="btn ghost" style={{ width: '100%', marginTop: '.6rem' }} onClick={resend} disabled={busy}>
            Send a new code
          </button>
          <p className="muted" style={{ fontSize: '.85rem', marginBottom: 0 }}>
            <Link to="/login">Back to sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
