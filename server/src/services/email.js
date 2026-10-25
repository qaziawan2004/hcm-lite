import nodemailer from 'nodemailer';
import { HttpError } from '../utils/http.js';

let transporter;
let testSender;

function getTransporter() {
  if (testSender && process.env.NODE_ENV === 'test') return testSender;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    throw new HttpError(503, 'Email delivery is not configured. Contact the administrator.');
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true' || Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });
  }
  return transporter;
}

export function ensureEmailConfigured() {
  getTransporter();
}

export async function sendEmail({ to, subject, text, html }) {
  const mailer = getTransporter();
  try {
    if (typeof mailer === 'function') return await mailer({ to, subject, text, html });

    return await mailer.sendMail({
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
      html,
    });
  } catch (error) {
    console.error('Email delivery failed:', error);
    throw new HttpError(502, 'Email delivery failed. Check the server SMTP settings and try again.');
  }
}

export function setEmailSenderForTests(sender) {
  if (process.env.NODE_ENV !== 'test') throw new Error('Test email sender is only available in tests.');
  testSender = sender;
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[char]));

export function sendWelcomeEmail(user) {
  const name = escapeHtml(user.name);
  return sendEmail({
    to: user.email,
    subject: 'Welcome to HCM Lite',
    text: `Hello ${user.name},\n\nYour HCM Lite account is ready. Sign in with the temporary password provided by your administrator and change it after signing in.`,
    html: `<p>Hello ${name},</p><p>Your HCM Lite account is ready. Sign in with the temporary password provided by your administrator and change it after signing in.</p>`,
  });
}
