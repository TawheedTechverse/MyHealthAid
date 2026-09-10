import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client.js';
import Spinner from '../components/Spinner.jsx';

const emptyTask = () => ({ title: '', description: '', dueDate: '' });

export default function CreatePlan() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState(null);
  const [form, setForm] = useState({
    patientId: '',
    title: '',
    description: '',
    tasks: [emptyTask()],
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .get('/users/patients')
      .then((res) => setPatients(res.data.patients))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  if (!patients && !error) return <Spinner full />;

  function setTask(index, key, value) {
    setForm((f) => {
      const tasks = f.tasks.map((t, i) => (i === index ? { ...t, [key]: value } : t));
      return { ...f, tasks };
    });
  }

  function addTask() {
    setForm((f) => ({ ...f, tasks: [...f.tasks, emptyTask()] }));
  }

  function removeTask(index) {
    setForm((f) => ({ ...f, tasks: f.tasks.filter((_, i) => i !== index) }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!form.patientId) {
      setError('Please choose a patient.');
      return;
    }

    const payload = {
      patientId: Number(form.patientId),
      title: form.title.trim(),
      description: form.description.trim(),
      tasks: form.tasks
        .filter((t) => t.title.trim().length >= 2)
        .map((t) => ({
          title: t.title.trim(),
          description: t.description.trim(),
          dueDate: t.dueDate || null,
        })),
    };

    setSubmitting(true);
    try {
      const res = await api.post('/plans', payload);
      navigate(`/plans/${res.data.plan.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <div>
      <p className="page-sub">
        <Link to="/">&larr; Back to dashboard</Link>
      </p>
      <h1 className="page-title">New treatment plan</h1>
      <p className="page-sub">Assign a plan to a patient and outline their tasks.</p>

      {error && <div className="error-text">{error}</div>}

      <form onSubmit={handleSubmit} className="glass card">
        <label className="field">
          <span>Patient</span>
          <select
            value={form.patientId}
            onChange={(e) => setForm((f) => ({ ...f, patientId: e.target.value }))}
            required
          >
            <option value="">Select a patient…</option>
            {(patients || []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName} ({p.email})
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Plan title</span>
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            required
            minLength={2}
            placeholder="e.g. Post-op knee recovery"
          />
        </label>

        <label className="field">
          <span>Description</span>
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Goals, context, anything the patient should know."
          />
        </label>

        <div className="row between" style={{ marginBottom: 10 }}>
          <strong>Tasks</strong>
          <button type="button" className="btn btn-ghost btn-sm" onClick={addTask}>
            + Add task
          </button>
        </div>

        <div className="stack">
          {form.tasks.map((task, index) => (
            <div key={index} className="task stack" style={{ display: 'block' }}>
              <div className="row between">
                <span className="muted">Task {index + 1}</span>
                {form.tasks.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => removeTask(index)}
                  >
                    Remove
                  </button>
                )}
              </div>
              <label className="field">
                <span>Title</span>
                <input
                  value={task.title}
                  onChange={(e) => setTask(index, 'title', e.target.value)}
                  placeholder="e.g. Walk 1,000 steps"
                />
              </label>
              <div className="row" style={{ gap: 12 }}>
                <label className="field" style={{ flex: 2, minWidth: 180 }}>
                  <span>Notes (optional)</span>
                  <input
                    value={task.description}
                    onChange={(e) => setTask(index, 'description', e.target.value)}
                  />
                </label>
                <label className="field" style={{ flex: 1, minWidth: 150 }}>
                  <span>Due date (optional)</span>
                  <input
                    type="date"
                    value={task.dueDate}
                    onChange={(e) => setTask(index, 'dueDate', e.target.value)}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>

        <button className="btn btn-primary btn-block" disabled={submitting} style={{ marginTop: 18 }}>
          {submitting ? 'Creating…' : 'Create plan'}
        </button>
      </form>
    </div>
  );
}
