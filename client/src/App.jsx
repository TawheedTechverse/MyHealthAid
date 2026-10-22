import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AuthPage from './pages/AuthPage.jsx';
import Dashboard from './pages/Dashboard.jsx';
import CreatePlan from './pages/CreatePlan.jsx';
import PlanDetail from './pages/PlanDetail.jsx';
import Profile from './pages/Profile.jsx';
import RequestAccess from './pages/RequestAccess.jsx';
import AccessGrants from './pages/AccessGrants.jsx';
import AuditLog from './pages/AuditLog.jsx';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/plans/new"
          element={
            <ProtectedRoute role="doctor">
              <CreatePlan />
            </ProtectedRoute>
          }
        />
        <Route
          path="/plans/:id"
          element={
            <ProtectedRoute>
              <PlanDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/access/request"
          element={
            <ProtectedRoute role="doctor">
              <RequestAccess />
            </ProtectedRoute>
          }
        />
        <Route
          path="/access/grants"
          element={
            <ProtectedRoute role="patient">
              <AccessGrants />
            </ProtectedRoute>
          }
        />
        <Route
          path="/access/audit"
          element={
            <ProtectedRoute role="patient">
              <AuditLog />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
