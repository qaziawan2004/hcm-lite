# HCM Lite

Human Capital Management Lite: employees, attendance, leave, salaries, payroll, payslip PDFs, announcements, notifications, audit logs, and an AI assistant, with three roles (Admin, HR, Employee). MERN stack.

```
hcm-lite/
├── server/   Express + Mongoose API (JWT, bcrypt, RBAC, pdfkit, AI service)
└── client/   React (Vite) app
```

## Run locally

Requirements: Node 18+ and MongoDB (local, or a free MongoDB Atlas cluster).

```bash
# 1. API
cd server
cp .env.example .env        # set MONGODB_URI and JWT_SECRET (and ANTHROPIC_API_KEY for the AI chat)
npm install
npm run seed                # optional demo data (wipes the DB!)
npm run dev                 # http://localhost:5000

# 2. Frontend (new terminal)
cd client
cp .env.example .env        # set VITE_SHOW_DEMO=true to show demo logins on the sign-in page
npm install
npm run dev                 # http://localhost:5173
```

**Fresh setup (no seed):** open the app on an empty database. The sign-in page turns into "Set up your company" and creates the company plus the first admin. After that, the admin registers HR and employees.

**Demo accounts (after `npm run seed`):**

| Role | Email | Password |
|---|---|---|
| Admin | admin@hcmlite.com | Admin@1234 |
| HR | hr@hcmlite.com | Hr@12345 |
| Employee | employee@hcmlite.com | Employee@123 |

## Permissions (enforced on the server)

| Area | Admin | HR | Employee |
|---|---|---|---|
| Company setup | edit | view | view |
| Register / edit employees | all roles | employees only | no |
| Attendance check-in/out | yes | yes | yes |
| Attendance reports | all | all | own |
| Apply for leave | yes | yes | yes |
| Approve leave | everyone | employees only | no |
| Salary + run payroll | yes | yes | no |
| Delete unpaid payroll | yes | no | no |
| Payslips | all | all | own, once paid |
| Post announcements | yes | yes | no |
| Audit logs | yes | no | no |
| AI assistant | company-wide data | company-wide data | own data only |

Nobody can approve their own leave. HR and admin leave requests are approved by an admin.

## Business rules

- Leave counts working days only (Mon–Fri). No overlaps. Only sick leave can start in the past. Approval deducts balance; unpaid leave has no balance.
- Check-in after start time + grace minutes (Company setup) is "late". One check-in per day.
- Payroll per month: `gross = basic + allowances`; each unpaid day (absent days + unpaid leave) deducts `gross ÷ working days in month`; fixed deductions are subtracted; `net = gross − deductions`. Running payroll twice never duplicates rows. Public holidays are not modelled.
- Salaries are versioned by effective date; payroll uses the latest version in effect for the month.

## AI assistant

- Backed by the Anthropic Messages API (`ANTHROPIC_API_KEY`, model via `AI_MODEL`).
- **Data questions:** the server builds a role-scoped snapshot of real records (balances, attendance, leaves, payslips; plus company stats, pending requests and the employee directory for HR/admin) and the model answers only from it. Employees never receive other people's data. No individual salaries are sent to the model.
- **Policy questions:** answered from `server/src/services/policy.js`. Edit that file to match your company.
- **Dashboard summary:** button on the dashboard.
- **Leave drafts:** "I need sick leave tomorrow" returns a draft that opens the Leave form pre-filled. The AI never submits anything. This feature falls back to a rule-based parser if no API key is set.
- Rate limited to 20 requests/minute per IP.

## Deploy on Vercel

Deploy the frontend and API as **two separate Vercel projects** from this repository.

**Database:** Use MongoDB Atlas or another hosted MongoDB service. Add the Vercel deployment's outbound IP access as required by your database provider; if using Atlas without a fixed egress IP, configure its network access to allow Vercel connections.

### API project

1. Import the repository as a Vercel project and set **Root Directory** to `server`.
2. Use the Node.js runtime (Framework Preset: **Other**). No build command or start command is needed; Vercel deploys `api/[...path].js` as a catch-all serverless function.
3. Set these **Project Environment Variables** for Production (and Preview if needed):
   - `MONGODB_URI` — hosted MongoDB connection string
   - `JWT_SECRET` — long, random secret; keep it private
   - `CORS_ORIGIN` — exact frontend origin, such as `https://hcm-lite.vercel.app` (no trailing slash). Use comma-separated origins if you have more than one.
   - `APP_TZ` — e.g. `Asia/Karachi`
   - `ANTHROPIC_API_KEY` — optional; enables AI chat and dashboard summaries
   - `AI_MODEL` — optional; defaults to `claude-sonnet-5-5`
   - `JWT_EXPIRES_IN` — optional; defaults to the application default
4. Deploy, then verify `https://<your-api-domain>/api/health` returns `{"ok":true}`.

The API uses a Vercel serverless function and reuses the MongoDB connection while the function instance is warm. Vercel may scale functions down between requests, so the first request after idle can take longer.

### Frontend project

1. Import the same repository as another Vercel project and set **Root Directory** to `client`.
2. Use the Vite build (`npm run build`) and output directory `dist`.
3. Set `VITE_API_URL` to the API origin, e.g. `https://<your-api-domain>` (**no** trailing slash and **no** `/api` suffix). Set `VITE_SHOW_DEMO=true` only if demo-login buttons are desired.
4. Deploy or redeploy after setting environment variables; Vite embeds `VITE_API_URL` at build time.

The frontend's `vercel.json` includes SPA rewrites so direct navigation to app routes works. Set the API project's `CORS_ORIGIN` to the exact deployed frontend domain. If using Vercel Preview URLs, add each preview origin to `CORS_ORIGIN` and redeploy the API, or test against a stable custom frontend domain.

**For judges:** open the deployed frontend. On an empty database, the company setup screen creates the first admin. To preload demo data, run `npm run seed` from `server/` with the production `MONGODB_URI` set in your environment; this wipes the database first.

### Alternative: Render API

The root `render.yaml` remains available if you prefer a long-running API on Render. Deploy the frontend as above and set the Render API's `CORS_ORIGIN` to the frontend origin.

## Tests

```bash
cd server && npm install && npm test
```

Uses an in-memory MongoDB. Covers first-run setup, password hashing, role permissions on admin/HR endpoints, single check-in per day, the leave workflow (overlap, self-approval, HR vs admin approval, balance deduction), salary → payroll → payslip PDF access rules, announcements → notifications, audit log entries, dashboards and the AI leave-draft fallback.

## Manual test checklist

1. Fresh DB → set up company → sign in as admin. 2. Company setup: edit departments and work hours. 3. Register an HR user and two employees (copy the temporary passwords). 4. Employee: check in/out, apply for leave. 5. HR: approve it, check the employee's notification and balance. 6. Salaries: set pay for each person. 7. Payroll: run, mark as paid, download a PDF as HR and as the employee. 8. Post an announcement and check notifications. 9. Admin: open audit logs. 10. Employee: try opening `/employees` or `/audit` (blocked). 11. AI: ask "how many leave days do I have left?", click "Summarize my dashboard", and say "I need 2 days casual leave next Monday".

## API overview

`/api/auth` (setup, login, me, change-password) · `/api/company` · `/api/employees` · `/api/attendance` · `/api/leaves` · `/api/salary` · `/api/payroll` (run, mark-paid, payslip PDF) · `/api/announcements` · `/api/notifications` · `/api/audit-logs` · `/api/dashboard` · `/api/ai` (chat, summary, leave-draft) · `/api/health`
