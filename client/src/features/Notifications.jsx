import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import useApi from '../utils/useApi.js';
import { Empty, Loader, PageHeader } from '../components/ui.jsx';
import { fmtDateTime } from '../utils/format.js';

export default function Notifications() {
  const nav = useNavigate();
  const { data, loading, reload } = useApi('/notifications');
  const ping = () => window.dispatchEvent(new Event('notif-changed'));
  const open = async (n) => { if (!n.read) { await api.patch(`/notifications/${n._id}/read`); ping(); } if (n.link) nav(n.link); else reload(); };
  const readAll = async () => { await api.patch('/notifications/read-all'); ping(); reload(); };
  return (
    <>
      <PageHeader title="Notifications" sub={data ? `${data.unread} unread` : ''}><button className="btn ghost" onClick={readAll} disabled={!data?.unread}>Mark all as read</button></PageHeader>
      <div className="card" style={{ padding: 0 }}>
        {loading ? <Loader /> : !data.items.length ? <Empty title="You're all caught up">Leave decisions, announcements and payslips will show up here.</Empty> :
          data.items.map((n) => <div key={n._id} className={`notif ${n.read ? '' : 'unread'}`} onClick={() => open(n)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && open(n)}>
            <span className={`dot ${n.read ? 'read' : ''}`} /><div><strong>{n.title}</strong><div>{n.message}</div><small>{fmtDateTime(n.createdAt)}</small></div></div>)}
      </div>
    </>
  );
}
