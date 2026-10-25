import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import Leave from '../models/Leave.js';
import Payroll from '../models/Payroll.js';
import Announcement from '../models/Announcement.js';
import Notification from '../models/Notification.js';
import { today, addDays, isWeekend, currentMonth, monthRange } from '../utils/dates.js';

export async function companyStats() {
  const date = today();
  const month = currentMonth();
  const { first, last } = monthRange(month);
  const [totalEmployees, byDept, presentToday, lateToday, onLeaveToday, pendingLeaves, payrollRows, leaveByType] = await Promise.all([
    User.countDocuments({ status: 'active' }),
    User.aggregate([{ $match: { status: 'active' } }, { $group: { _id: { $ifNull: ['$department', 'Unassigned'] }, count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Attendance.countDocuments({ date }),
    Attendance.countDocuments({ date, status: 'late' }),
    Leave.countDocuments({ status: 'approved', from: { $lte: date }, to: { $gte: date } }),
    Leave.countDocuments({ status: 'pending' }),
    Payroll.find({ month }),
    Leave.aggregate([{ $match: { status: 'approved', from: { $gte: `${date.slice(0, 4)}-01-01` } } }, { $group: { _id: '$type', days: { $sum: '$days' } } }]),
  ]);
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = addDays(date, -i); if (!isWeekend(d)) days.push(d); }
  const trend = await Promise.all(days.map(async (d) => ({ date: d.slice(5), present: await Attendance.countDocuments({ date: d }) })));
  const absentToday = isWeekend(date) ? 0 : Math.max(0, totalEmployees - presentToday - onLeaveToday);
  return {
    date, month, totalEmployees, presentToday, lateToday, onLeaveToday, absentToday, pendingLeaves,
    byDepartment: byDept.map((d) => ({ name: d._id || 'Unassigned', value: d.count })),
    attendanceTrend: trend,
    leaveByType: leaveByType.map((l) => ({ name: l._id, value: l.days })),
    payroll: { month, count: payrollRows.length, net: payrollRows.reduce((t, p) => t + p.netPay, 0), paid: payrollRows.filter((p) => p.status === 'paid').length },
    weekend: isWeekend(date), monthRange: { first, last },
  };
}

export async function employeeStats(user) {
  const date = today();
  const { first, last } = monthRange(currentMonth());
  const [todayRec, month, pending, latestPay, unread, upcoming] = await Promise.all([
    Attendance.findOne({ user: user._id, date }),
    Attendance.find({ user: user._id, date: { $gte: first, $lte: last } }),
    Leave.countDocuments({ user: user._id, status: 'pending' }),
    Payroll.findOne({ user: user._id, status: 'paid' }).sort({ month: -1 }),
    Notification.countDocuments({ user: user._id, read: false }),
    Leave.find({ user: user._id, status: 'approved', to: { $gte: date } }).sort({ from: 1 }).limit(3),
  ]);
  return {
    date, today: todayRec, monthPresent: month.length, monthLate: month.filter((m) => m.status === 'late').length,
    monthHours: Math.round(month.reduce((t, m) => t + m.hours, 0) * 10) / 10,
    leaveBalance: user.leaveBalance, pendingLeaves: pending, latestPayslip: latestPay, unreadNotifications: unread, upcomingLeaves: upcoming,
  };
}

export async function dashboardFor(user) {
  const announcements = await Announcement.find(user.role === 'employee' ? { audience: { $in: ['all', 'employee'] } } : {}).sort({ pinned: -1, createdAt: -1 }).limit(3).select('title body createdAt');
  if (user.role === 'employee') return { role: 'employee', ...(await employeeStats(user)), announcements };
  const [company, mine] = await Promise.all([companyStats(), employeeStats(user)]);
  return { role: user.role, ...company, mine, announcements };
}
