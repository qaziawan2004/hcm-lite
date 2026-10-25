const TZ = () => process.env.APP_TZ || 'Asia/Karachi';
// 'YYYY-MM-DD' in the company timezone
export const today = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: TZ() });
export const nowHHMM = (d = new Date()) => d.toLocaleTimeString('en-GB', { timeZone: TZ(), hour12: false, hour: '2-digit', minute: '2-digit' });
export const currentMonth = () => today().slice(0, 7);
const parse = (s) => new Date(`${s}T00:00:00Z`);
const fmt = (d) => d.toISOString().slice(0, 10);
export const isValidDate = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
  const date = parse(s);
  return !Number.isNaN(date.getTime()) && fmt(date) === s;
};
export const isValidMonth = (s) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s || '');
export const isWeekend = (s) => [0, 6].includes(parse(s).getUTCDay());
export const addDays = (s, n) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return fmt(d); };
export const monthRange = (m) => {
  const [y, mo] = m.split('-').map(Number);
  return { first: `${m}-01`, last: fmt(new Date(Date.UTC(y, mo, 0))) };
};
// Mon–Fri days between two dates, inclusive
export const workingDays = (from, to) => {
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (!isWeekend(d)) n++;
  return n;
};
export const minutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
