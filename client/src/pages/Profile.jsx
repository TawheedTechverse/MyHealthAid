import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function Profile() {
  const { user, setUser } = useAuth();
  const [regNumber, setRegNumber] = useState(user.medicalRegistrationNumber ?? '');
  const [phone, setPhone] = useState(user.phone ?? '');
  const [allergies, setAllergies] = useState(user.allergies ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaved(false);
    setSaving(true);
    try {
      const body =
        user.role === 'doctor'
          ? { medicalRegistrationNumber: regNumber }
          : { phone, allergies };
      const res = await api.patch('/auth/profile', body);
      setUser(res.data.user);
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <p className="page-sub">
        <Link to="/">&larr; Back to dashboard</Link>
      </p>
      <h1 className="page-title">Your profile</h1>

      <div className="glass card stack" style={{ maxWidth: 480 }}>
        <div>
          <strong>{user.fullName}</strong>
          <div className="muted" style={{ fontSize: '0.85rem' }}>
            {user.email}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {user.role === 'doctor' ? (
            <>
              <label className="field">
                <span>Medical registration number</span>
                <input
                  value={regNumber}
                  onChange={(e) => setRegNumber(e.target.value)}
                  placeholder="e.g. MED0001234567"
                  required
                />
              </label>
              <p className="muted" style={{ fontSize: '0.8rem', marginTop: -8 }}>
                3 letters followed by 10 digits. Required before you can sign visit notes.{' '}
                <Link to="/access/request">Request access to a patient &rarr;</Link>
              </p>
            </>
          ) : (
            <>
              <label className="field">
                <span>Phone number</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +61412345678"
                  required
                />
              </label>
              <p className="muted" style={{ fontSize: '0.8rem', marginTop: -8 }}>
                Used to text you a verification code when a new doctor requests access to your
                records. <Link to="/access/grants">Manage doctor access &rarr;</Link>
              </p>
              <label className="field">
                <span>Allergies</span>
                <input
                  value={allergies}
                  onChange={(e) => setAllergies(e.target.value)}
                  placeholder="e.g. Penicillin, peanuts"
                />
              </label>
              <p className="muted" style={{ fontSize: '0.8rem', marginTop: -8 }}>
                Shown on your <Link to="/emergency-card">emergency card</Link>.
              </p>
            </>
          )}
          {error && <div className="error-text">{error}</div>}
          {saved && !error && (
            <p className="muted" style={{ fontSize: '0.85rem' }}>
              Saved.
            </p>
          )}
          <button className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </form>
      </div>
    </div>
  );
}
