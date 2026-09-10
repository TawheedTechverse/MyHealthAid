import { useAuth } from '../context/AuthContext.jsx';
import DoctorDashboard from './DoctorDashboard.jsx';
import PatientDashboard from './PatientDashboard.jsx';

export default function Dashboard() {
  const { user } = useAuth();
  return user.role === 'doctor' ? <DoctorDashboard /> : <PatientDashboard />;
}
