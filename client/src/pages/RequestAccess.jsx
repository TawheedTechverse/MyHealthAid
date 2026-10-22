import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api/client.js';

export default function RequestAccess() {
  const [patient, setPatient] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('request'); // 'request' | 'verify' | 'done'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleRequest(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post('/access/request', { patient: patient.trim() });
      setStep('verify');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post('/access/verify', { patient: patient.trim(), code: code.trim() });
      setStep('done');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="page-sub">
        <Link to="/">&larr; Back to dashboard</Link>
      </p>
      <h1 className="page-title">Request patient access</h1>
      <p className="page-sub">
        For a patient you don&apos;t already treat. They&apos;ll get a 6-digit code by text
        message to approve it.
      </p>

      <div className="glass card stack" style={{ maxWidth: 480 }}>
        {step === 'request' && (
          <form onSubmit={handleRequest} className="stack">
            <label className="field">
              <span>Patient email or ID</span>
              <input
                value={patient}
                onChange={(e) => setPatient(e.target.value)}
                placeholder="patient@example.com"
                required
              />
            </label>
            {error && <div className="error-text">{error}</div>}
            <button className="btn btn-primary" disabled={busy || !patient.trim()}>
              {busy ? 'Sending…' : 'Send verification code'}
            </button>
          </form>
        )}

        {step === 'verify' && (
          <form onSubmit={handleVerify} className="stack">
            <p className="muted" style={{ margin: 0 }}>
              A 6-digit code was sent to the patient. Ask them for it, then enter it below. It
              expires in 10 minutes.
            </p>
            <label className="field">
              <span>Verification code</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                inputMode="numeric"
                maxLength={6}
                required
              />
            </label>
            {error && <div className="error-text">{error}</div>}
            <div className="row">
              <button className="btn btn-primary" disabled={busy || code.trim().length !== 6}>
                {busy ? 'Verifying…' : 'Verify'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => {
                  setStep('request');
                  setCode('');
                  setError('');
                }}
              >
                Start over
              </button>
            </div>
          </form>
        )}

        {step === 'done' && (
          <div className="stack">
            <p style={{ margin: 0 }}>
              Access granted. You now have 30 days of read access to this patient&apos;s plans
              and visit notes.
            </p>
            <Link to="/" className="btn btn-primary btn-block">
              Back to dashboard
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
