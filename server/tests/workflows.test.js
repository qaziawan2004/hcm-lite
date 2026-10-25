// Run with: npm test   (uses an in-memory MongoDB, no setup needed)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { setEmailSenderForTests } from '../src/services/email.js';
import LoginChallenge from '../src/models/LoginChallenge.js';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
let mongod, api;
const tok = {};
const sentEmails = [];
const addDaysISO = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const nextWeekday = (n) => { let d = addDaysISO(n); while ([0, 6].includes(new Date(d + 'T00:00:00Z').getUTCDay())) d = addDaysISO(++n); return d; };
const latestOtp = (email) => {
  const mail = [...sentEmails].reverse().find((message) => message.to === email && message.subject.includes('sign-in code'));
  assert.ok(mail, `no sign-in code email sent to ${email}`);
  return mail.text.match(/code is (\d{6})/)?.[1];
};
const signIn = async (email, password) => {
  const start = await api.post('/api/auth/login').send({ email, password });
  assert.equal(start.status, 200);
  assert.equal(typeof start.body.token, 'undefined');
  return api.post('/api/auth/otp/verify').send({
    challengeId: start.body.challengeId,
    code: latestOtp(email),
  });
};
const as = (role) => ({ Authorization: `Bearer ${tok[role]}` });

before(async () => {
  setEmailSenderForTests(async (message) => { sentEmails.push(message); });
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const { default: createApp } = await import('../src/app.js');
  api = request(createApp());
});
after(async () => { await mongoose.disconnect(); await mongod.stop(); });

test('first-run setup creates admin, then locks', async () => {
  assert.equal((await api.get('/api/auth/setup-status')).body.needsSetup, true);
  const r = await api.post('/api/auth/setup').send({ companyName: 'T', name: 'Admin', email: 'a@t.com', password: 'Password1' });
  assert.equal(r.status, 201);
  assert.equal(typeof r.body.token, 'undefined');
  assert.ok(sentEmails.some((message) => message.to === 'a@t.com' && message.subject === 'Welcome to HCM Lite'));
  const verified = await api.post('/api/auth/otp/verify').send({ challengeId: r.body.challengeId, code: latestOtp('a@t.com') });
  assert.equal(verified.status, 200);
  tok.admin = verified.body.token;
  assert.equal((await api.post('/api/auth/setup').send({ companyName: 'T', name: 'X', email: 'x@t.com', password: 'Password1' })).status, 403);
});

test('login requires OTP; wrong codes trigger a replacement and codes cannot be replayed', async () => {
  assert.equal((await api.post('/api/auth/login').send({ email: 'a@t.com', password: 'wrong' })).status, 401);
  const u = await mongoose.connection.db.collection('users').findOne({ email: 'a@t.com' });
  assert.notEqual(u.password, 'Password1'); assert.match(u.password, /^\$2[aby]\$/);
  const start = await api.post('/api/auth/login').send({ email: 'a@t.com', password: 'Password1' });
  assert.equal(start.status, 200);
  assert.equal(typeof start.body.token, 'undefined');
  const challengeHash = crypto.createHash('sha256').update(start.body.challengeId).digest('hex');
  const storedChallenge = await LoginChallenge.findOne({ challengeHash }).select('+codeHash');
  assert.equal(storedChallenge.codeHash.length, 64);
  assert.notEqual(storedChallenge.codeHash, latestOtp('a@t.com'));
  const wrongCode = latestOtp('a@t.com') === '000000' ? '000001' : '000000';
  const wrong = await api.post('/api/auth/otp/verify').send({ challengeId: start.body.challengeId, code: wrongCode });
  assert.equal(wrong.status, 401);
  assert.match(wrong.body.message, /new verification code has been sent/i);
  const verified = await api.post('/api/auth/otp/verify').send({ challengeId: start.body.challengeId, code: latestOtp('a@t.com') });
  assert.equal(verified.status, 200);
  assert.equal(verified.body.user.role, 'admin');
  assert.equal((await api.post('/api/auth/otp/verify').send({ challengeId: start.body.challengeId, code: latestOtp('a@t.com') })).status, 410);
});

