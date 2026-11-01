import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { DistrictCircuits } from '@/pages/district/DistrictCircuits';
import { DistrictPrograms } from '@/pages/district/DistrictPrograms';
import { SbuDashboard } from '@/pages/sbu/SbuDashboard';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { MembersPage } from '@/pages/MembersPage';
import { FinancePage } from '@/pages/FinancePage';
import { AccountsPage } from '@/pages/finance/AccountsPage';
import { PeriodsPage } from '@/pages/finance/PeriodsPage';
import { JournalsPage } from '@/pages/finance/JournalsPage';
import { JournalEditorPage } from '@/pages/finance/JournalEditorPage';
import { BudgetsPage } from '@/pages/finance/BudgetsPage';
import { BudgetDetailPage } from '@/pages/finance/BudgetDetailPage';
import { FundsPage } from '@/pages/finance/FundsPage';
import { CashSessionsPage } from '@/pages/finance/CashSessionsPage';
import { FinanceReportsPage } from '@/pages/finance/ReportsPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { ScopeWorkspacePage } from '@/pages/ScopeWorkspacePage';
import { SettingsPage } from '@/pages/SettingsPage';
import { PastoralDashboardPage } from '@/pages/pastoral/PastoralDashboardPage';
import { VisitsPage } from '@/pages/pastoral/VisitsPage';
import { CounselingPage } from '@/pages/pastoral/CounselingPage';
import { PrayerPage } from '@/pages/pastoral/PrayerPage';
import { ReferralsPage } from '@/pages/pastoral/ReferralsPage';
import { FollowUpsPage } from '@/pages/pastoral/FollowUpsPage';
import { AssessmentsPage } from '@/pages/pastoral/AssessmentsPage';
import { SacramentsPage } from '@/pages/pastoral/SacramentsPage';
import { MemberCareProfilePage } from '@/pages/pastoral/MemberCareProfilePage';
import { PastoralCasesPage } from '@/pages/PastoralCasesPage';
import { UpcomingEventsPage } from '@/pages/events/UpcomingEventsPage';
import { MyBadgePage } from '@/pages/events/MyBadgePage';
import { ScanPage } from '@/pages/events/ScanPage';
import { CheckInPage } from '@/pages/events/CheckInPage';
import { RegistrationsPage } from '@/pages/events/RegistrationsPage';
import { VolunteersPage } from '@/pages/events/VolunteersPage';
import { AnalyticsPage } from '@/pages/events/AnalyticsPage';
import { AbsencesPage } from '@/pages/events/AbsencesPage';
import { EventsPage } from '@/pages/EventsPage';
import { CommitteesPage } from '@/pages/CommitteesPage';
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';
import { VerifyEmailPage } from '@/pages/auth/VerifyEmailPage';
import { AcceptInvitationPage } from '@/pages/auth/AcceptInvitationPage';
import { SecuritySettingsPage } from '@/pages/settings/SecuritySettingsPage';
import { MyAccountPage } from '@/pages/account/MyAccountPage';
import { MyProfilePage } from '@/pages/account/MyProfilePage';
import { MyGivingPage } from '@/pages/account/MyGivingPage';
import { MyFamilyPage } from '@/pages/account/MyFamilyPage';
import { NotificationsPage } from '@/pages/account/NotificationsPage';
import { PledgesPage } from '@/pages/account/PledgesPage';
import { RecurringGivingPage } from '@/pages/account/RecurringGivingPage';
import { NotificationPreferencesPage } from '@/pages/account/NotificationPreferencesPage';
import { BroadcastsPage } from '@/pages/admin/BroadcastsPage';
import { TemplatesPage } from '@/pages/admin/TemplatesPage';
import { GivePage } from '@/pages/give/GivePage';
import { GiveConfirmPage } from '@/pages/give/GiveConfirmPage';
import { MemberDirectoryPage } from '@/pages/members/MemberDirectoryPage';
import { MemberImportPage } from '@/pages/members/MemberImportPage';
import { MemberDetailPage } from '@/pages/members/MemberDetailPage';
import { VisitorsPage } from '@/pages/visitors/VisitorsPage';
import { VisitorDetailPage } from '@/pages/visitors/VisitorDetailPage';
import { CommitteeMeetingsPage } from '@/pages/committees/CommitteeMeetingsPage';
import { MeetingDetailPage } from '@/pages/committees/MeetingDetailPage';
import { LeadershipPage } from '@/pages/leadership/LeadershipPage';
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
    <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
    <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
    <Route path="/auth/verify-email" element={<VerifyEmailPage />} />
    <Route path="/auth/invite" element={<AcceptInvitationPage />} />
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
    <Route path="/members/search" element={<ProtectedRoute><MemberDirectoryPage /></ProtectedRoute>} />
    <Route path="/members/import" element={<ProtectedRoute><MemberImportPage /></ProtectedRoute>} />
    <Route path="/members/:id" element={<ProtectedRoute><MemberDetailPage /></ProtectedRoute>} />
    <Route path="/visitors" element={<ProtectedRoute><VisitorsPage /></ProtectedRoute>} />
    <Route path="/visitors/:id" element={<ProtectedRoute><VisitorDetailPage /></ProtectedRoute>} />
    <Route path="/committees/:committeeId/meetings" element={<ProtectedRoute><CommitteeMeetingsPage /></ProtectedRoute>} />
    <Route path="/committees/:committeeId/meetings/:meetingId" element={<ProtectedRoute><MeetingDetailPage /></ProtectedRoute>} />
    <Route path="/leadership" element={<ProtectedRoute><LeadershipPage /></ProtectedRoute>} />
    <Route path="/pastoral" element={<ProtectedRoute><PastoralCasesPage /></ProtectedRoute>} />
    <Route path="/pastoral/dashboard" element={<ProtectedRoute><PastoralDashboardPage /></ProtectedRoute>} />
    <Route path="/pastoral/visits" element={<ProtectedRoute><VisitsPage /></ProtectedRoute>} />
    <Route path="/pastoral/counseling" element={<ProtectedRoute><CounselingPage /></ProtectedRoute>} />
    <Route path="/pastoral/prayer" element={<ProtectedRoute><PrayerPage /></ProtectedRoute>} />
    <Route path="/pastoral/referrals" element={<ProtectedRoute><ReferralsPage /></ProtectedRoute>} />
    <Route path="/pastoral/followups" element={<ProtectedRoute><FollowUpsPage /></ProtectedRoute>} />
    <Route path="/pastoral/assessments" element={<ProtectedRoute><AssessmentsPage /></ProtectedRoute>} />
    <Route path="/pastoral/sacraments" element={<ProtectedRoute><SacramentsPage /></ProtectedRoute>} />
    <Route path="/pastoral/members/:memberId" element={<ProtectedRoute><MemberCareProfilePage /></ProtectedRoute>} />
    <Route path="/events" element={<ProtectedRoute><EventsPage /></ProtectedRoute>} />
    <Route path="/events/upcoming" element={<ProtectedRoute><UpcomingEventsPage /></ProtectedRoute>} />
    <Route path="/events/my-badge" element={<ProtectedRoute><MyBadgePage /></ProtectedRoute>} />
    <Route path="/events/scan" element={<ProtectedRoute><ScanPage /></ProtectedRoute>} />
    <Route path="/events/volunteers" element={<ProtectedRoute><VolunteersPage /></ProtectedRoute>} />
    <Route path="/events/analytics" element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
    <Route path="/events/absences" element={<ProtectedRoute><AbsencesPage /></ProtectedRoute>} />
    <Route path="/events/:eventId/checkin" element={<ProtectedRoute><CheckInPage /></ProtectedRoute>} />
    <Route path="/events/:eventId/registrations" element={<ProtectedRoute><RegistrationsPage /></ProtectedRoute>} />
    <Route path="/finance" element={<ProtectedRoute><FinancePage /></ProtectedRoute>} />
    <Route path="/finance/accounts" element={<ProtectedRoute><AccountsPage /></ProtectedRoute>} />
    <Route path="/finance/periods" element={<ProtectedRoute><PeriodsPage /></ProtectedRoute>} />
    <Route path="/finance/journals" element={<ProtectedRoute><JournalsPage /></ProtectedRoute>} />
    <Route path="/finance/journals/new" element={<ProtectedRoute><JournalEditorPage /></ProtectedRoute>} />
    <Route path="/finance/journals/:journalId" element={<ProtectedRoute><JournalEditorPage /></ProtectedRoute>} />
    <Route path="/finance/budgets" element={<ProtectedRoute><BudgetsPage /></ProtectedRoute>} />
    <Route path="/finance/budgets/:budgetId" element={<ProtectedRoute><BudgetDetailPage /></ProtectedRoute>} />
    <Route path="/finance/funds" element={<ProtectedRoute><FundsPage /></ProtectedRoute>} />
    <Route path="/finance/cash-sessions" element={<ProtectedRoute><CashSessionsPage /></ProtectedRoute>} />
    <Route path="/finance/reports" element={<ProtectedRoute><FinanceReportsPage /></ProtectedRoute>} />
    <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
    <Route path="/settings/security" element={<ProtectedRoute><SecuritySettingsPage /></ProtectedRoute>} />
    <Route path="/my-account" element={<ProtectedRoute><MyAccountPage /></ProtectedRoute>} />
    <Route path="/my-account/profile" element={<ProtectedRoute><MyProfilePage /></ProtectedRoute>} />
    <Route path="/my-account/giving" element={<ProtectedRoute><MyGivingPage /></ProtectedRoute>} />
    <Route path="/my-account/family" element={<ProtectedRoute><MyFamilyPage /></ProtectedRoute>} />
    <Route path="/my-account/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
    <Route path="/my-account/pledges" element={<ProtectedRoute><PledgesPage /></ProtectedRoute>} />
    <Route path="/my-account/recurring" element={<ProtectedRoute><RecurringGivingPage /></ProtectedRoute>} />
    <Route path="/my-account/notification-preferences" element={<ProtectedRoute><NotificationPreferencesPage /></ProtectedRoute>} />
    <Route path="/admin/broadcasts" element={<ProtectedRoute><BroadcastsPage /></ProtectedRoute>} />
    <Route path="/admin/templates" element={<ProtectedRoute><TemplatesPage /></ProtectedRoute>} />
    <Route path="/give" element={<ProtectedRoute><GivePage /></ProtectedRoute>} />
    <Route path="/give/confirm" element={<ProtectedRoute><GiveConfirmPage /></ProtectedRoute>} />
    <Route path="/404" element={<NotFoundPage />} /><Route path="*" element={<Navigate to="/404" replace />} />
  </Routes></BrowserRouter>;
}
export default App;
