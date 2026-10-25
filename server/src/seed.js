// Demo data: npm run seed  (wipes the database first!)
import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from './config/db.js';
import User from './models/User.js';
import Company from './models/Company.js';
import Attendance from './models/Attendance.js';
import Leave from './models/Leave.js';
import Salary from './models/Salary.js';
import Announcement from './models/Announcement.js';
import Notification from './models/Notification.js';
import AuditLog from './models/AuditLog.js';
import Payroll from './models/Payroll.js';
import { today, addDays, isWeekend, currentMonth } from './utils/dates.js';
import { runPayroll } from './services/payroll.js';

await connectDB();
await Promise.all([User, Company, Attendance, Leave, Salary, Announcement, Notification, AuditLog, Payroll].map((m) => m.deleteMany({})));
await Company.create({ name: 'Acme Technologies' });

const mk = (name, email, role, department, designation, n, pw) =>
  User.create({ name, email, role, department, designation, password: pw, employeeId: `EMP-${String(n).padStart(4, '0')}`, joinDate: '2025-01-15' });
const admin = await mk('Ayesha Khan', 'admin@hcmlite.com', 'admin', 'Management', 'Administrator', 1, 'Admin@1234');
const hr = await mk('Bilal Ahmed', 'hr@hcmlite.com', 'hr', 'Human Resources', 'HR Manager', 2, 'Hr@12345');
const emps = [
  await mk('Sara Malik', 'employee@hcmlite.com', 'employee', 'Engineering', 'Senior Associate', 3, 'Employee@123'),
  await mk('Hamza Ali', 'hamza@hcmlite.com', 'employee', 'Engineering', 'Associate', 4, 'Employee@123'),
  await mk('Noor Fatima', 'noor@hcmlite.com', 'employee', 'Finance', 'Associate', 5, 'Employee@123'),
  await mk('Usman Tariq', 'usman@hcmlite.com', 'employee', 'Sales', 'Manager', 6, 'Employee@123'),
  await mk('Zainab Raza', 'zainab@hcmlite.com', 'employee', 'Operations', 'Intern', 7, 'Employee@123'),
];
const all = [admin, hr, ...emps];
const basics = [180000, 140000, 120000, 90000, 85000, 130000, 45000];
for (const [i, u] of all.entries()) {
  await Salary.create({ user: u._id, basic: basics[i], effectiveFrom: '2025-01-01', createdBy: admin._id,
    allowances: [{ name: 'House rent', amount: Math.round(basics[i] * 0.4) }, { name: 'Transport', amount: 10000 }],
    deductions: [{ name: 'Income tax', amount: Math.round(basics[i] * 0.05) }, { name: 'Provident fund', amount: Math.round(basics[i] * 0.03) }] });
}
// ~45 days of attendance with some late / absent days
const t = today();
for (let d = addDays(t, -45); d <= t; d = addDays(d, 1)) {
  if (isWeekend(d)) continue;
  for (const [i, u] of all.entries()) {
    if (d === t && i % 3 === 2) continue;           // some haven't checked in yet today
    if ((d.charCodeAt(9) + i) % 11 === 0) continue;   // sporadic absences
    const late = (d.charCodeAt(9) + i) % 7 === 0;
    const inT = new Date(`${d}T${late ? '09:40' : '08:55'}:00+05:00`);
    const out = new Date(inT.getTime() + 9 * 36e5);
    await Attendance.create({ user: u._id, date: d, checkIn: inT, checkOut: d === t ? undefined : out, hours: d === t ? 0 : 9, status: late ? 'late' : 'present' });
  }
}
await Leave.create([
  { user: emps[0]._id, type: 'annual', from: addDays(t, 10), to: addDays(t, 12), days: 3, reason: 'Family trip', status: 'pending' },
  { user: emps[1]._id, type: 'sick', from: addDays(t, -20), to: addDays(t, -19), days: 2, reason: 'Fever', status: 'approved', reviewedBy: hr._id, reviewedAt: new Date() },
  { user: emps[2]._id, type: 'casual', from: addDays(t, 3), to: addDays(t, 3), days: 1, reason: 'Bank work', status: 'pending' },
]);
await User.updateOne({ _id: emps[1]._id }, { $inc: { 'leaveBalance.sick': -2 } });
await Announcement.create({ title: 'Welcome to HCM Lite', body: 'Check in daily from the dashboard and apply for leave from the Leaves page.', pinned: true, createdBy: hr._id });

const prev = (() => { const [y, m] = currentMonth().split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; })();
await runPayroll(prev, admin._id);
await Payroll.updateMany({ month: prev }, { status: 'paid', paidAt: new Date() });

console.log(`Seeded. Sign in with:
  admin@hcmlite.com / Admin@1234
  hr@hcmlite.com / Hr@12345
  employee@hcmlite.com / Employee@123`);
await mongoose.disconnect();
