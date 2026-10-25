
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import auth from './routes/auth.js';
import company from './routes/company.js';
import employees from './routes/employees.js';
import attendance from './routes/attendance.js';
import leaves from './routes/leaves.js';
import salary from './routes/salary.js';
import payroll from './routes/payroll.js';
import announcements from './routes/announcements.js';
import notifications from './routes/notifications.js';
import audit from './routes/audit.js';
import dashboard from './routes/dashboard.js';
import ai from './routes/ai.js';

import { notFound, errorHandler } from './middleware/error.js';

export default function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());

  const origins = (
    process.env.CORS_ORIGIN || 'http://localhost:5173'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin: (origin, callback) => {
        if (
          !origin ||
          origins.includes('*') ||
          origins.includes(origin)
        ) {
          return callback(null, true);
        }

        return callback(
          new Error(`Origin not allowed by CORS: ${origin}`)
        );
      },
      exposedHeaders: ['Content-Disposition'],
    })
  );

  app.use(express.json({ limit: '100kb' }));

  if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('tiny'));
  }

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/auth', auth);
  app.use('/api/company', company);
  app.use('/api/employees', employees);
  app.use('/api/attendance', attendance);
  app.use('/api/leaves', leaves);
  app.use('/api/salary', salary);
  app.use('/api/payroll', payroll);
  app.use('/api/announcements', announcements);
  app.use('/api/notifications', notifications);
  app.use('/api/audit-logs', audit);
  app.use('/api/dashboard', dashboard);
  app.use('/api/ai', ai);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
