import React from "react";
import SettingsOverlay from "./SettingsOverlay";
import { useAuth } from "../context/AuthContext";
import { useRoleSwitcher } from "../context/RoleSwitcherContext";

export default function RoleSwitcherModal({ sidebarWidth = 68 }) {
  const { showRoleSwitcher, closeRoleSwitcher } = useRoleSwitcher();
  const { roles, activeRole, setActiveRole } = useAuth();

  const [isMobile, setIsMobile] = React.useState(() => window.innerWidth <= 800);
  React.useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 800);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!showRoleSwitcher) return null;

  const options = Array.isArray(roles) ? roles : [];

  return (
    <SettingsOverlay sidebarWidth={isMobile ? 0 : sidebarWidth} onClose={closeRoleSwitcher}>
      {(handleFadeOut) => (
        <div style={{ marginTop: 64, width: "100%", maxWidth: 420, backgroundColor: 'var(--bg-card)', borderRadius: 12, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.10)', zIndex: 999999999}}>
          <h2 style={{ margin: 0, padding: 0, color: 'var(--text-main)' }}>Switch Role</h2>
          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            {options.map((r) => (
              <button
                key={r}
                onClick={() => {
                  if (r && r !== activeRole) {
                    setActiveRole(r);
                  }
                  handleFadeOut();
                  // Trigger a full page refresh so all views refetch for the new role
                  try {
                    setTimeout(() => { if (typeof window !== 'undefined') window.location.reload(); }, 60);
                  } catch (_) {}
                }}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: '1px solid var(--card-border)',
                  background: r === activeRole ? '#3b82f6' : '#e5e7eb',
                  color: r === activeRole ? '#fff' : 'var(--text-main)',
                  cursor: 'pointer',
                  fontWeight: r === activeRole ? 'bold' : 'normal',
                }}
              >
                {capitalize(r)}
              </button>
            ))}
          </div>
        </div>
      )}
    </SettingsOverlay>
  );
}

function capitalize(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
