import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark">+</span>
          MyHealthAid
        </Link>
        <div className="topbar-spacer" />
        {user && (
          <div className="topbar-user">
            <span>
              {user.fullName} <span className="badge">{user.role}</span>
            </span>
            <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        )}
      </header>
      <main className="container">{children}</main>
    </div>
  );
}
