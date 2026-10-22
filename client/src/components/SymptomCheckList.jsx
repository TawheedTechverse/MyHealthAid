import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client.js';
import Spinner from './Spinner.jsx';
import { formatDateTime } from '../lib/format.js';

/** Read-only list of a patient's symptom checks, for the treating doctor's view. */
export default function SymptomCheckList({ patientId }) {
  const [checks, setChecks] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api
      .get('/symptom-checks', { params: { patientId } })
      .then((res) => active && setChecks(res.data.checks))
      .catch((err) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [patientId]);

  if (error) return <div className="error-text">{error}</div>;
  if (!checks) return <Spinner />;
  if (checks.length === 0) {
    return (
      <div className="glass card">
        <p className="muted">No symptom checks yet.</p>
      </div>
    );
  }

  return (
    <div className="stack">
      {checks.map((c) => (
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
  );
}