test('admin company lookup restores default department and designation options when company settings are missing', async () => {
  const Company = (await import('../src/models/Company.js')).default;
  await Company.deleteMany({});
  const response = await api.get('/api/company').set(as('admin'));
  assert.equal(response.status, 200);
  assert.equal(response.body.company.name, 'HCM Lite');
  assert.ok(response.body.company.departments.includes('Engineering'));
  assert.ok(response.body.company.designations.includes('Manager'));
});

test('OTP attempts are capped and invalidate the challenge', async () => {
  const start = await api.post('/api/auth/login').send({ email: 'a@t.com', password: 'Password1' });
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const actualCode = latestOtp('a@t.com');
    const wrongCode = String((Number(actualCode) + 1) % 1_000_000).padStart(6, '0');
    const response = await api.post('/api/auth/otp/verify').send({ challengeId: start.body.challengeId, code: wrongCode });
    assert.equal(response.status, attempt === 5 ? 429 : 401);
  }
  assert.equal((await api.post('/api/auth/otp/resend').send({ challengeId: start.body.challengeId })).status, 410);
});

test('OTP expiry and resend issue a fresh code', async () => {
  const start = await api.post('/api/auth/login').send({ email: 'a@t.com', password: 'Password1' });
  const challengeHash = crypto.createHash('sha256').update(start.body.challengeId).digest('hex');
  await LoginChallenge.updateOne({ challengeHash }, { codeExpiresAt: new Date(Date.now() - 1000), lastSentAt: new Date(Date.now() - 31000) });
  const expired = await api.post('/api/auth/otp/verify').send({ challengeId: start.body.challengeId, code: latestOtp('a@t.com') });
  assert.equal(expired.status, 410);
  assert.match(expired.body.message, /expired/i);
  const resent = await api.post('/api/auth/otp/resend').send({ challengeId: start.body.challengeId });
  assert.equal(resent.status, 200);
  assert.equal((await api.post('/api/auth/otp/verify').send({ challengeId: start.body.challengeId, code: latestOtp('a@t.com') })).status, 200);
});

test('admin creates HR and employee; HR cannot create admin/HR', async () => {
  const hr = await api.post('/api/employees').set(as('admin')).send({ name: 'HR', email: 'hr@t.com', role: 'hr', password: 'Password1' });
  assert.equal(hr.status, 201);
  assert.ok(sentEmails.some((message) => message.to === 'hr@t.com' && message.subject === 'Welcome to HCM Lite'));
  const hrLogin = await signIn('hr@t.com', 'Password1');
  assert.equal(hrLogin.body.user.role, 'hr');
  tok.hr = hrLogin.body.token;
  const emp = await api.post('/api/employees').set(as('hr')).send({ name: 'Emp', email: 'e@t.com', password: 'Password1' });
  assert.equal(emp.status, 201);
  assert.ok(sentEmails.some((message) => message.to === 'e@t.com' && message.subject === 'Welcome to HCM Lite'));
  const employeeLogin = await signIn('e@t.com', 'Password1');
  assert.equal(employeeLogin.body.user.role, 'employee');
  tok.emp = employeeLogin.body.token;
  tok.empId = emp.body.user._id;
  assert.equal((await api.post('/api/employees').set(as('hr')).send({ name: 'Bad', email: 'b@t.com', role: 'hr', password: 'Password1' })).status, 403);
});

test('employee list assigns IDs to legacy employees without IDs', async () => {
  const User = (await import('../src/models/User.js')).default;
  await User.create([
    { name: 'Legacy One', email: 'legacy-one@t.com', password: 'Password1' },
    { name: 'Legacy Two', email: 'legacy-two@t.com', password: 'Password1' },
  ]);

  try {
    const response = await api.get('/api/employees').set(as('admin'));
    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.items
        .filter((user) => user.email.startsWith('legacy-'))
        .map((user) => user.employeeId)
        .sort(),
      ['EMP-0004', 'EMP-0005']
    );
  } finally {
    await User.deleteMany({ email: { $in: ['legacy-one@t.com', 'legacy-two@t.com'] } });
  }
});

