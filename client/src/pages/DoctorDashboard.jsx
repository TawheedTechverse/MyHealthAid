import { Link } from 'react-router-dom';
import { useFetch } from '../hooks/useApi.js';
import Spinner from '../components/Spinner.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

export default function DoctorDashboard() {
  const dash = useFetch('/dashboard');
  const plans = useFetch('/plans');

  if (dash.loading || plans.loading) return <Spinner full />;

  const error = dash.error || plans.error;
  if (error) return <div className="error-text">{error}</div>;

  const { summary, patients } = dash.data;

  return (
    <div>
      <div className="row between">
        <div>
          <h1 className="page-title">Doctor dashboard</h1>
          <p className="page-sub">Track every patient&apos;s progress at a glance.</p>
        </div>
        <Link to="/plans/new" className="btn btn-primary">
          + New treatment plan
        </Link>
      </div>

      <div className="stat-row">
        <div className="glass stat">
          <div className="value">{summary.patientCount}</div>
          <div className="label">Patients</div>
        </div>
        <div className="glass stat">
          <div className="value">{summary.planCount}</div>
          <div className="label">Plans</div>
        </div>
        <div className="glass stat">
          <div className="value">{summary.activePlanCount}</div>
          <div className="label">Active plans</div>
        </div>
      </div>

      <h2 style={{ marginTop: 8 }}>Patients</h2>
      {patients.length === 0 ? (
        <div className="glass card">
          <p className="muted">
            No patients yet. Create a treatment plan to get started.
          </p>
        </div>
      ) : (
        <div className="card-grid">
          {patients.map((p) => (
            <div key={p.id} className="glass card stack">
              <div>
                <strong>{p.fullName}</strong>
                <div className="muted" style={{ fontSize: '0.85rem' }}>
                  {p.email}
                </div>
              </div>
              <ProgressBar value={p.progress} done={p.taskDone} total={p.taskTotal} />
              <div className="muted" style={{ fontSize: '0.85rem' }}>
                {p.planCount} plan{p.planCount === 1 ? '' : 's'}
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 style={{ marginTop: 32 }}>All plans</h2>
      <div className="stack">
        {plans.data.plans.map((plan) => (
          <Link key={plan.id} to={`/plans/${plan.id}`} className="glass card row between">
            <div>
              <strong>{plan.title}</strong>
              <div className="muted" style={{ fontSize: '0.85rem' }}>
                {plan.patient.fullName}
              </div>
            </div>
            <div className="row">
              <StatusBadge status={plan.status} />
              <div style={{ width: 140 }}>
                <ProgressBar
                  value={plan.progress}
                  done={plan.taskDone}
                  total={plan.taskTotal}
                />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
