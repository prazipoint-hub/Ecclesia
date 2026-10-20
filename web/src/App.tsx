import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/components/Auth/ProtectedRoute';
import { DistrictDashboard } from '@/pages/district/DistrictDashboard';
import { DistrictCircuits } from '@/pages/district/DistrictCircuits';
import { DistrictCommittees } from '@/pages/district/DistrictCommittees';
import { DistrictCommitteesManagement } from '@/pages/district/DistrictCommitteesManagement';
import { DistrictPrograms } from '@/pages/district/DistrictPrograms';
import { DistrictReports } from '@/pages/district/DistrictReports';
import { DistrictManagement } from '@/pages/district/DistrictManagement';
import { SbuDashboard } from '@/pages/sbu/SbuDashboard';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';

const protectedPage = (title: string, description: string) => <ProtectedRoute><PlaceholderPage title={title} description={description} /></ProtectedRoute>;

function App() {
  return <BrowserRouter><Routes>
    <Route path="/auth/login" element={<LoginPage />} />
    <Route path="/" element={<Navigate to="/district" replace />} />
    <Route path="/conference" element={protectedPage('Conference Dashboard', 'Conference-wide oversight and reporting.')} />
    <Route path="/conference/sbus/:sbuId" element={<ProtectedRoute><SbuDashboard /></ProtectedRoute>} />
    <Route path="/district" element={<ProtectedRoute><DistrictDashboard /></ProtectedRoute>} />
    <Route path="/district/management" element={<ProtectedRoute><DistrictManagement /></ProtectedRoute>} />
    <Route path="/district/circuits" element={<ProtectedRoute><DistrictCircuits /></ProtectedRoute>} />
    <Route path="/district/committees" element={<ProtectedRoute><DistrictCommittees /></ProtectedRoute>} />
    <Route path="/district/committees/manage" element={<ProtectedRoute><DistrictCommitteesManagement /></ProtectedRoute>} />
    <Route path="/district/programs" element={<ProtectedRoute><DistrictPrograms /></ProtectedRoute>} />
    <Route path="/district/reports" element={<ProtectedRoute><DistrictReports /></ProtectedRoute>} />
    <Route path="/district/sbus/:sbuId" element={<ProtectedRoute><SbuDashboard /></ProtectedRoute>} />
    <Route path="/circuit" element={protectedPage('Circuit Dashboard', 'Circuit operations and church oversight.')} />
    <Route path="/circuit/sbus/:sbuId" element={<ProtectedRoute><SbuDashboard /></ProtectedRoute>} />
    <Route path="/section" element={protectedPage('Section Dashboard', 'Section operations and reporting.')} />
    <Route path="/members" element={protectedPage('Members', 'Manage people, families, and member records.')} />
    <Route path="/events" element={protectedPage('Events', 'Plan services, gatherings, and attendance.')} />
    <Route path="/finance" element={protectedPage('Finance', 'Manage offerings, receipts, and approvals.')} />
    <Route path="/settings" element={protectedPage('Settings', 'Configure your account and church workspace.')} />
    <Route path="/404" element={<NotFoundPage />} /><Route path="*" element={<Navigate to="/404" replace />} />
  </Routes></BrowserRouter>;
}
export default App;
