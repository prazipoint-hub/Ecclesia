import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/components/Auth/ProtectedRoute';
import { DistrictCircuits } from '@/pages/district/DistrictCircuits';
import { DistrictPrograms } from '@/pages/district/DistrictPrograms';
import { SbuDashboard } from '@/pages/sbu/SbuDashboard';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { MembersPage } from '@/pages/MembersPage';
import { FinancePage } from '@/pages/FinancePage';
import { ReportsPage } from '@/pages/ReportsPage';
import { ScopeWorkspacePage } from '@/pages/ScopeWorkspacePage';
import { SettingsPage } from '@/pages/SettingsPage';
import { PastoralCasesPage } from '@/pages/PastoralCasesPage';
import { EventsPage } from '@/pages/EventsPage';
import { CommitteesPage } from '@/pages/CommitteesPage';
import { useAuthStore } from '@/stores/authStore';

const HomeRedirect = () => {
  const { user } = useAuthStore();
  const level = user?.organizationContexts.find((context) => context.roleId === user.defaultContextId)?.organizationLevel;
  const route = level ? `/${level.toLowerCase()}` : '/district';
  return <Navigate to={route} replace />;
};

function App() {
  return <BrowserRouter><Routes>
    <Route path="/auth/login" element={<LoginPage />} />
    <Route path="/" element={<ProtectedRoute><HomeRedirect /></ProtectedRoute>} />
    <Route path="/conference" element={<ProtectedRoute><ScopeWorkspacePage scope="CONFERENCE" /></ProtectedRoute>} />
    <Route path="/conference/districts" element={<ProtectedRoute><ScopeWorkspacePage scope="CONFERENCE" view="structure" /></ProtectedRoute>} />
    <Route path="/conference/committees" element={<ProtectedRoute><CommitteesPage /></ProtectedRoute>} />
    <Route path="/conference/reports" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
    <Route path="/conference/sbus/:sbuId" element={<ProtectedRoute><SbuDashboard /></ProtectedRoute>} />
    <Route path="/district" element={<ProtectedRoute><ScopeWorkspacePage scope="DISTRICT" /></ProtectedRoute>} />
    <Route path="/district/management" element={<ProtectedRoute><ScopeWorkspacePage scope="DISTRICT" view="management" /></ProtectedRoute>} />
    <Route path="/district/circuits" element={<ProtectedRoute><DistrictCircuits /></ProtectedRoute>} />
    <Route path="/district/committees" element={<ProtectedRoute><CommitteesPage /></ProtectedRoute>} />
    <Route path="/district/committees/manage" element={<ProtectedRoute><CommitteesPage /></ProtectedRoute>} />
    <Route path="/district/programs" element={<ProtectedRoute><DistrictPrograms /></ProtectedRoute>} />
    <Route path="/district/reports" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
    <Route path="/district/sbus/:sbuId" element={<ProtectedRoute><SbuDashboard /></ProtectedRoute>} />
    <Route path="/circuit" element={<ProtectedRoute><ScopeWorkspacePage scope="CIRCUIT" /></ProtectedRoute>} />
    <Route path="/circuit/management" element={<ProtectedRoute><ScopeWorkspacePage scope="CIRCUIT" view="management" /></ProtectedRoute>} />
    <Route path="/circuit/committees" element={<ProtectedRoute><CommitteesPage /></ProtectedRoute>} />
    <Route path="/circuit/reports" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
    <Route path="/circuit/sbus/:sbuId" element={<ProtectedRoute><SbuDashboard /></ProtectedRoute>} />
    <Route path="/section" element={<ProtectedRoute><ScopeWorkspacePage scope="SECTION" /></ProtectedRoute>} />
    <Route path="/section/committees" element={<ProtectedRoute><CommitteesPage /></ProtectedRoute>} />
    <Route path="/section/reports" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
    <Route path="/members" element={<ProtectedRoute><MembersPage /></ProtectedRoute>} />
    <Route path="/pastoral" element={<ProtectedRoute><PastoralCasesPage /></ProtectedRoute>} />
    <Route path="/events" element={<ProtectedRoute><EventsPage /></ProtectedRoute>} />
    <Route path="/finance" element={<ProtectedRoute><FinancePage /></ProtectedRoute>} />
    <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
    <Route path="/404" element={<NotFoundPage />} /><Route path="*" element={<Navigate to="/404" replace />} />
  </Routes></BrowserRouter>;
}
export default App;
