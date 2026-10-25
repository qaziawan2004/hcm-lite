import { useState } from 'react';
import api, { errMsg } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, Field, PageHeader, useToast } from '../components/ui.jsx';
import { fmtDate } from '../utils/format.js';

export default function Profile() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user.name || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [err, setErr] = useState('');

  const saveProfile = async (e) => { e.preventDefault(); try { const { data } = await api.put('/employees/me/profile', { name: name.trim(), phone }); setUser(data.user); toast('Profile updated.'); } catch (x) { toast(errMsg(x), 'err'); } };
  const changePw = async (e) => {
    e.preventDefault(); setErr('');
    if (pw.newPassword !== pw.confirm) return setErr('The new passwords do not match.');
    try { const { data } = await api.post('/auth/change-password', pw); setUser(data.user); setPw({ currentPassword: '', newPassword: '', confirm: '' }); toast('Password changed.'); }
    catch (x) { setErr(errMsg(x)); }
  };
  return (
    <>
      <PageHeader title="My profile" />
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <form className="card" onSubmit={saveProfile}><h2>Personal details</h2>
          <div className="bal"><span>Employee ID</span><strong>{user.employeeId}</strong></div><div className="bal"><span>Email</span><strong>{user.email}</strong></div><div className="bal"><span>Role</span><Badge>{user.role}</Badge></div>
          <div className="bal"><span>Department</span><strong>{user.department || '—'}</strong></div><div className="bal"><span>Designation</span><strong>{user.designation || '—'}</strong></div><div className="bal"><span>Joined</span><strong>{fmtDate(user.joinDate)}</strong></div>
          <div style={{ marginTop: '1rem' }}><Field label="Full name"><input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" /></Field><Field label="Phone"><input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field><button className="btn">Save changes</button></div></form>
        <form className="card" onSubmit={changePw}><h2>Change password</h2>
          {err && <div className="error" role="alert">{err}</div>}
          <Field label="Current password"><input type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} required autoComplete="current-password" /></Field>
          <Field label="New password" hint="At least 8 characters."><input type="password" minLength={8} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} required autoComplete="new-password" /></Field>
          <Field label="Confirm new password"><input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required autoComplete="new-password" /></Field>
          <button className="btn">Update password</button></form>
      </div>
    </>
  );
}
