import { Link } from 'react-router-dom';
import { useFetch } from '../hooks/useApi.js';
import Spinner from '../components/Spinner.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { formatDueDate } from '../lib/format.js';

export default function PatientDashboard() {
  const dash = useFetch('/dashboard');
  const plans = useFetch('/plans');

  if (dash.loading || plans.loading) return <Spinner full />;

  const error = dash.error || plans.error;
  if (error) return <div className="error-text">{error}</div>;

  const { summary, upcomingTasks } = dash.data;

  return (
    <div>
      <h1 className="page-title">Your treatment</h1>
      <p className="page-sub">Everything your care team has planned for you.</p>

      <div className="stat-row">
        <div className="glass stat">
          <div className="value">{summary.planCount}</div>
          <div className="label">Plans</div>
        </div>
        <div className="glass stat">
          <div className="value">{summary.progress}%</div>
          <div className="label">Overall progress</div>
        </div>
        <div className="glass stat">
          <div className="value">
            {summary.taskDone}/{summary.taskTotal}
          </div>
          <div className="label">Tasks done</div>
        </div>
      </div>

      <div className="card-grid" style={{ marginBottom: 32 }}>
        <div className="glass card stack">
          <h2 style={{ margin: 0 }}>Up next</h2>
          {upcomingTasks.length === 0 ? (
            <p className="muted">Nothing pending. Nice work!</p>
          ) : (
            upcomingTasks.map((t) => (
              <div key={t.id} className="task">
                <div className="task-body">
                  <div className="task-title">{t.title}</div>
                  <div className="task-meta">
                    <Link to={`/plans/${t.planId}`}>{t.planTitle}</Link>
                    {' · '}
                    {formatDueDate(t.dueDate)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <h2>Your plans</h2>
      {plans.data.plans.length === 0 ? (
        <div className="glass card">
          <p className="muted">No treatment plans have been assigned to you yet.</p>
        </div>
      ) : (
        <div className="stack">
          {plans.data.plans.map((plan) => (
            <Link key={plan.id} to={`/plans/${plan.id}`} className="glass card stack">
              <div className="row between">
                <strong>{plan.title}</strong>
                <StatusBadge status={plan.status} />
              </div>
              <div className="muted" style={{ fontSize: '0.85rem' }}>
                Dr. {plan.doctor.fullName.replace(/^Dr\.\s*/, '')}
              </div>
              <ProgressBar value={plan.progress} done={plan.taskDone} total={plan.taskTotal} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
