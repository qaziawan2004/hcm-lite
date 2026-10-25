# HCM Lite

Human Capital Management Lite: employees, attendance, leave, salaries, payroll, payslip PDFs, announcements, notifications, audit logs, and an AI assistant, with three roles (Admin, HR, Employee). MERN stack.

```
hcm-lite/
├── server/   Express + Mongoose API (JWT, bcrypt, RBAC, pdfkit, AI service)
└── client/   React (Vite) app
```

## Run locally

Requirements: Node 20+ and MongoDB (local, or a free MongoDB Atlas cluster).

```bash
# 1. API
cd server
cp .env.example .env        # set MONGODB_URI, JWT_SECRET, and SMTP settings (ANTHROPIC_API_KEY is optional)
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

### Email verification and two-step sign-in

New company admins and employee accounts receive a welcome email. Every password sign-in (including the initial company setup) sends a six-digit code to the account email; the user must enter it on the verification page before a JWT session is created. Codes expire after one minute, are stored as keyed hashes, and are limited to five attempts. An incorrect code triggers a replacement email; the verification page also supports requesting a new code.

Configure SMTP on the **server** deployment using `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM` (optional; defaults to `SMTP_USER`). Use an app password where required by the email provider. `SMTP_SECURE` is normally `true` for port 465 and `false` for port 587. Account creation and sign-in verification require working SMTP configuration.

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

Deploy the frontend and API together as **one Vercel project** so the app and `/api` use the same live origin. The repository-root `vercel.json` builds the Vite client and routes API requests to the Express serverless function.

**Database:** Use MongoDB Atlas or another hosted MongoDB service. Configure its network access to allow connections from Vercel.

1. Use Node.js 20 or newer for the server runtime. Vercel can configure the runtime under Project Settings.
2. In Vercel, import this repository. For the existing frontend project, change **Root Directory** from `client` to the repository root (`.`). Do not deploy this setup with `client` as the root directory.
3. Use the Node.js runtime. The root `package.json` manages both workspaces; Vercel uses `npm run build` and `client/dist` as the output directory from `vercel.json`.
4. Add these **Project Environment Variables** for Production (and Preview if needed):
   - `MONGODB_URI` — hosted MongoDB connection string
   - `JWT_SECRET` — long, random secret; keep it private
   - `APP_TZ` — e.g. `Asia/Karachi`
   - `ANTHROPIC_API_KEY` — optional; enables AI chat and dashboard summaries
   - `AI_MODEL` — optional; defaults to `claude-sonnet-5-5`
   - `JWT_EXPIRES_IN` — optional; defaults to the application default
   - `VITE_SHOW_DEMO` — optional; set to `true` only if demo-login buttons are desired
5. Leave `VITE_API_URL` unset or empty. The frontend uses `/api` on its own domain. `CORS_ORIGIN` is optional for this single-domain setup; Vercel deployment and production domains are allowed automatically. If you add another frontend origin, list it in `CORS_ORIGIN`.
6. Add the SMTP settings below for welcome messages and sign-in verification, then redeploy. Verify `https://<your-live-domain>/api/health` returns `{"ok":true}` and `/api/auth/setup-status` returns JSON containing `needsSetup`.

The API uses a Vercel serverless function and reuses the MongoDB connection while the function instance is warm. Vercel may scale functions down between requests, so the first request after idle can take longer.

On an empty database, the sign-in page becomes **Set up your company** and creates the first admin. To preload demo data, run `npm run seed --workspace hcm-lite-server` with the production `MONGODB_URI` set in your environment; this wipes the database first.

For separate frontend and API Vercel projects:

1. Deploy the frontend with **Root Directory** `client`, build command `npm run build`, and output directory `dist`. Set `VITE_API_URL` to the API deployment origin without a trailing slash or `/api`, then redeploy the frontend.
2. Deploy the API with **Root Directory** `server` and Node.js 20 or newer. Configure `MONGODB_URI`, `JWT_SECRET`, and `CORS_ORIGIN` (the exact frontend origin, including `https://`; comma-separate origins if needed).
3. Add `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and optionally `EMAIL_FROM` to the API project's environment variables. Configure the values for Production and Preview as needed, then redeploy both projects.

### Alternative: Render API

The root `render.yaml` remains available if you prefer a long-running API on Render. Deploy the frontend separately and set the Render API's `CORS_ORIGIN` to the frontend origin.

## Tests

```bash
cd server && npm install && npm test
```

Uses an in-memory MongoDB. Covers first-run setup, password hashing, role permissions on admin/HR endpoints, single check-in per day, the leave workflow (overlap, self-approval, HR vs admin approval, balance deduction), salary → payroll → payslip PDF access rules, announcements → notifications, audit log entries, dashboards and the AI leave-draft fallback.

## Manual test checklist

1. Fresh DB → set up company → sign in as admin. 2. Company setup: edit departments and work hours. 3. Register an HR user and two employees (copy the temporary passwords). 4. Employee: check in/out, apply for leave. 5. HR: approve it, check the employee's notification and balance. 6. Salaries: set pay for each person. 7. Payroll: run, mark as paid, download a PDF as HR and as the employee. 8. Post an announcement and check notifications. 9. Admin: open audit logs. 10. Employee: try opening `/employees` or `/audit` (blocked). 11. AI: ask "how many leave days do I have left?", click "Summarize my dashboard", and say "I need 2 days casual leave next Monday".

## API overview

`/api/auth` (setup, login, me, change-password) · `/api/company` · `/api/employees` · `/api/attendance` · `/api/leaves` · `/api/salary` · `/api/payroll` (run, mark-paid, payslip PDF) · `/api/announcements` · `/api/notifications` · `/api/audit-logs` · `/api/dashboard` · `/api/ai` (chat, summary, leave-draft) · `/api/health`