test('permissions: employee blocked from admin/HR endpoints, no token blocked', async () => {
  for (const [m, p] of [['get', '/api/employees'], ['get', '/api/audit-logs'], ['get', '/api/leaves'], ['post', '/api/payroll/run'], ['get', '/api/salary'], ['post', '/api/announcements'], ['put', '/api/company']])
    assert.equal((await api[m](p).set(as('emp'))).status, 403, `${m} ${p}`);
  assert.equal((await api.get('/api/employees')).status, 401);
  assert.equal((await api.get('/api/audit-logs').set(as('hr'))).status, 403);
  assert.equal((await api.get('/api/audit-logs').set(as('admin'))).status, 200);
});

test('attendance: single check-in per day, check-out requires check-in', async () => {
  assert.equal((await api.post('/api/attendance/check-out').set(as('emp'))).status, 400);
  assert.equal((await api.post('/api/attendance/check-in').set(as('emp'))).status, 201);
  assert.equal((await api.post('/api/attendance/check-in').set(as('emp'))).status, 409);
  assert.equal((await api.post('/api/attendance/check-out').set(as('emp'))).status, 200);
});

test('leave workflow: apply, overlap blocked, self-approval blocked, HR approves, balance deducted', async () => {
  const from = nextWeekday(3);
  assert.equal((await api.post('/api/leaves').set(as('emp')).send({
    type: 'annual', from: '2026-02-30', to: '2026-02-30', reason: 'Trip',
  })).status, 400);
  assert.equal((await api.post('/api/leaves').set(as('emp')).send({
    type: 'annual', from, to: from, reason: 123,
  })).status, 400);
  const apply = await api.post('/api/leaves').set(as('emp')).send({ type: 'annual', from, to: from, reason: 'Trip' });
  assert.equal(apply.status, 201);
  assert.equal((await api.post('/api/leaves').set(as('emp')).send({ type: 'annual', from, to: from, reason: 'Again' })).status, 409);
  assert.equal((await api.patch(`/api/leaves/${apply.body.leave._id}/decision`).set(as('emp')).send({ decision: 'approved' })).status, 403);
  assert.equal((await api.patch(`/api/leaves/${apply.body.leave._id}/decision`).set(as('hr')).send({ decision: 'approved' })).status, 200);
  assert.equal((await api.get('/api/leaves/balance').set(as('emp'))).body.balance.annual, 13);
  assert.equal((await api.patch(`/api/leaves/${apply.body.leave._id}/decision`).set(as('hr')).send({ decision: 'rejected' })).status, 409);
});

test('HR leave can only be approved by admin', async () => {
  const from = nextWeekday(10);
  const l = await api.post('/api/leaves').set(as('hr')).send({ type: 'casual', from, to: from, reason: 'Errand' });
  assert.equal((await api.patch(`/api/leaves/${l.body.leave._id}/decision`).set(as('hr')).send({ decision: 'approved' })).status, 403);
  assert.equal((await api.patch(`/api/leaves/${l.body.leave._id}/decision`).set(as('admin')).send({ decision: 'approved' })).status, 200);
});

