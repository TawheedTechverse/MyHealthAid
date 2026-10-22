import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api/client.js';
import { useFetch } from '../hooks/useApi.js';
import Spinner from '../components/Spinner.jsx';
import { formatDateTime } from '../lib/format.js';

export default function AccessGrants() {
  const { data, setData, loading, error, reload } = useFetch('/access/grants');

  async function revoke(id) {
    if (!window.confirm('Revoke this doctor’s access to your records?')) return;
    try {
      await api.post(`/access/grants/${id}/revoke`);
      setData((d) => ({
        grants: d.grants.map((g) => (g.id === id ? { ...g, active: false, revokedAt: new Date() } : g)),
      }));
    } catch (err) {
      window.alert(errorMessage(err));
      reload();
    }
  }

  if (loading) return <Spinner full />;
  if (error) return <div className="error-text">{error}</div>;

  const { grants } = data;

  return (
    <div>
      <p className="page-sub">
        <Link to="/">&larr; Back to dashboard</Link>
      </p>
      <h1 className="page-title">Doctor access</h1>
      <p className="page-sub">
        Doctors who have verified access to your plans and visit notes beyond your own care
        team. Access expires automatically after 30 days, or you can revoke it now.{' '}
        <Link to="/access/audit">Who viewed my records &rarr;</Link>
      </p>

      {grants.length === 0 ? (
        <div className="glass card">
          <p className="muted">No doctor has requested access to your records yet.</p>
        </div>
      ) : (
        <div className="stack">
          {grants.map((g) => (
            <div key={g.id} className="glass card row between">
              <div>
                <strong>{g.doctor.fullName}</strong>
                <div className="muted" style={{ fontSize: '0.85rem' }}>
                  {g.doctor.email}
                </div>
                <div className="muted" style={{ fontSize: '0.8rem' }}>
                  Granted {formatDateTime(g.grantedAt)} · Expires {formatDateTime(g.expiresAt)}
                </div>
              </div>
              <div className="row">
                <span className={`badge ${g.active ? 'completed' : 'archived'}`}>
                  {g.active ? 'Active' : g.revokedAt ? 'Revoked' : 'Expired'}
                </span>
                {g.active && (
                  <button className="btn btn-ghost btn-sm" onClick={() => revoke(g.id)}>
                    Revoke
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
