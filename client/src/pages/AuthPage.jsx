import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Spinner from '../components/Spinner.jsx';

export default function AuthPage({ mode }) {
  const { user, loading, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isRegister = mode === 'register';

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    role: 'patient',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <Spinner full />;
  if (user) {
    const to = location.state?.from?.pathname || '/';
    return <Navigate to={to} replace />;
  }

  function update(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const payload = isRegister
      ? form
      : { email: form.email, password: form.password };
    const result = isRegister ? await register(payload) : await login(payload);
    setSubmitting(false);
    if (result.ok) {
      navigate('/', { replace: true });
    } else {
      setError(result.error);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="glass auth-card">
        <h1 className="page-title" style={{ textAlign: 'center' }}>
          MyHealthAid
        </h1>
        <p className="page-sub auth-motto" style={{ textAlign: 'center' }}>
          Shared treatment tracking for patients &amp; doctors
        </p>

        <div className="auth-switch">
          <button
            type="button"
            className={!isRegister ? 'active' : ''}
            onClick={() => navigate('/login')}
          >
            Sign in
          </button>
          <button
            type="button"
            className={isRegister ? 'active' : ''}
            onClick={() => navigate('/register')}
          >
            Create account
          </button>
        </div>

        {error && <div className="error-text">{error}</div>}

        <form onSubmit={handleSubmit}>
          {isRegister && (
            <label className="field">
              <span>Full name</span>
              <input
                value={form.fullName}
                onChange={update('fullName')}
                autoComplete="name"
                required
                minLength={2}
              />
            </label>
          )}

          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={form.email}
              onChange={update('email')}
              autoComplete="email"
              required
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={form.password}
              onChange={update('password')}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              required
              minLength={isRegister ? 8 : 1}
            />
          </label>

          {isRegister && (
            <label className="field">
              <span>I am a</span>
              <select value={form.role} onChange={update('role')}>
                <option value="patient">Patient</option>
                <option value="doctor">Doctor</option>
              </select>
            </label>
          )}

          <button className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Please wait...' : isRegister ? 'Create account' : 'Sign in'}
          </button>
        </form>

        {!isRegister && (
          <p className="muted" style={{ marginTop: 16, fontSize: '0.85rem' }}>
            Demo: <code>dr.reyes@myhealthaid.dev</code> or{' '}
            <code>ben@myhealthaid.dev</code> &mdash; password <code>password123</code>
          </p>
        )}
      </div>
    </div>
  );
}
