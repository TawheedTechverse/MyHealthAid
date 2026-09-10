import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useFetch } from '../hooks/useApi.js';
import Spinner from '../components/Spinner.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { formatDueDate } from '../lib/format.js';

export default function PlanDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, setData, loading, error } = useFetch(`/plans/${id}`);

  const [busyTaskId, setBusyTaskId] = useState(null);
  const [actionError, setActionError] = useState('');
  const [newTask, setNewTask] = useState({ title: '', description: '', dueDate: '' });
  const [addingTask, setAddingTask] = useState(false);

  if (loading) return <Spinner full />;
  if (error) return <div className="error-text">{error}</div>;

  const plan = data.plan;
  const isDoctor = user.role === 'doctor';

  function applyPlan(updated) {
    setData({ plan: updated });
  }

  async function toggleTask(task) {
    setBusyTaskId(task.id);
    setActionError('');
    try {
      const res = await api.patch(`/tasks/${task.id}`, {
        status: task.status === 'done' ? 'pending' : 'done',
      });
      applyPlan(res.data.plan);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusyTaskId(null);
    }
  }

  async function deleteTask(task) {
    if (!window.confirm(`Delete task "${task.title}"?`)) return;
    setBusyTaskId(task.id);
    try {
      const res = await api.delete(`/tasks/${task.id}`);
      applyPlan(res.data.plan);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusyTaskId(null);
    }
  }

  async function addTask(e) {
    e.preventDefault();
    if (newTask.title.trim().length < 2) return;
    setAddingTask(true);
    setActionError('');
    try {
      const res = await api.post(`/plans/${plan.id}/tasks`, {
        title: newTask.title.trim(),
        description: newTask.description.trim(),
        dueDate: newTask.dueDate || null,
      });
      applyPlan(res.data.plan);
      setNewTask({ title: '', description: '', dueDate: '' });
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setAddingTask(false);
    }
  }

  async function changeStatus(status) {
    setActionError('');
    try {
      const res = await api.patch(`/plans/${plan.id}`, { status });
      applyPlan(res.data.plan);
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  async function deletePlan() {
    if (!window.confirm('Delete this entire plan and all its tasks?')) return;
    try {
      await api.delete(`/plans/${plan.id}`);
      navigate('/');
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  return (
    <div>
      <p className="page-sub">
        <Link to="/">&larr; Back to dashboard</Link>
      </p>

      <div className="glass card stack" style={{ marginBottom: 24 }}>
        <div className="row between">
          <h1 className="page-title" style={{ margin: 0 }}>
            {plan.title}
          </h1>
          <StatusBadge status={plan.status} />
        </div>
        {plan.description && <p style={{ margin: 0 }}>{plan.description}</p>}
        <div className="muted" style={{ fontSize: '0.88rem' }}>
          {isDoctor ? `Patient: ${plan.patient.fullName}` : `Doctor: ${plan.doctor.fullName}`}
        </div>
        <ProgressBar value={plan.progress} done={plan.taskDone} total={plan.taskTotal} />

        {isDoctor && (
          <div className="row" style={{ marginTop: 4 }}>
            {plan.status !== 'active' && (
              <button className="btn btn-ghost btn-sm" onClick={() => changeStatus('active')}>
                Mark active
              </button>
            )}
            {plan.status !== 'completed' && (
              <button className="btn btn-ghost btn-sm" onClick={() => changeStatus('completed')}>
                Mark completed
              </button>
            )}
            {plan.status !== 'archived' && (
              <button className="btn btn-ghost btn-sm" onClick={() => changeStatus('archived')}>
                Archive
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={deletePlan}>
              Delete plan
            </button>
          </div>
        )}
      </div>

      {actionError && <div className="error-text">{actionError}</div>}

      <h2>Tasks</h2>
      <div className="stack">
        {plan.tasks.length === 0 && (
          <div className="glass card">
            <p className="muted">No tasks yet.</p>
          </div>
        )}
        {plan.tasks.map((task) => (
          <div key={task.id} className={`glass task ${task.status === 'done' ? 'done' : ''}`}>
            <input
              type="checkbox"
              className="task-check"
              checked={task.status === 'done'}
              disabled={busyTaskId === task.id}
              onChange={() => toggleTask(task)}
              aria-label={`Mark "${task.title}" ${task.status === 'done' ? 'incomplete' : 'complete'}`}
            />
            <div className="task-body">
              <div className="task-title">{task.title}</div>
              {task.description && <div className="task-meta">{task.description}</div>}
              <div className="task-meta">{formatDueDate(task.dueDate)}</div>
            </div>
            {isDoctor && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => deleteTask(task)}
                disabled={busyTaskId === task.id}
              >
                Delete
              </button>
            )}
          </div>
        ))}
      </div>

      {isDoctor && (
        <form onSubmit={addTask} className="glass card stack" style={{ marginTop: 20 }}>
          <strong>Add a task</strong>
          <div className="row" style={{ gap: 12 }}>
            <input
              style={{ flex: 2, minWidth: 200 }}
              placeholder="Task title"
              value={newTask.title}
              onChange={(e) => setNewTask((t) => ({ ...t, title: e.target.value }))}
            />
            <input
              type="date"
              style={{ flex: 1, minWidth: 150 }}
              value={newTask.dueDate}
              onChange={(e) => setNewTask((t) => ({ ...t, dueDate: e.target.value }))}
            />
          </div>
          <input
            placeholder="Notes (optional)"
            value={newTask.description}
            onChange={(e) => setNewTask((t) => ({ ...t, description: e.target.value }))}
          />
          <button className="btn btn-primary" disabled={addingTask || newTask.title.trim().length < 2}>
            {addingTask ? 'Adding…' : 'Add task'}
          </button>
        </form>
      )}
    </div>
  );
}
