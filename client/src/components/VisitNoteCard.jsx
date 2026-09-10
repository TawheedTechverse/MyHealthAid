import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api/client.js';
import { formatDateTime } from '../lib/format.js';

const FIELDS = [
  ['chiefComplaint', 'Chief complaint'],
  ['historyOfPresentIllness', 'History of present illness'],
  ['assessment', 'Assessment'],
  ['plan', 'Plan'],
  ['followUp', 'Follow-up'],
];

const EMPTY_SUMMARY = {
  chiefComplaint: '',
  historyOfPresentIllness: '',
  assessment: '',
  plan: '',
  followUp: '',
  medications: [],
};

export default function VisitNoteCard({ note, canEdit, summarizerConfigured, onChange, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(EMPTY_SUMMARY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const summary = note.summary;

  function startEdit() {
    setDraft({ ...EMPTY_SUMMARY, ...(summary || {}), medications: summary?.medications ?? [] });
    setError('');
    setEditing(true);
  }

  async function save() {
    setBusy(true);
    setError('');
    try {
      const res = await api.patch(`/visit-notes/${note.id}`, {
        summary: {
          ...draft,
          medications: draft.medications.filter((m) => m.name.trim()),
        },
      });
      onChange?.(res.data.note);
      setEditing(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    setBusy(true);
    setError('');
    try {
      const res = await api.post(`/visit-notes/${note.id}/summarize`);
      onChange?.(res.data.note);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm('Delete this visit note?')) return;
    setBusy(true);
    try {
      await api.delete(`/visit-notes/${note.id}`);
      onDelete?.(note.id);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="glass card stack visit-note">
      <div className="row between">
        <div className="muted" style={{ fontSize: '0.85rem' }}>
          {formatDateTime(note.createdAt)} · Dr. {note.doctor.fullName.replace(/^Dr\.\s*/, '')}
          {note.plan && (
            <>
              {' · '}
              <Link to={`/plans/${note.plan.id}`}>{note.plan.title}</Link>
            </>
          )}
        </div>
        <span className={`badge ${note.summaryStatus === 'ready' ? 'completed' : ''}`}>
          {note.summaryStatus === 'ready'
            ? 'summary'
            : note.summaryStatus === 'pending'
              ? 'summarizing'
              : note.summaryStatus === 'error'
                ? 'summary failed'
                : 'transcript only'}
        </span>
      </div>

      {error && <div className="error-text">{error}</div>}

      {/* ---- summary body ---- */}
      {note.summaryStatus === 'pending' && <p className="muted">Generating summary…</p>}

      {note.summaryStatus === 'error' && (
        <p className="muted">
          Summary could not be generated{note.summaryError ? `: ${note.summaryError}` : '.'}
        </p>
      )}

      {note.summaryStatus === 'ready' && summary && !editing && (
        <div className="stack" style={{ gap: 10 }}>
          {FIELDS.map(([key, label]) =>
            summary[key] ? (
              <div key={key}>
                <div className="note-label">{label}</div>
                <div>{summary[key]}</div>
              </div>
            ) : null,
          )}
          {summary.medications?.length > 0 && (
            <div>
              <div className="note-label">Medications</div>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {summary.medications.map((m, i) => (
                  <li key={i}>
                    <strong>{m.name}</strong>
                    {m.instruction ? ` — ${m.instruction}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ---- edit form ---- */}
      {editing && (
        <div className="stack">
          {FIELDS.map(([key, label]) => (
            <label key={key} className="field" style={{ margin: 0 }}>
              <span>{label}</span>
              <textarea
                rows={2}
                value={draft[key]}
                onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
              />
            </label>
          ))}
          <div>
            <div className="note-label">Medications</div>
            <div className="stack" style={{ gap: 8, marginTop: 6 }}>
              {draft.medications.map((m, i) => (
                <div key={i} className="row" style={{ gap: 8 }}>
                  <input
                    style={{ flex: 1, minWidth: 120 }}
                    placeholder="Name"
                    value={m.name}
                    onChange={(e) =>
                      setDraft((d) => {
                        const meds = d.medications.slice();
                        meds[i] = { ...meds[i], name: e.target.value };
                        return { ...d, medications: meds };
                      })
                    }
                  />
                  <input
                    style={{ flex: 2, minWidth: 140 }}
                    placeholder="Instruction"
                    value={m.instruction}
                    onChange={(e) =>
                      setDraft((d) => {
                        const meds = d.medications.slice();
                        meds[i] = { ...meds[i], instruction: e.target.value };
                        return { ...d, medications: meds };
                      })
                    }
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        medications: d.medications.filter((_, j) => j !== i),
                      }))
                    }
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    medications: [...d.medications, { name: '', instruction: '' }],
                  }))
                }
              >
                + Add medication
              </button>
            </div>
          </div>
          <div className="row">
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={save}>
              {busy ? 'Saving…' : 'Save summary'}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ---- transcript ---- */}
      <details className="transcript-toggle">
        <summary className="muted">Transcript</summary>
        <p style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{note.transcript}</p>
      </details>

      {/* ---- actions ---- */}
      {canEdit && !editing && (
        <div className="row">
          {note.summaryStatus === 'ready' && (
            <button className="btn btn-ghost btn-sm" onClick={startEdit} disabled={busy}>
              Edit summary
            </button>
          )}
          {summarizerConfigured && note.summaryStatus !== 'pending' && (
            <button className="btn btn-ghost btn-sm" onClick={regenerate} disabled={busy}>
              {note.summaryStatus === 'ready' || note.summaryStatus === 'error'
                ? 'Regenerate'
                : 'Summarize'}
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={remove} disabled={busy}>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
