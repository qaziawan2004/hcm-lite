import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { protect } from '../middleware/auth.js';
import { HttpError, asyncHandler } from '../utils/http.js';
import { aiEnabled, chat, summarize, leaveDraft } from '../services/ai.js';
import { audit } from '../services/log.js';

const r = Router();
r.use(protect, rateLimit({ windowMs: 60 * 1000, limit: 20, skip: () => process.env.NODE_ENV === 'test', message: { message: 'Slow down — try again in a minute.' } }));

r.get('/status', (_req, res) => res.json({ enabled: aiEnabled() }));

const needAI = () => { if (!aiEnabled()) throw new HttpError(503, 'The AI assistant is not configured. Ask your admin to add a Gemini or Anthropic API key to the server environment.'); };

r.post('/chat', asyncHandler(async (req, res) => {
  needAI();
  const history = (Array.isArray(req.body.messages) ? req.body.messages : []).slice(-10)
    .filter((m) => ['user', 'assistant'].includes(m.role) && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  if (!history.length || history[history.length - 1].role !== 'user') throw new HttpError(400, 'Send a message first.');
  const reply = await chat(req.user, history);
  await audit(req, 'AI_CHAT', 'AI', null, history[history.length - 1].content.slice(0, 120));
  res.json({ reply });
}));

r.post('/summary', asyncHandler(async (req, res) => {
  needAI();
  const summary = await summarize(req.user);
  await audit(req, 'AI_SUMMARY', 'AI');
  res.json({ summary });
}));

// Works with or without an API key (rule-based fallback), never submits anything.
r.post('/leave-draft', asyncHandler(async (req, res) => {
  const text = String(req.body.text || '').trim();
  if (text.length < 3) throw new HttpError(400, 'Describe the leave you want, e.g. "sick leave tomorrow".');
  const out = await leaveDraft(req.user, text.slice(0, 500));
  await audit(req, 'AI_LEAVE_DRAFT', 'AI', null, out.source);
  res.json(out);
}));

export default r;
