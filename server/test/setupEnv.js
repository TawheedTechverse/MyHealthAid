// Preloaded (via `node --import`) before any test file or app code runs.
// Forces the real AI/SMS/email integrations off during tests, regardless of
// what's configured in server/.env, so the suite is fast, deterministic, and
// never makes real network calls. dotenv.config() (in src/config/env.js)
// does not override already-set variables, so these values win.
process.env.GEMINI_API_KEY = '';
process.env.TWILIO_ACCOUNT_SID = '';
process.env.SMTP_HOST = '';
