import { useState } from 'react';
import api, { errMsg } from '../api/client.js';
import useApi from '../utils/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, Confirm, Empty, Field, Loader, Modal, PageHeader, useToast } from '../components/ui.jsx';
import { fmtDate, isStaff, cap } from '../utils/format.js';

export default function Announcements() {
  const { user } = useAuth();
  const toast = useToast();
  const { data, loading, reload } = useApi('/announcements');
  const [open, setOpen] = useState(false); const [del, setDel] = useState(null);
  const [f, setF] = useState({ title: '', body: '', audience: 'all', pinned: false }); const [err, setErr] = useState('');

  const post = async (e) => {
    e.preventDefault(); setErr('');
    try { await api.post('/announcements', f); toast('Announcement posted and sent as a notification.'); setOpen(false); setF({ title: '', body: '', audience: 'all', pinned: false }); reload(); }
    catch (x) { setErr(errMsg(x)); }
  };
  const remove = async () => { try { await api.delete(`/announcements/${del._id}`); toast('Announcement deleted.'); reload(); } catch (e) { toast(errMsg(e), 'err'); } setDel(null); };

  return (
    <>
      <PageHeader title="Announcements" sub="News and notices from HR.">{isStaff(user) && <button className="btn accent" onClick={() => setOpen(true)}>New announcement</button>}</PageHeader>
      <div className="card">
        {loading ? <Loader /> : !data.items.length ? <Empty title="No announcements yet">{isStaff(user) ? 'Post the first one to notify your team.' : 'Check back later.'}</Empty> :
          data.items.map((a) => <div className="ann" key={a._id}>
            <div className="row between"><h3>{a.pinned && '📌 '}{a.title}</h3>{isStaff(user) && <button className="btn ghost sm" onClick={() => setDel(a)}>Delete</button>}</div>
            <small>{fmtDate(a.createdAt)} · {a.createdBy?.name} · <Badge tone="info">{a.audience === 'all' ? 'Everyone' : cap(a.audience)}</Badge></small>
            <p style={{ margin: '.4rem 0 0', whiteSpace: 'pre-wrap' }}>{a.body}</p></div>)}
      </div>
      {open && <Modal title="New announcement" onClose={() => setOpen(false)}>
        <form onSubmit={post}>{err && <div className="error" role="alert">{err}</div>}
          <Field label="Title"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required maxLength={120} /></Field>
          <Field label="Message"><textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} required maxLength={1500} /></Field>
          <Field label="Audience"><select value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}><option value="all">Everyone</option><option value="employee">Employees only</option><option value="hr">HR and admins only</option></select></Field>
          <label className="row gap" style={{ marginBottom: '1rem' }}><input type="checkbox" checked={f.pinned} onChange={(e) => setF({ ...f, pinned: e.target.checked })} /> Pin to the top</label>
          <div className="row gap end"><button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn">Post announcement</button></div></form></Modal>}
      {del && <Confirm title="Delete this announcement?" message={`"${del.title}" will be removed for everyone.`} danger yesLabel="Delete" onYes={remove} onNo={() => setDel(null)} />}
    </>
  );
}
