import React from "react";
import { FiMenu, FiX, FiGrid, FiSearch, FiUsers, FiLogOut, FiMoon, FiSun, FiArrowLeft } from "react-icons/fi";
import IssueNavBubble from "./IssueNavBubble";
import PendingTasksNavBubble from "./PendingTasksNavBubble";
import CompletedTasksNavBubble from "./CompletedTasksNavBubble";
import { useAuth } from "../context/AuthContext";
import { useLocation, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";

export default function MobileTopNav({ role }) {
  const [open, setOpen] = React.useState(false);
  const [slideIn, setSlideIn] = React.useState(false);
  const { userManager } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [theme, setTheme] = React.useState(() => localStorage.getItem('theme') || 'light');

  // Derive a page title for the current route (center of top nav)
  const pageTitle = React.useMemo(() => {
    const p = location.pathname || '';
    if (p.startsWith('/dashboard')) return 'Open Tasks';
    if (p.startsWith('/scheduling')) return 'Scheduling';
    if (p.startsWith('/task-lookup')) return 'Task Lookup';
    if (p.startsWith('/issues')) return 'Issues';
    if (p.startsWith('/completed-tasks')) return 'Completed Tasks';
    if (p.startsWith('/user-management')) return 'User Management';
    return 'Menu';
  }, [location.pathname]);

  // Back button visibility and target
  const { showBack, backTo } = React.useMemo(() => {
    const p = location.pathname || '';
    // Root-level routes that shouldn't show a back arrow
    const roots = ['/dashboard', '/scheduling', '/task-lookup', '/issues', '/completed-tasks', '/user-management'];
    // Known nested patterns
    if (p.startsWith('/dashboard/tasks/')) return { showBack: true, backTo: '/dashboard' };
    if (p.startsWith('/completed-tasks/')) return { showBack: true, backTo: '/completed-tasks' };
    if (p.startsWith('/tasks/')) return { showBack: true, backTo: '/task-lookup' };
    if (p.startsWith('/scheduling/task/')) return { showBack: true, backTo: '/scheduling' };
    return { showBack: !roots.includes(p), backTo: null };
  }, [location.pathname]);

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : 'light');

  const handleNav = (path) => {
    // slide out then navigate
    setSlideIn(false);
    setTimeout(() => setOpen(false), 280);
    navigate(path);
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  React.useEffect(() => {
    if (open) {
      // start slide-in next tick
      const t = setTimeout(() => setSlideIn(true), 0);
      return () => clearTimeout(t);
    } else {
      setSlideIn(false);
    }
  }, [open]);

  return (
    <>
      {/* Top bar */
      }
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 12px', background: 'var(--bg-card)',
        borderBottom: '1px solid var(--sidebar-border)', zIndex: 1000
      }}>
        {showBack ? (
          <button
            aria-label="Go back"
            onClick={() => {
              if (backTo) navigate(backTo);
              else navigate(-1);
            }}
            style={{ background: 'none', border: 'none', borderRadius: 10, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <FiArrowLeft size={22} />
          </button>
        ) : (
          <div style={{ width: 40 }} />
        )}
        <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: 18 }}>{pageTitle}</div>
        <button
          aria-label="Open menu"
          onClick={() => setOpen(true)}
          style={{ background: 'none', border: 'none', borderRadius: 10, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <FiMenu size={22} />
        </button>
      </div>

      {/* Slide-in full-screen panel */}
      {open && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1001,
          transform: slideIn ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.28s cubic-bezier(.4,0,.2,1)'
        }}>
          <div style={{
            position: 'absolute', inset: 0,
            background: 'var(--bg-card)',
            borderLeft: '1px solid var(--sidebar-border)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottom: '1px solid var(--sidebar-border)', marginTop: 56 }}>
              <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>Navigation</div>
              <button aria-label="Close menu" onClick={() => { setSlideIn(false); setTimeout(() => setOpen(false), 280); }} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)' }}>
                <FiX size={22} />
              </button>
            </div>
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Dashboard for non-standard users */}
                {role !== 'standard' && (
                  <NavRow active={location.pathname.startsWith('/dashboard')} icon={<FiGrid />} label="Dashboard" onClick={() => handleNav('/dashboard')} />
                )}
                {/* Task Lookup */}
                {(role === 'editor' || role === 'photographer' || role === 'standard' || role === 'manager') && (
                  <NavRow active={location.pathname.startsWith('/task-lookup')} icon={<FiSearch />} label="Task Lookup" onClick={() => handleNav('/task-lookup')} />
                )}
                {/* Issues for manager/editor only */}
                {['manager', 'editor'].includes(role) && role !== 'standard' && (
                  <BubbleRow label="Issues" onClick={() => handleNav('/issues')} left={<IssueNavBubble visible={true} onClick={() => handleNav('/issues')} />} />
                )}
                {/* Pending Tasks for managers and photographers only */}
                {(role === 'manager' || role === 'photographer') && (
                  <BubbleRow label="Pending Tasks" onClick={() => handleNav('/scheduling')} left={<PendingTasksNavBubble visible={true} onClick={() => handleNav('/scheduling')} />} />
                )}
                {/* User Management for managers only */}
                {(role === 'manager' || userManager) && role !== 'standard' && (
                  <NavRow active={location.pathname.startsWith('/user-management')} icon={<FiUsers />} label="User Management" onClick={() => handleNav('/user-management')} />
                )}
                {/* Completed Tasks */}
                {(role === 'manager') && (
                  <BubbleRow label="Completed Tasks" onClick={() => handleNav('/completed-tasks')} left={<CompletedTasksNavBubble visible={true} onClick={() => handleNav('/completed-tasks')} />} />
                )}
                {/* Theme toggle */}
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 12, borderTop: '1px solid var(--sidebar-border)', marginTop: 6 }}>
                  <button
                    onClick={toggleTheme}
                    style={{ background: 'var(--bg-main)', border: '1px solid var(--sidebar-border)', borderRadius: 10, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    {theme === 'light' ? <FiMoon /> : <FiSun />}
                    <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>
                  </button>
                  <button
                    onClick={handleLogout}
                    style={{ background: '#ef4444', border: 'none', borderRadius: 10, padding: '8px 10px', color: 'white', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}
                  >
                    <FiLogOut /> Logout
                  </button>
                </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function NavRow({ icon, label, onClick, active }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: 12,
      background: active ? 'var(--sidebar-hover-bg, #e6eaff)' : 'transparent',
      border: '1px solid var(--sidebar-border)',
      borderRadius: 12,
      color: 'var(--text-main)'
    }}>
      <span style={{ display: 'flex', width: 24, justifyContent: 'center' }}>{icon}</span>
      <span style={{ fontWeight: 600 }}>{label}</span>
    </button>
  );
}

// Bubble-like rows to mirror Issue/Pending/Completed bubbles but with labels
function BubbleRow({ label, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: 12,
      background: 'transparent',
      border: '1px solid var(--sidebar-border)',
      borderRadius: 12,
      color: 'var(--text-main)'
    }}>
      <span style={{ width: 24, height: 24, display: 'inline-block' }} />
      <span style={{ fontWeight: 600 }}>{label}</span>
    </button>
  );
}
