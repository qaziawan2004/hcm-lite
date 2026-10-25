import User from '../models/User.js';
import Leave from '../models/Leave.js';
import Attendance from '../models/Attendance.js';
import Payroll from '../models/Payroll.js';
import Company from '../models/Company.js';
import policy from './policy.js';
import { companyStats, employeeStats } from './stats.js';
import { today, isValidDate, addDays } from '../utils/dates.js';

export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

export async function callLLM(system, messages, maxTokens = 700) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: process.env.AI_MODEL || 'claude-sonnet-5-5', max_tokens: maxTokens, system, messages }),
  });
  if (!res.ok) throw new Error(`AI request failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
}

/** Builds a role-scoped snapshot of REAL database records. Employees only ever receive their own data. */
export async function buildContext(user) {
  const company = await Company.findOne();
  const ctx = { today: today(), company: company && { name: company.name, workStart: company.workStart, workEnd: company.workEnd, graceMinutes: company.graceMinutes, currency: company.currency },
    you: { name: user.name, role: user.role, employeeId: user.employeeId, department: user.department, designation: user.designation, joinDate: user.joinDate } };
  const [stats, myLeaves, myAttendance, myPay] = await Promise.all([
    employeeStats(user),
    Leave.find({ user: user._id }).sort({ createdAt: -1 }).limit(10).select('type from to days status'),
    Attendance.find({ user: user._id }).sort({ date: -1 }).limit(10).select('date status hours'),
    Payroll.find({ user: user._id, status: 'paid' }).sort({ month: -1 }).limit(3).select('month gross totalDeductions netPay'),
  ]);
  ctx.yourData = { leaveBalance: stats.leaveBalance, monthPresent: stats.monthPresent, monthLate: stats.monthLate, todayCheckIn: stats.today?.checkIn || null,
    recentLeaves: myLeaves, recentAttendance: myAttendance, recentPayslips: myPay };
  if (['admin', 'hr'].includes(user.role)) {
    const s = await companyStats();
    const date = today();
    const [pending, onLeave, present, people] = await Promise.all([
      Leave.find({ status: 'pending' }).populate('user', 'name department').select('type from to days reason'),
      Leave.find({ status: 'approved', from: { $lte: date }, to: { $gte: date } }).populate('user', 'name'),
      Attendance.find({ date }).populate('user', 'name'),
      User.find({ status: 'active' }).select('name role department designation employeeId joinDate').limit(300),
    ]);
    ctx.companyData = { stats: { totalEmployees: s.totalEmployees, presentToday: s.presentToday, lateToday: s.lateToday, onLeaveToday: s.onLeaveToday, absentToday: s.absentToday,
      pendingLeaves: s.pendingLeaves, byDepartment: s.byDepartment, leaveDaysTakenThisYearByType: s.leaveByType, payrollThisMonth: s.payroll },
      pendingLeaveRequests: pending.map((l) => ({ employee: l.user?.name, department: l.user?.department, type: l.type, from: l.from, to: l.to, days: l.days, reason: l.reason })),
      onLeaveToday: onLeave.map((l) => l.user?.name), checkedInToday: present.map((a) => a.user?.name),
      employees: people.map((p) => ({ name: p.name, role: p.role, department: p.department, designation: p.designation, id: p.employeeId })) };
  }
  return ctx;
}

const SYSTEM = (role) => `You are the HCM Lite HR assistant inside a company HR web app. The person asking is a ${role}.
Rules:
- Answer ONLY from the DATA and POLICY below. If the answer is not in them, say you don't have that information. Never invent numbers, names or dates.
- ${role === 'employee' ? 'This user is an employee: you only have their own data. If they ask about other people or company-wide figures, politely say you can only share their own records.' : 'You may discuss company-wide figures included in DATA. Do not reveal individual salaries; none are provided.'}
- Be brief (under 150 words unless asked for more), friendly, and use plain language.
- If the user wants to apply for leave, tell them to describe it (e.g. "sick leave tomorrow for a fever") and you will pre-fill the form; you cannot submit it for them.`;

export async function chat(user, history) {
  const ctx = await buildContext(user);
  const system = `${SYSTEM(user.role)}\n\nPOLICY:\n${policy}\n\nDATA (live from the database, JSON):\n${JSON.stringify(ctx)}`;
  return callLLM(system, history);
}

export async function summarize(user) {
  const ctx = await buildContext(user);
  const system = `${SYSTEM(user.role)}\nTask: write a short dashboard summary for this user as 3-5 bullet points starting with "- ". Mention what needs attention first (e.g. pending approvals, late arrivals, low leave balance). Use only the DATA.\n\nDATA:\n${JSON.stringify(ctx)}`;
  return callLLM(system, [{ role: 'user', content: 'Summarize my dashboard.' }], 500);
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
/** Rule-based fallback used when no API key is set or the LLM output is invalid. */
export function parseLeaveFallback(text) {
  const t = text.toLowerCase();
  const type = /sick|ill|fever|doctor|unwell|flu|hospital/.test(t) ? 'sick' : /unpaid/.test(t) ? 'unpaid' : /casual|personal|errand/.test(t) ? 'casual' : 'annual';
  const base = today();
  const dow = new Date(`${base}T00:00:00Z`).getUTCDay();
  let from = base;
  if (/tomorrow/.test(t)) from = addDays(base, 1);
  else if (/day after tomorrow/.test(t)) from = addDays(base, 2);
  else if (/next week/.test(t)) from = addDays(base, ((8 - dow) % 7) || 7);
  else { const i = WEEKDAYS.findIndex((w) => t.includes(w)); if (i >= 0) from = addDays(base, ((i - dow + 7) % 7) || 7); }
  const iso = t.match(/\d{4}-\d{2}-\d{2}/g);
  if (iso) from = iso[0];
  const n = t.match(/(\d+)\s*days?/);
  const to = iso && iso[1] ? iso[1] : addDays(from, n ? Math.max(0, parseInt(n[1]) - 1) : 0);
  return { type, from, to, reason: text.trim().slice(0, 200) };
}

export async function leaveDraft(user, text) {
  let draft = null; let source = 'fallback';
  if (aiEnabled()) {
    try {
      const d = new Date(`${today()}T00:00:00Z`);
      const system = `Convert the employee's leave request into JSON. Today is ${today()} (${WEEKDAYS[d.getUTCDay()]}). Leave types: annual, sick, casual, unpaid (choose sick for illness, casual for short personal matters, annual for holidays/vacations). Dates must be YYYY-MM-DD; "to" is the last day of leave (same as "from" for one day). Reply with ONLY a JSON object: {"type":"...","from":"YYYY-MM-DD","to":"YYYY-MM-DD","reason":"short reason in the employee's words"}.`;
      const out = await callLLM(system, [{ role: 'user', content: text }], 300);
      const parsed = JSON.parse(out.replace(/```json|```/g, '').trim());
      if (['annual', 'sick', 'casual', 'unpaid'].includes(parsed.type) && isValidDate(parsed.from) && isValidDate(parsed.to) && parsed.to >= parsed.from) { draft = parsed; source = 'ai'; }
    } catch (e) { console.error('leave draft AI error:', e.message); }
  }
  return { draft: draft || parseLeaveFallback(text), source };
}
