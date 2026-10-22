import { Link } from 'react-router-dom';
import { useFetch } from '../hooks/useApi.js';
import Spinner from '../components/Spinner.jsx';
import { formatDateTime } from '../lib/format.js';

const RECORD_LABEL = { plan: 'treatment plan', visit_note: 'visit note', access_grant: 'access' };
const ACTION_LABEL = { view: 'viewed', grant: 'was granted access', revoke: 'access revoked' };

export default function AuditLog() {
  const { data, loading, error } = useFetch('/access/audit');

  if (loading) return <Spinner full />;
  if (error) return <div className="error-text">{error}</div>;

  const { entries } = data;

  return (
    <div>
      <p className="page-sub">
        <Link to="/">&larr; Back to dashboard</Link>
      </p>
      <h1 className="page-title">Who viewed my records</h1>
      <p className="page-sub">
        Every time a doctor viewed one of your plans or visit notes, plus every access grant and
        revoke. Newest first. This log can&apos;t be edited or deleted by anyone.
      </p>

      {entries.length === 0 ? (
        <div className="glass card">
          <p className="muted">No activity yet.</p>
        </div>
      ) : (
        <div className="stack">
          {entries.map((e) => (
            <div key={e.id} className="glass card row between">
              <div>
                <strong>{e.doctor.fullName}</strong>{' '}
                <span className="muted">
                  {ACTION_LABEL[e.action] ?? e.action}
                  {e.action === 'view' ? ` your ${RECORD_LABEL[e.recordType] ?? e.recordType}` : ''}
                </span>
              </div>
              <div className="muted" style={{ fontSize: '0.85rem' }}>
                {formatDateTime(e.createdAt)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
