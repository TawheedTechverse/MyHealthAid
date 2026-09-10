import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(
      `Missing required environment variable: ${name}\n` +
        'Create server/.env (copy server/.env.example) and set DATABASE_URL + JWT_SECRET.\n' +
        'See the README "Setup" section.',
    );
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required('DATABASE_URL'),
  pgSsl: String(process.env.PG_SSL).toLowerCase() === 'true',
  jwtSecret: required('JWT_SECRET', 'dev-only-insecure-secret'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  isProd: process.env.NODE_ENV === 'production',

  // Visit-note summarization (optional). When ANTHROPIC_API_KEY is unset the
  // feature still records transcripts; only the AI summary step is skipped.
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  summaryModel: process.env.SUMMARY_MODEL ?? 'claude-opus-5',
};
