import React from "react";
import { FiGrid, FiLogOut, FiMoon, FiSun, FiUsers, FiSearch, FiEye } from "react-icons/fi";
import IssueNavBubble from "./IssueNavBubble";
import PendingTasksNavBubble from "./PendingTasksNavBubble";
import CompletedTasksNavBubble from "./CompletedTasksNavBubble";
import { useAuth } from "../context/AuthContext";
import { useSettingsModal } from "../context/SettingsModalContext";
import { useRoleSwitcher } from "../context/RoleSwitcherContext";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { useLocation, useNavigate } from "react-router-dom";


const Sidebar = ({ role }) => {
  const { userManager, roles, activeRole } = useAuth();
  const { openRoleSwitcher } = useRoleSwitcher();
  const [theme, setTheme] = React.useState(() => localStorage.getItem('theme') || 'light');
  const location = useLocation();
  const navigate = useNavigate();

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : 'light');

  const handleLogout = async () => {
    await signOut(auth);
  };

    return (
    <nav style={sidebarStyle}>
      {/* Dashboard for non-standard users */}
      {role !== 'standard' && (
        <button
          title="Dashboard"
          style={{ ...iconButtonStyle, marginTop: 24 }}
          onClick={() => navigate('/dashboard')}
          onMouseOver={e => { e.currentTarget.style.background = 'var(--sidebar-hover-bg, #6982b5)'; }}
          onMouseOut={e => { e.currentTarget.style.background = 'none'; }}
        >
          <FiGrid size={28} style={{ color: '#fff' }}/>
        </button>
      )}
      {/* Task Lookup nav button for editors and photographers */}
      {(role === 'editor' || role === 'photographer' || role === 'standard' || role === 'manager') && (
        <button
          title="Task Lookup"
          style={{
            ...iconButtonStyle,
            background: location.pathname === '/task-lookup' ? 'var(--sidebar-active)' : 'none',
            marginTop: 24
          }}
          onClick={() => navigate('/task-lookup')}
          onMouseOver={e => { e.currentTarget.style.background = 'var(--sidebar-hover-bg, #6982b5)'; }}
          onMouseOut={e => { e.currentTarget.style.background = 'none'; }}
        >
          <FiSearch size={28} style={{ color: '#fff' }} />
        </button>
      )}
      {/* Issues for manager/editor only 
      {['manager', 'editor'].includes(role) && role !== 'standard' && (
        <IssueNavBubble visible={true} style={{ ...iconButtonStyle, marginTop: 24 }} onClick={() => navigate('/issues')} />
      )}
        */}
      {/* Pending Tasks for managers and photographers only */}
      {(role === 'manager' || role === 'photographer') && (
        <PendingTasksNavBubble
          visible={true}
          onClick={() => navigate('/scheduling')}
          onMouseOver={e => { e.currentTarget.style.background = 'var(--sidebar-hover-bg, #6982b5)'; }}
          onMouseOut={e => { e.currentTarget.style.background = 'none'; }}
        />
      )}
      {/* User Management for managers only */}
      {(role === 'manager' || userManager) && role !== 'standard' && (
        <button
          title="User Management"
          style={{ ...iconButtonStyle, marginTop: 24 }}
          onClick={() => navigate('/user-management')}
          onMouseOver={e => { e.currentTarget.style.background = 'var(--sidebar-hover-bg, #6982b5)'; }}
          onMouseOut={e => { e.currentTarget.style.background = 'none'; }}
        >
          <FiUsers size={28} style={{ color: '#fff' }} />
        </button>
      )}
      {/* Completed Tasks nav bubble */}
      {(role === 'manager' ) && (
        <CompletedTasksNavBubble
          visible={true}
          onClick={() => navigate('/completed-tasks')}
        />
      )}
      {/* Theme toggle (always) */}
      <button
        title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        style={{

          //... iconButtonStyle,

          // -----------------------
          // Remove below and restore above to restore icon

          background: "none",
          border: "none",
          padding: 0,
          margin: 0,
          color: "var(--text-main)",
          outline: "none",
          width: 44,
          height: 44,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 10,
          transition: "background 0.15s",

          // -----------------------

          marginBottom: 20,
          marginTop: 'auto',
          background: "none",
          color: "#fff"
        }}
        // onClick={toggleTheme}
      >
        {/* {theme === 'light' ? <FiMoon size={24} /> : <FiSun size={24} />} */}
      </button>
      {/* Settings (not for standard users) */}
      {/* Role Switcher (only if multi-role) */}
      {(Array.isArray(roles) && roles.length > 1) && (
        <button
          title={`Switch Role (current: ${capitalize(activeRole || '')})`}
          style={{ ...iconButtonStyle, marginBottom: 16 }}
          onClick={openRoleSwitcher}
          onMouseOver={e => { e.currentTarget.style.background = 'var(--sidebar-hover-bg, #6982b5)'; }}
          onMouseOut={e => { e.currentTarget.style.background = 'none'; }}
        >
          <FiEye size={26} style={{ color: '#fff' }} />
        </button>
      )}
      {(role === 'manager' || role === 'editor' || role === 'photographer') && <SettingsButton />}
      {/* Logout (always) */}
      <button
        title="Logout"
        style={{ ...iconButtonStyle, marginBottom: 16 }}
        onClick={handleLogout}
        onMouseOver={e => { e.currentTarget.style.background = 'var(--sidebar-hover-bg, #6982b5)'; }}
        onMouseOut={e => { e.currentTarget.style.background = 'none'; }}
      >
        <FiLogOut size={28} style={{ color: '#fff' }} />
      </button>
    </nav>
  );
};

const sidebarStyle = {
  width: 68,
  height: "100dvh",
  background: "#1f2c47",
  borderRight: "1.5px solid #2b3954",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "space-between",
  position: "fixed",
  left: 0,
  top: 0,
  zIndex: 100,
  boxShadow: "0 2px 16px rgba(80,120,200,0.15)",
  padding: 0
};



const iconButtonStyle = {
  background: "none",
  border: "none",
  padding: 0,
  margin: 0,
  cursor: "pointer",
  color: "var(--text-main)",
  outline: "none",
  width: 44,
  height: 44,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 10,
  transition: "background 0.15s"
};

export default Sidebar;

function SettingsButton() {
  const { openSettings } = useSettingsModal();
  return (
    <button
      title="Settings"
      style={{
        ...iconButtonStyle,
        marginBottom: 16,
        background: 'none',
        color: 'var(--text-main)',
        transition: 'background 0.18s',
      }}
      onClick={openSettings}
      onMouseOver={e => { e.currentTarget.style.background = 'var(--sidebar-hover-bg, #6982b5)'; }}
      onMouseOut={e => { e.currentTarget.style.background = 'none'; }}
    >
      <svg width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ color: '#fff' }}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 8 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09c0 .7.4 1.3 1 1.51a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 8c.7 0 1.3.4 1.51 1H21a2 2 0 1 1 0 4h-.09c-.11.61-.41 1.16-.91 1.51z"/></svg>
    </button>
  );
}

function capitalize(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
