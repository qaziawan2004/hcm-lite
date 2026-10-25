import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { errMsg } from '../api/client.js';
import { fmtDate, cap } from '../utils/format.js';

const LEAVE_INTENT = /\b(apply|request|need|want|take|book|going to take)\b.*\b(leave|day off|days off|off)\b|\b(sick|casual|annual|unpaid) leave\b/i;
const SUGGESTIONS = ['How many leave days do I have left?', 'What is the late arrival policy?', 'I need sick leave tomorrow'];

export default function ChatWidget() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [msgs, setMsgs] = useState([{ role: 'assistant', content: 'Hi! Ask me about your leave, attendance, payslips or HR policy. You can also say things like "I need 2 days of casual leave next Monday" and I\'ll fill in the form for you.' }]);
  const end = useRef(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, open]);

  const send = async (raw) => {
    const content = (raw ?? text).trim();
    if (!content || busy) return;
    setText(''); setBusy(true);
    const next = [...msgs, { role: 'user', content }];
    setMsgs(next);
    try {
      if (LEAVE_INTENT.test(content)) {
        const { data } = await api.post('/ai/leave-draft', { text: content });
        setMsgs([...next, { role: 'assistant', content: 'I drafted a leave request from that. Check the details, then open the form to review and submit it.', draft: data.draft }]);
      } else {
        const history = next.filter((m) => !m.draft).map(({ role, content: c }) => ({ role, content: c }));
        const { data } = await api.post('/ai/chat', { messages: history });
        setMsgs([...next, { role: 'assistant', content: data.reply }]);
      }
    } catch (e) { setMsgs([...next, { role: 'assistant', content: errMsg(e), error: true }]); }
    finally { setBusy(false); }
  };

  if (!open) return <button className="chat-fab" onClick={() => setOpen(true)}>Ask HR assistant</button>;
  return (
    <section className="chat" aria-label="HR assistant">
      <div className="chat-head"><strong>HR assistant</strong><button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close chat">✕</button></div>
      <div className="chat-body">
        {msgs.map((m, i) => m.draft ? (
          <div key={i} className="draft">
            <div>{m.content}</div>
            <dl><dt>Type</dt><dd>{cap(m.draft.type)}</dd><dt>From</dt><dd>{fmtDate(m.draft.from)}</dd><dt>To</dt><dd>{fmtDate(m.draft.to)}</dd><dt>Reason</dt><dd>{m.draft.reason}</dd></dl>
            <button className="btn accent sm" onClick={() => { setOpen(false); nav('/leaves?tab=apply', { state: { draft: m.draft } }); }}>Open pre-filled form</button>
          </div>
        ) : <div key={i} className={`msg ${m.role === 'user' ? 'user' : 'bot'}`} style={m.error ? { color: 'var(--bad)' } : null}>{m.content}</div>)}
        {busy && <div className="msg bot muted">Thinking…</div>}
        {msgs.length === 1 && <div className="chips">{SUGGESTIONS.map((s) => <button key={s} onClick={() => send(s)}>{s}</button>)}</div>}
        <div ref={end} />
      </div>
      <form className="chat-in" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your question…" aria-label="Message" maxLength={500} />
        <button className="btn" disabled={busy || !text.trim()}>Send</button>
      </form>
    </section>
  );
}
