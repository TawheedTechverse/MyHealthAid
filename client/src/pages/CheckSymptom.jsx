import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api/client.js';
import { useFetch } from '../hooks/useApi.js';
import Spinner from '../components/Spinner.jsx';
import { formatDateTime } from '../lib/format.js';

const URGENCY_LABEL = { 'self-care': 'Self-care', 'see-gp': 'See your GP', urgent: 'Urgent' };

export default function CheckSymptom() {
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const history = useFetch('/symptom-checks');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setResult(null);
    setSubmitting(true);
    try {
      const res = await api.post('/symptom-checks', { input: input.trim() });
      setResult(res.data);
      setInput('');
      history.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <p className="page-sub">
        <Link to="/">&larr; Back to dashboard</Link>
      </p>
      <h1 className="page-title">Check a symptom</h1>
      <p className="page-sub">
        Describe what you're feeling in your own words. This is not a diagnosis — it only
        suggests how urgently to seek care, using your care plan and latest visit summary as
        context. Your treating doctor can see this check.
      </p>

      <form onSubmit={handleSubmit} className="glass card stack" style={{ marginBottom: 24 }}>
        <label className="field" style={{ margin: 0 }}>
          <span>What's going on?</span>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. I've had a mild headache since yesterday afternoon..."
            rows={4}
            required
            minLength={3}
          />
        </label>
        {error && <div className="error-text">{error}</div>}
        <button className="btn btn-primary" disabled={submitting || input.trim().length < 3}>
          {submitting ? 'Checking…' : 'Check symptom'}
        </button>
      </form>

      {result && (
        <div
          className={`glass card stack ${result.emergency ? 'emergency-banner' : ''}`}
          style={{ marginBottom: 24 }}
        >
          {result.emergency ? (
            <>
              <strong style={{ fontSize: '1.1rem' }}>
                Call Triple Zero (000) or go to the nearest emergency department.
              </strong>
              {result.emergency.lifeline && (
                <p style={{ margin: 0 }}>
                  If you are having thoughts of suicide or self-harm, you can also call{' '}
                  <strong>Lifeline on 13 11 14</strong>, 24/7.
                </p>
              )}
            </>
          ) : (
            <>
              <div className="row between">
                <strong>{URGENCY_LABEL[result.check.urgency]}</strong>
                <span className={`badge ${result.check.urgency === 'self-care' ? 'completed' : ''}`}>
                  {result.check.urgency}
                </span>
              </div>
              <p style={{ margin: 0 }}>{result.check.advice}</p>
              {result.check.reasons?.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {result.check.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      <h2>Your check history</h2>
      {history.loading ? (
        <Spinner />
      ) : history.error ? (
        <div className="error-text">{history.error}</div>
      ) : history.data.checks.length === 0 ? (
        <div className="glass card">
          <p className="muted">No checks yet.</p>
        </div>
      ) : (
        <div className="stack">
          {history.data.checks.map((c) => (
            <div key={c.id} className="glass card stack">
              <div className="row between">
                <span className="muted" style={{ fontSize: '0.85rem' }}>
                  {formatDateTime(c.createdAt)}
                </span>
                <span className={`badge ${c.urgency === 'self-care' ? 'completed' : ''}`}>
                  {c.urgency}
                </span>
              </div>
              <div className="muted" style={{ fontSize: '0.9rem' }}>
                {c.input}
              </div>
              <div>{c.advice}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
