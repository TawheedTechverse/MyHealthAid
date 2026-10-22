import { config } from '../config/env.js';

export const isSmsConfigured = () =>
  Boolean(config.twilioAccountSid && config.twilioAuthToken && config.twilioFromNumber);

/**
 * Sends an SMS via Twilio if configured; otherwise logs it to the console so
 * the feature still works (and is testable) without live credentials.
 * @returns {Promise<{ sent: boolean }>}
 */
export async function sendSms(to, body) {
  if (!isSmsConfigured()) {
    console.log(`[sms] Twilio not configured - would send to ${to}: ${body}`);
    return { sent: false };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}/Messages.json`;
  const auth = Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString(
    'base64',
  );
  const params = new URLSearchParams({ To: to, From: config.twilioFromNumber, Body: body });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`[sms] Twilio error ${res.status}: ${text.slice(0, 300)}`);
    return { sent: false };
  }
  return { sent: true };
}
