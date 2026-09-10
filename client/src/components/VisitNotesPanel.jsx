import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client.js';
import VisitRecorder from './VisitRecorder.jsx';
import VisitNoteCard from './VisitNoteCard.jsx';
import Spinner from './Spinner.jsx';

/**
 * Self-contained visit-notes area: recorder (for doctors) plus the list of
 * notes. Used on the doctor dashboard (all notes) and on a plan page (scoped).
 *
 * @param {object} props
 * @param {number} [props.planId]        scope notes to one plan and link new notes to it
 * @param {number} [props.patientId]     fix the patient for new notes
 * @param {Array}  [props.patientOptions] patient picker options when patientId is absent
 * @param {boolean} props.canRecord      true for the doctor
 */
export default function VisitNotesPanel({ planId, patientId, patientOptions, canRecord }) {
  const [notes, setNotes] = useState(null);
  const [configured, setConfigured] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const params = planId ? { planId } : {};
    Promise.all([
      api.get('/visit-notes', { params }),
      api.get('/visit-notes/config'),
    ])
      .then(([notesRes, cfgRes]) => {
        if (!active) return;
        setNotes(notesRes.data.notes);
        setConfigured(cfgRes.data.summarizerConfigured);
      })
      .catch((err) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [planId]);

  if (error) return <div className="error-text">{error}</div>;
  if (!notes) return <Spinner />;

  return (
    <div className="stack">
      {canRecord && (
        <VisitRecorder
          planId={planId}
          patientId={patientId}
          patientOptions={patientOptions}
          summarizerConfigured={configured}
          onSaved={(note) => setNotes((list) => [note, ...list])}
        />
      )}

      {notes.length === 0 ? (
        <p className="muted">No visit notes yet.</p>
      ) : (
        notes.map((note) => (
          <VisitNoteCard
            key={note.id}
            note={note}
            canEdit={canRecord}
            summarizerConfigured={configured}
            onChange={(updated) =>
              setNotes((list) => list.map((n) => (n.id === updated.id ? updated : n)))
            }
            onDelete={(id) => setNotes((list) => list.filter((n) => n.id !== id))}
          />
        ))
      )}
    </div>
  );
}
