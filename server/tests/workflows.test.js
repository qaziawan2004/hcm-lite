// Run with: npm test   (uses an in-memory MongoDB, no setup needed)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
let mongod, api;
const tok = {};
const addDaysISO = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const nextWeekday = (n) => { let d = addDaysISO(n); while ([0, 6].includes(new Date(d + 'T00:00:00Z').getUTCDay())) d = addDaysISO(++n); return d; };
const as = (role) => ({ Authorization: `Bearer ${tok[role]}` });

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const { default: createApp } = await import('../src/app.js');
  api = request(createApp());
});
after(async () => { await mongoose.disconnect(); await mongod.stop(); });

test('first-run setup creates admin, then locks', async () => {
  assert.equal((await api.get('/api/auth/setup-status')).body.needsSetup, true);
  const r = await api.post('/api/auth/setup').send({ companyName: 'T', name: 'Admin', email: 'a@t.com', password: 'Password1' });
  assert.equal(r.status, 201); tok.admin = r.body.token;
  assert.equal((await api.post('/api/auth/setup').send({ companyName: 'T', name: 'X', email: 'x@t.com', password: 'Password1' })).status, 403);
});

test('login rejects bad password; passwords are hashed', async () => {
  assert.equal((await api.post('/api/auth/login').send({ email: 'a@t.com', password: 'wrong' })).status, 401);
  const u = await mongoose.connection.db.collection('users').findOne({ email: 'a@t.com' });
  assert.notEqual(u.password, 'Password1'); assert.match(u.password, /^\$2[aby]\$/);
  assert.equal((await api.post('/api/auth/login').send({ email: 'a@t.com', password: 'Password1' })).body.user.role, 'admin');
});

test('admin creates HR and employee; HR cannot create admin/HR', async () => {
  const hr = await api.post('/api/employees').set(as('admin')).send({ name: 'HR', email: 'hr@t.com', role: 'hr', password: 'Password1' });
  assert.equal(hr.status, 201);
  const hrLogin = await api.post('/api/auth/login').send({ email: 'hr@t.com', password: 'Password1' });
  assert.equal(hrLogin.body.user.role, 'hr');
  tok.hr = hrLogin.body.token;
  const emp = await api.post('/api/employees').set(as('hr')).send({ name: 'Emp', email: 'e@t.com', password: 'Password1' });
  assert.equal(emp.status, 201);
  const employeeLogin = await api.post('/api/auth/login').send({ email: 'e@t.com', password: 'Password1' });
  assert.equal(employeeLogin.body.user.role, 'employee');
  tok.emp = employeeLogin.body.token;
  tok.empId = emp.body.user._id;
  assert.equal((await api.post('/api/employees').set(as('hr')).send({ name: 'Bad', email: 'b@t.com', role: 'hr', password: 'Password1' })).status, 403);
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
  const run = await api.post('/api/payroll/run').set(as('hr')).send({ month });
  assert.equal(run.status, 200); assert.equal(run.body.created, 1);
  assert.equal((await api.post('/api/payroll/run').set(as('hr')).send({ month })).body.created, 0);
  const list = await api.get(`/api/payroll?month=${month}`).set(as('hr'));
  const id = list.body.items[0]._id;
  assert.ok(list.body.items[0].netPay > 0);
  assert.equal((await api.get(`/api/payroll/${id}/payslip`).set(as('emp'))).status, 403);   // not paid yet
  assert.equal((await api.post('/api/payroll/mark-paid').set(as('hr')).send({ month })).status, 200);
  const pdf = await api.get(`/api/payroll/${id}/payslip`).set(as('emp'));
  assert.equal(pdf.status, 200); assert.match(pdf.headers['content-type'], /pdf/);
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
  const draft = await api.post('/api/ai/leave-draft').set(as('emp')).send({ text: 'I have a fever, need sick leave tomorrow' });
  assert.equal(draft.body.draft.type, 'sick');
  assert.equal((await api.post('/api/ai/chat').set(as('emp')).send({ messages: [{ role: 'user', content: 'hi' }] })).status, 503);
});
