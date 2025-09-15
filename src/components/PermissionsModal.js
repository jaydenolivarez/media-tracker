import React from "react";
import { MEDIA_TYPES, getMediaTypeLabel } from "../constants/mediaTypes";

/**
 * props:
 *   open: boolean
 *   onClose: function
 *   user: user object (the user being edited)
 *   onSave: function(updatedPermissions) (called with new permissions object)
 */
export default function PermissionsModal({ open, onClose, user, onSave }) {
  const [permissions, setPermissions] = React.useState(user?.permissions || {});
  const modalRef = React.useRef(null);

  React.useEffect(() => {
    setPermissions(user?.permissions || {});
  }, [user]);

  React.useEffect(() => {
    function handleKey(e) {
      if (e.key === "Escape") onClose();
    }
    if (open) {
      window.addEventListener("keydown", handleKey);
      return () => window.removeEventListener("keydown", handleKey);
    }
  }, [open, onClose]);

  if (!open) return null;

  const handleCheckbox = key => e => {
    setPermissions(p => ({ ...p, [key]: e.target.checked }));
  };

  const handleSave = () => {
    onSave(permissions);
    onClose();
  };

  const handleBackdropClick = (e) => {
    if (modalRef.current && !modalRef.current.contains(e.target)) {
      onClose();
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000
      }}
      onMouseDown={handleBackdropClick}
      aria-modal="true"
      role="dialog"
    >
      <div
        ref={modalRef}
        style={{
          background: "var(--bg-card, #fff)",
          color: "var(--text-main, #181c24)",
          borderRadius: 14,
          padding: 32,
          minWidth: 350,
          boxShadow: "0 4px 32px rgba(60,80,160,0.16)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          maxWidth: "90vw"
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        <h2 style={{ marginBottom: 18, fontWeight: 800, fontSize: 22 }}>Edit Permissions</h2>
        <div style={{ marginBottom: 22, width: "100%" }}>
          <label style={{ display: "block", marginBottom: 12, fontSize: 16 }}>
            <input type="checkbox" checked={!!permissions.propertyManagement} onChange={handleCheckbox("propertyManagement")} />
            <span style={{ marginLeft: 8 }}>Property Management</span>
          </label>

          <div style={{ marginTop: 40 }}>
            <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 15 }}>Enabled Media Types</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {MEDIA_TYPES.map(type => {
                const enabled = Array.isArray(permissions.mediaTypes)
                  ? permissions.mediaTypes.includes(type.key)
                  : false;
                return (
                  <button
                    key={type.key}
                    type="button"
                    onClick={() => {
                      setPermissions(prev => {
                        let next = Array.isArray(prev.mediaTypes) ? [...prev.mediaTypes] : [];
                        if (next.includes(type.key)) {
                          next = next.filter(k => k !== type.key);
                        } else {
                          next.push(type.key);
                        }
                        return { ...prev, mediaTypes: next };
                      });
                    }}
                    style={{
                      background: enabled ? type.color : '#f3f4f6',
                      color: enabled ? '#fff' : '#222',
                      border: enabled ? '1.5px solid var(--bg-card)' : '1.5px solid #d1d5db',
                      borderRadius: 16,
                      padding: '7px 18px',
                      fontWeight: 600,
                      fontSize: 15,
                      cursor: 'pointer',
                      boxShadow: enabled ? '0 2px 8px rgba(0,0,0,0.10)' : 'none',
                      transition: 'background 0.18s, color 0.18s, box-shadow 0.18s',
                      outline: 'none',
                    }}
                    aria-pressed={enabled}
                  >
                    {getMediaTypeLabel(type.key)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 18, width: "100%", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              background: "#eee",
              color: "var(--text-main, #181c24)",
              border: "none",
              borderRadius: 6,
              padding: "7px 22px",
              cursor: "pointer",
              fontWeight: 500,
              fontSize: 15
            }}
          >Cancel</button>
          <button
            onClick={handleSave}
            style={{
              background: "#3b82f6",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "7px 22px",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 15,
              boxShadow: "0 2px 8px rgba(60,130,246,0.10)"
            }}
          >Save</button>
        </div>
      </div>
    </div>
  );
}
