import { useRef, useState } from 'react';
import api, { errMsg } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, Field, PageHeader, useToast } from '../components/ui.jsx';
import { fmtDate } from '../utils/format.js';
import Avatar from '../components/Avatar.jsx';

export default function Profile() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user.name || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [gender, setGender] = useState(user.gender || '');
  const [age, setAge] = useState(user.age ?? '');
  const [nationality, setNationality] = useState(user.nationality || '');
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [err, setErr] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInput = useRef(null);

  const saveProfile = async (e) => { e.preventDefault(); try { const { data } = await api.put('/employees/me/profile', { name: name.trim(), phone, gender, age, nationality }); setUser(data.user); setAge(data.user.age ?? ''); setNationality(data.user.nationality || ''); toast('Profile updated.'); } catch (x) { toast(errMsg(x), 'err'); } };
  const uploadPhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setPhotoError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setPhotoError('Choose a JPEG, PNG or WebP image.');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setPhotoError('Profile photos must be 4 MB or smaller.');
      return;
    }
    const body = new FormData();
    body.append('photo', file);
    setUploadingPhoto(true);
    try {
      const { data } = await api.post('/employees/me/profile/photo', body);
      setUser(data.user);
      toast('Profile photo updated.');
    } catch (error) {
      setPhotoError(errMsg(error));
    } finally {
      setUploadingPhoto(false);
    }
  };
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
          <div className="profile-photo">
            <Avatar name={user.name} src={user.avatarUrl} className="profile-avatar" />
            <div><strong>Profile photo</strong><p className="muted">JPEG, PNG or WebP · up to 4 MB. Without a photo, your first and last initials are shown.</p>
              <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadPhoto} hidden />
              <button type="button" className="btn ghost sm" onClick={() => photoInput.current?.click()} disabled={uploadingPhoto}>{uploadingPhoto ? 'Uploading…' : user.avatarUrl ? 'Change photo' : 'Add photo'}</button>
              {photoError && <p className="error" role="alert">{photoError}</p>}
            </div>
          </div>
          <div className="bal"><span>Employee ID</span><strong>{user.employeeId}</strong></div><div className="bal"><span>Email</span><strong>{user.email}</strong></div><div className="bal"><span>Role</span><Badge>{user.role === 'admin' ? 'Owner' : user.role === 'hr' ? 'HR' : 'Employee'}</Badge></div>
          <div className="bal"><span>Department</span><strong>{user.department || '—'}</strong></div><div className="bal"><span>Designation</span><strong>{user.designation || '—'}</strong></div><div className="bal"><span>Joined</span><strong>{fmtDate(user.joinDate)}</strong></div>
          <div style={{ marginTop: '1rem' }}><Field label="Full name"><input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" /></Field><Field label="Phone"><input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field><Field label="Gender (optional)"><select value={gender} onChange={(e) => setGender(e.target.value)}><option value="">Prefer not to specify</option><option value="female">Female</option><option value="male">Male</option><option value="prefer_not_to_say">Prefer not to say</option></select></Field><Field label="Age (optional)"><input type="number" min="0" max="120" step="1" value={age} onChange={(e) => setAge(e.target.value)} /></Field><Field label="Nationality (optional)"><input value={nationality} onChange={(e) => setNationality(e.target.value)} maxLength={100} /></Field><button className="btn">Save changes</button></div></form>
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
