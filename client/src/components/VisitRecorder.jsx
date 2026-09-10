import { useState } from 'react';
import { api, errorMessage } from '../api/client.js';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition.js';

/**
 * Voice-dictation panel for creating a visit note. Live speech-to-text runs in
 * the browser; on save the transcript is sent to the API, which generates the
 * structured summary.
 *
 * @param {object} props
 * @param {number} [props.patientId]      fixed patient (e.g. from a plan)
 * @param {number} [props.planId]         link the note to this plan
 * @param {Array<{id:number, fullName:string, email:string}>} [props.patientOptions]
 *        when given (and no patientId), renders a patient picker
 * @param {boolean} props.summarizerConfigured
 * @param {(note: object) => void} props.onSaved
 */
export default function VisitRecorder({
  patientId,
  planId,
  patientOptions,
  summarizerConfigured,
  onSaved,
}) {
  const [text, setText] = useState('');
  const [selectedPatient, setSelectedPatient] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const { supported, listening, interim, error, start, stop } = useSpeechRecognition({
    onFinal: (chunk) => setText((t) => t + chunk),
  });

  const effectivePatientId = patientId ?? (selectedPatient ? Number(selectedPatient) : null);
  const canSave = text.trim().length >= 10 && effectivePatientId && !saving;

  async function handleSave() {
    setSaveError('');
    if (!effectivePatientId) {
      setSaveError('Choose a patient first.');
      return;
    }
    if (listening) stop();
    setSaving(true);
    try {
      const res = await api.post('/visit-notes', {
        patientId: effectivePatientId,
        planId: planId ?? null,
        transcript: text.trim(),
      });
      setText('');
      setSelectedPatient('');
      onSaved?.(res.data.note);
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="glass card stack recorder">
      <div className="row between">
        <strong>Voice visit note</strong>
        {supported ? (
          <button
            type="button"
            className={`btn btn-sm ${listening ? 'btn-ghost' : 'btn-primary'}`}
            onClick={listening ? stop : start}
          >
            {listening ? (
              <>
                <span className="rec-dot" /> Stop
              </>
            ) : (
              '● Record'
            )}
          </button>
        ) : null}
      </div>

      {!supported && (
        <p className="muted" style={{ margin: 0 }}>
          Live dictation needs Chrome or Edge. You can still type the note below and save it.
        </p>
      )}

      {error && <div className="error-text">{error}</div>}

      {patientOptions && !patientId && (
        <label className="field" style={{ margin: 0 }}>
          <span>Patient</span>
          <select
            value={selectedPatient}
            onChange={(e) => setSelectedPatient(e.target.value)}
          >
            <option value="">Select a patient…</option>
            {patientOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName} ({p.email})
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="field" style={{ margin: 0 }}>
        <span>Transcript {listening && <em className="muted">· listening…</em>}</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Press Record and speak, or type here. Edit freely before saving."
          rows={5}
        />
      </label>

      {interim && (
        <p className="muted" style={{ margin: 0, fontStyle: 'italic' }}>
          {interim}
        </p>
      )}

      {saveError && <div className="error-text">{saveError}</div>}

      <div className="row">
        <button className="btn btn-primary btn-sm" disabled={!canSave} onClick={handleSave}>
          {saving
            ? summarizerConfigured
              ? 'Saving & summarizing…'
              : 'Saving…'
            : summarizerConfigured
              ? 'Save & summarize'
              : 'Save transcript'}
        </button>
        {text && (
          <button
            className="btn btn-ghost btn-sm"
            disabled={saving}
            onClick={() => setText('')}
          >
            Clear
          </button>
        )}
      </div>

      {!summarizerConfigured && (
        <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>
          AI summary is off (no API key on the server). The transcript is saved and can be
          summarized later.
        </p>
      )}
    </div>
  );
}
