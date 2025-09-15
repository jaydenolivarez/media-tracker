import React from "react";
import "./App.css";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Auth from "./components/Auth";
import Dashboard from "./components/Dashboard";
import SettingsPage from "./components/SettingsPage";
import SettingsOverlay from "./components/SettingsOverlay";
import { SettingsModalProvider, useSettingsModal } from "./context/SettingsModalContext";
import PendingApprovalPage from "./components/PendingApprovalPage";
import DetailedTaskView from "./components/DetailedTaskView";
import TaskLookupPage from "./components/TaskLookupPage";
import PendingTasksView from "./components/SchedulingList";
import CompletedTasksView from "./components/CompletedTasksView";
import IssueManagementView from "./components/IssueManagementView";
import ActionLogPage from "./components/ActionLogPage";
import UserManagementView from "./components/UserManagementView";
import ProtectedRoute from "./components/ProtectedRoute";
import Sidebar from "./components/Sidebar";
import MobileTopNav from "./components/MobileTopNav";
import { UploadManagerProvider } from './context/UploadManagerContext';
import AppWrapper from "./components/AppWrapper";
import { BannerProvider } from "./context/BannerContext";
import { UndoProvider } from "./components/UndoProvider";
import FloatingBanner from "./components/FloatingBanner";
import { useBanner } from "./context/BannerContext";
import SchedulingView from "./components/SchedulingView";
import { RoleSwitcherProvider } from "./context/RoleSwitcherContext";
import RoleSwitcherModal from "./components/RoleSwitcherModal";

function GlobalSettingsModal() {
  const { showSettings, closeSettings } = useSettingsModal();
  const [isMobile, setIsMobile] = React.useState(() => window.innerWidth <= 800);
  React.useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 800);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  if (!showSettings) return null;
  return (
    <SettingsOverlay sidebarWidth={isMobile ? 0 : 68} onClose={closeSettings}>
      {(handleFadeOut) => (
        <div style={{ marginTop: 64, width: "100%", maxWidth: 480 }}>
          <SettingsPage />
        </div>
      )}
    </SettingsOverlay>
  );
}

// Helper component to render the global banner
function GlobalBanner() {
  const { banner, hideBanner } = useBanner();
  return (
    <FloatingBanner
      visible={banner.visible}
      message={banner.message}
      type={banner.type}
      onClose={hideBanner}
    />
  );
}

function AppContent() {
  const { user, loading, role, roleLoading, activeRole } = useAuth();
  const [isMobile, setIsMobile] = React.useState(() => window.innerWidth <= 800);
  React.useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 800);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  if (loading || roleLoading) return null; // Auth handles its own loading UI
  const displayRole = activeRole || role;
  return (
    <>
      <GlobalSettingsModal />
      <Router>
        {user ? (
          <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-main)' }}>
            {!isMobile && <Sidebar role={displayRole} />}
            {isMobile && <MobileTopNav role={displayRole} />}
            <div style={{ flex: 1, marginLeft: isMobile ? 0 : 68, paddingTop: isMobile ? 56 : 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <Routes>
                {displayRole === "pending" && <Route path="*" element={<PendingApprovalPage />} />}
                {displayRole === "standard" && (
                  <>
                    <Route path="/admin/action-log" element={
                      <ProtectedRoute>
                        <ActionLogPage />
                      </ProtectedRoute>
                    } />
                    <Route path="/task-lookup" element={<TaskLookupPage />} />
                    <Route path="/tasks/:publicId" element={<DetailedTaskView usePublicId={true} />} />
                    <Route path="*" element={<Navigate to="/task-lookup" replace />} />
                  </>
                )}
                {displayRole === "editor" && (
                  <>
                    <Route path="/admin/action-log" element={
                      <ProtectedRoute>
                        <ActionLogPage />
                      </ProtectedRoute>
                    } />
                    <Route path="/dashboard" element={
                      <ProtectedRoute>
                        <Dashboard />
                      </ProtectedRoute>
                    } />
                    <Route path="/dashboard/tasks/:publicId" element={
                      <ProtectedRoute>
                        <Dashboard />
                      </ProtectedRoute>
                    } />
                    <Route path="/task-lookup" element={<TaskLookupPage />} />
                    <Route path="/tasks/:publicId" element={<DetailedTaskView usePublicId={true} />} />
                    <Route path="/issues" element={<IssueManagementView />} />
                    <Route path="/user-management" element={<UserManagementView />} />
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                  </>
                )}
                {displayRole === "photographer" && (
                  <>
                    <Route path="/admin/action-log" element={
                      <ProtectedRoute>
                        <ActionLogPage />
                      </ProtectedRoute>
                    } />
                    <Route path="/dashboard" element={
                      <ProtectedRoute>
                        <Dashboard />
                      </ProtectedRoute>
                    } />
                    <Route path="/dashboard/tasks/:publicId" element={
                      <ProtectedRoute>
                        <Dashboard />
                      </ProtectedRoute>
                    } />
                    <Route path="/task-lookup" element={<TaskLookupPage />} />
                    <Route path="/tasks/:publicId" element={<DetailedTaskView usePublicId={true} />} />
                    <Route path="/scheduling" element={<SchedulingView/>} />
                    <Route path="/scheduling/task/:taskId" element={<SchedulingView/>} />
                    <Route path="/completed-tasks" element={<CompletedTasksView />} />
                    <Route path="/completed-tasks/:publicId" element={<CompletedTasksView />} />
                    <Route path="/issues" element={<IssueManagementView />} />
                    <Route path="/user-management" element={<UserManagementView />} />
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                  </>
                )}
                {displayRole === "manager" && (
                  <>
                    <Route path="/admin/action-log" element={
                      <ProtectedRoute>
                        <ActionLogPage />
                      </ProtectedRoute>
                    } />
                    <Route path="/dashboard" element={
                      <ProtectedRoute>
                        <Dashboard />
                      </ProtectedRoute>
                    } />
                    <Route path="/dashboard/tasks/:publicId" element={
                      <ProtectedRoute>
                        <Dashboard />
                      </ProtectedRoute>
                    } />
                    <Route path="/task-lookup" element={<TaskLookupPage />} />
                    <Route path="/scheduling" element={<SchedulingView />} />
                    <Route path="/scheduling/task/:taskId" element={<SchedulingView />} />
                    <Route path="/completed-tasks" element={<CompletedTasksView />} />
                    <Route path="/completed-tasks/:publicId" element={<CompletedTasksView />} />
                    <Route path="/issues" element={<IssueManagementView />} />
                    <Route path="/user-management" element={<UserManagementView />} />
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                  </>
                )}
                {displayRole && !["pending", "standard", "editor", "photographer", "manager"].includes(displayRole) && (
                  <Route path="/*" element={
                    <ProtectedRoute>
                      <Dashboard />
                    </ProtectedRoute>
                  } />
                )}
              </Routes>
            </div>
          </div>
        ) : <Auth />}
      </Router>
    </>
  );
}

function App() {
  return (
    <UndoProvider>
      <BannerProvider>
        <GlobalBanner />
        <AuthProvider>
          <RoleSwitcherProvider>
            <UploadManagerProvider>
              <SettingsModalProvider>
                <AppWrapper>
                  <GlobalSettingsModal />
                  <RoleSwitcherModal />
                  <AppContent />
                </AppWrapper>
              </SettingsModalProvider>
            </UploadManagerProvider>
          </RoleSwitcherProvider>
        </AuthProvider>
      </BannerProvider>
    </UndoProvider>
  );
}

export default App;