test('salary → payroll → payslip PDF, employee sees only own and only once paid', async () => {
  const month = new Date().toISOString().slice(0, 7);
  assert.equal((await api.post('/api/salary').set(as('hr')).send({ userId: tok.empId, basic: 100000, effectiveFrom: '2020-01-01', allowances: [{ name: 'Rent', amount: 20000 }], deductions: [{ name: 'Tax', amount: 5000 }] })).status, 201);
  const effectiveFrom = new Date().toLocaleDateString('en-CA', { timeZone: process.env.APP_TZ || 'Asia/Karachi' });
  assert.equal((await api.post('/api/salary').set(as('hr')).send({ userId: tok.empId, basic: 500000, effectiveFrom })).status, 201);
  const currentSalary = await api.get('/api/salary').set(as('hr'));
  assert.equal(currentSalary.body.items.find((row) => row.user._id === tok.empId).salary.basic, 500000);
  const employeeSalary = await api.get('/api/salary/my').set(as('emp'));
  assert.equal(employeeSalary.body.salary.basic, 500000);
  const run = await api.post('/api/payroll/run').set(as('hr')).send({ month });
  assert.equal(run.status, 200); assert.equal(run.body.created, 1);
  const payroll = await api.get(`/api/payroll?month=${month}`).set(as('hr'));
  assert.equal(payroll.body.items[0].basic, 500000);
  assert.equal((await api.post('/api/payroll/run').set(as('hr')).send({ month })).body.created, 0);
  const id = payroll.body.items[0]._id;
  assert.ok(payroll.body.items[0].netPay > 0);
  const changedSalary = await api.post('/api/salary').set(as('hr')).send({
    userId: tok.empId, basic: 600000, effectiveFrom, allowances: [{ name: 'Bonus', amount: 25000 }],
  });
  assert.equal(changedSalary.status, 201);
  assert.equal(changedSalary.body.refreshedPayroll, 1);
  const refreshedPayroll = await api.get(`/api/payroll?month=${month}`).set(as('hr'));
  assert.equal(refreshedPayroll.body.items[0].basic, 600000);
  assert.equal(refreshedPayroll.body.items[0].allowances[0].amount, 25000);
  assert.equal(refreshedPayroll.body.items[0].gross, 625000);
  assert.ok(refreshedPayroll.body.items[0].netPay > payroll.body.items[0].netPay);
  const Payroll = (await import('../src/models/Payroll.js')).default;
  await Payroll.updateOne({ _id: id }, { basic: 50000, gross: 50000, netPay: 50000 });
  const reconciledPayroll = await api.get(`/api/payroll?month=${month}`).set(as('hr'));
  assert.equal(reconciledPayroll.body.items[0].basic, 600000);
  assert.equal((await api.get(`/api/payroll/${id}/payslip`).set(as('emp'))).status, 403);   // not paid yet
  assert.equal((await api.post('/api/payroll/mark-paid').set(as('hr')).send({ month })).status, 200);
  const pdf = await api.get(`/api/payroll/${id}/payslip`).set(as('emp'));
  assert.equal(pdf.status, 200); assert.match(pdf.headers['content-type'], /pdf/);
  const retroactiveSalary = await api.post('/api/salary').set(as('hr')).send({
    userId: tok.empId, basic: 700000, effectiveFrom,
  });
  assert.equal(retroactiveSalary.body.refreshedPayroll, 1);
  assert.equal((await api.get(`/api/payroll?month=${month}`).set(as('hr'))).body.items[0].basic, 700000);
  assert.equal((await api.get(`/api/payroll/${id}/payslip`).set(as('admin'))).status, 200);
  assert.equal((await api.get(`/api/payroll/${id}/payslip`).set(as('admin'))).status, 200);
  assert.equal((await api.get('/api/payroll/my').set(as('emp'))).body.items.length, 1);
});

test('announcements notify audience; audit log records actions', async () => {
  assert.equal((await api.post('/api/announcements').set(as('hr')).send({ title: 'Hi', body: 'Hello all' })).status, 201);
  const n = await api.get('/api/notifications').set(as('emp'));
  assert.ok(n.body.items.some((i) => i.title.includes('Announcement')));
  const logs = await api.get('/api/audit-logs?limit=100').set(as('admin'));
  for (const a of ['EMPLOYEE_CREATED', 'LEAVE_APPROVED', 'PAYROLL_RUN', 'ANNOUNCEMENT_CREATED']) assert.ok(logs.body.actions.includes(a), a);
});

test('dashboards compute from DB; AI leave draft works without API key', async () => {
  const d = await api.get('/api/dashboard').set(as('admin'));
  assert.equal(d.body.totalEmployees, 3); assert.equal(d.body.presentToday >= 1, true);
  assert.equal((await api.get('/api/dashboard').set(as('emp'))).body.role, 'employee');
  const hrDashboard = await api.get('/api/dashboard').set(as('hr'));
  assert.equal(hrDashboard.body.role, 'hr');
  assert.equal(Object.hasOwn(hrDashboard.body, 'totalEmployees'), false);
  assert.equal((await api.get('/api/attendance').set(as('hr'))).status, 403);
  assert.equal((await api.get('/api/attendance').set(as('admin'))).status, 200);
  const draft = await api.post('/api/ai/leave-draft').set(as('emp')).send({ text: 'I have a fever, need sick leave tomorrow' });
  assert.equal(draft.body.draft.type, 'sick');
  assert.equal((await api.post('/api/ai/chat').set(as('emp')).send({ messages: [{ role: 'user', content: 'hi' }] })).status, 503);
});
