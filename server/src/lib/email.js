import nodemailer from 'nodemailer';
import { config } from '../config/env.js';

export const isSmtpConfigured = () =>
  Boolean(config.smtpHost && config.smtpUser && config.smtpPass);

let transporter;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpPort === 465,
      auth: { user: config.smtpUser, pass: config.smtpPass },
    });
  }
  return transporter;
}

/** Sends an email with a PDF attachment. Throws on failure - callers handle retries. */
export async function sendPdfEmail({ to, subject, text, pdfBuffer, filename }) {
  await getTransporter().sendMail({
    from: config.smtpFrom || config.smtpUser,
    to,
    subject,
    text,
    attachments: [{ filename, content: pdfBuffer }],
  });
}
