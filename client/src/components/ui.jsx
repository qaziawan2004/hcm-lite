import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, kind = 'ok') => {
    const id = Math.random();
    setItems((s) => [...s, { id, message, kind }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.message}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose} aria-label="Close">✕</button></div>
        {children}
      </div>
    </div>
  );
}

const TONES = { approved: 'good', paid: 'good', active: 'good', present: 'good', pending: 'warn', late: 'warn', generated: 'warn', rejected: 'bad', inactive: 'bad', cancelled: 'mute', admin: 'info', hr: 'info', employee: 'mute' };
export const Badge = ({ children, tone }) => <span className={`badge ${tone || TONES[String(children).toLowerCase()] || 'mute'}`}>{children}</span>;

export const Field = ({ label, hint, children }) => (
  <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
);

export const PageHeader = ({ title, sub, children }) => (
  <div className="page-head"><div><h1>{title}</h1>{sub && <p className="muted">{sub}</p>}</div><div className="row gap">{children}</div></div>
);

export const Stat = ({ label, value, tone, sub }) => (
  <div className={`stat ${tone || ''}`}><div className="stat-value">{value}</div><div className="stat-label">{label}</div>{sub && <small className="muted">{sub}</small>}</div>
);

export const Empty = ({ title, children }) => <div className="empty"><strong>{title}</strong>{children && <p className="muted">{children}</p>}</div>;
export const Loader = () => <div className="loader" role="progressbar" aria-label="Loading"><span /></div>;

export function Pager({ page, pages, onChange }) {
  if (!pages || pages <= 1) return null;
  return (
    <div className="pager">
      <button className="btn ghost sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</button>
      <span className="muted">Page {page} of {pages}</span>
      <button className="btn ghost sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next</button>
    </div>
  );
}

export function Confirm({ title, message, onYes, onNo, yesLabel = 'Confirm', danger }) {
  return (
    <Modal title={title} onClose={onNo}>
      <p>{message}</p>
      <div className="row gap end"><button className="btn ghost" onClick={onNo}>Cancel</button><button className={`btn ${danger ? 'danger' : ''}`} onClick={onYes}>{yesLabel}</button></div>
    </Modal>
  );
}
