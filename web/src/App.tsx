import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/components/Auth/ProtectedRoute';
import { DistrictDashboard } from '@/pages/district/DistrictDashboard';
import { DistrictCircuits } from '@/pages/district/DistrictCircuits';
import { DistrictCommittees } from '@/pages/district/DistrictCommittees';
import { DistrictPrograms } from '@/pages/district/DistrictPrograms';
import { DistrictReports } from '@/pages/district/DistrictReports';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';

const protectedPage = (title: string, description: string) => (
  <ProtectedRoute><PlaceholderPage title={title} description={description} /></ProtectedRoute>
);

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth/login" element={<LoginPage />} />
        <Route path="/" element={<Navigate to="/district" replace />} />

        <Route path="/district" element={<ProtectedRoute><DistrictDashboard /></ProtectedRoute>} />
        <Route path="/district/circuits" element={<ProtectedRoute><DistrictCircuits /></ProtectedRoute>} />
        <Route path="/district/committees" element={<ProtectedRoute><DistrictCommittees /></ProtectedRoute>} />
        <Route path="/district/programs" element={<ProtectedRoute><DistrictPrograms /></ProtectedRoute>} />
        <Route path="/district/reports" element={<ProtectedRoute><DistrictReports /></ProtectedRoute>} />

        <Route path="/members" element={protectedPage('Members', 'Manage people, families, and member records.')} />
        <Route path="/membership" element={protectedPage('Membership', 'Track membership status and lifecycle workflows.')} />
        <Route path="/events" element={protectedPage('Events', 'Plan services, gatherings, and attendance.')} />
        <Route path="/finance" element={protectedPage('Finance', 'Manage offerings, receipts, and approvals.')} />
        <Route path="/reports" element={protectedPage('Reports', 'Review membership, attendance, and financial insights.')} />
        <Route path="/settings" element={protectedPage('Settings', 'Configure your account and church workspace.')} />
        <Route path="/404" element={<NotFoundPage />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
