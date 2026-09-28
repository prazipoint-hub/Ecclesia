import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/components/Auth/ProtectedRoute';
import { Dashboard } from '@/features/Dashboard';
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
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
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
