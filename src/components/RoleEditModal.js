import React from "react";
import { getFirestore, doc, updateDoc } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { logAction } from "../utils/logAction";

const ALL_ROLES = [
  "manager",
  "editor",
  "photographer",
  "standard",
  "pending",
];

export default function RoleEditModal({
  open,
  onClose,
  user,
  currentUserId,
  onSaved,
}) {
  const [saving, setSaving] = React.useState(false);
  const [selected, setSelected] = React.useState(() =>
    Array.isArray(user?.roles) ? user.roles : (user?.role ? [user.role] : [])
  );
  const { user: currentUser, userData } = useAuth();

  React.useEffect(() => {
    setSelected(Array.isArray(user?.roles) ? user.roles : (user?.role ? [user.role] : []));
  }, [user?.id]);

  if (!open || !user) return null;

  const toggle = (r) => {
    setSelected((prev) => {
      const set = new Set(prev || []);
      if (set.has(r)) set.delete(r); else set.add(r);
      return Array.from(set);
    });
  };

  const canEdit = user?.id !== currentUserId;

  const handleSave = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const roles = Array.isArray(selected) ? selected.filter(Boolean) : [];
      const legacy = roles[0] || (user?.role || "standard");
      const db = getFirestore();
      await updateDoc(doc(db, "users", user.id), {
        roles,
        role: legacy,
      });
      // Compute diff and log the action (best-effort; ignore failures)
      try {
        const beforeRoles = Array.isArray(user?.roles)
          ? user.roles
          : (user?.role ? [user.role] : []);
        const added = roles.filter(r => !beforeRoles.includes(r));
        const removed = beforeRoles.filter(r => !roles.includes(r));
        await logAction({
          action: 'user_permissions_changed',
          userId: currentUser?.uid || '',
          userEmail: currentUser?.email || '',
          actingRoles: Array.isArray(userData?.roles) ? userData.roles : (userData?.role ? [userData.role] : []),
          permissionsSnapshot: { adminTrackingLog: !!userData?.permissions?.adminTrackingLog },
          targetType: 'user',
          targetId: user.id,
          context: 'user_management',
          severity: 'info',
          message: `Updated roles for ${user?.email || user.id}: +${added.join(',') || '-'} -${removed.join(',') || '-'}`,
          metadata: { added, removed, beforeRoles, afterRoles: roles, device: { ua: (typeof navigator!== 'undefined' && navigator.userAgent) || '', platform: (typeof navigator!== 'undefined' && navigator.platform) || '', lang: (typeof navigator!== 'undefined' && navigator.language) || '', w: (typeof window!=='undefined' && window.innerWidth) || null, h: (typeof window!=='undefined' && window.innerHeight) || null } },
        });
      } catch (e) {
        // no-op
      }
      if (typeof onSaved === "function") onSaved({ id: user.id, roles, role: legacy });
      onClose && onClose();
    } catch (e) {
      alert("Failed to update roles: " + (e.message || e.toString()));
    }
    setSaving(false);
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose && onClose(); }}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        background: "rgba(0,0,0,0.24)",
        zIndex: 100000000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "92%",
          maxWidth: 520,
          background: "var(--bg-card)",
          color: "var(--text-main)",
          borderRadius: 12,
          boxShadow: "0 10px 30px rgba(0,0,0,0.24)",
          border: "1px solid var(--sidebar-border)",
          padding: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Edit Roles</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: "transparent", border: "none", color: "var(--text-main)", fontSize: 22, cursor: "pointer" }}
          >×</button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, margin: "12px 0 18px" }}>
          {ALL_ROLES.map((r) => {
            const active = (selected || []).includes(r);
            return (
              <button
                key={r}
                onClick={() => toggle(r)}
                disabled={!canEdit}
                style={{
                  padding: "8px 14px",
                  borderRadius: 999,
                  border: active ? "2px solid #3b82f6" : "1.5px solid var(--sidebar-border)",
                  background: active ? "#3b82f6" : "var(--bg-main)",
                  color: active ? "#fff" : "var(--text-main)",
                  cursor: canEdit ? "pointer" : "not-allowed",
                  fontWeight: 600,
                  textTransform: "capitalize",
                }}
              >
                {r}
              </button>
            );
          })}
        </div>
        {!canEdit && (
          <div style={{ color: "#b45309", background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.35)", padding: "8px 12px", borderRadius: 8, marginBottom: 10 }}>
            You cannot edit your own roles.
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button
            onClick={onClose}
            style={{ background: "var(--bg-main)", border: "1.5px solid var(--sidebar-border)", color: "var(--text-main)", borderRadius: 8, padding: "8px 14px", cursor: "pointer" }}
          >Cancel</button>
          <button
            onClick={handleSave}
            disabled={!canEdit || saving}
            style={{ background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, cursor: (!canEdit || saving) ? "not-allowed" : "pointer", opacity: (!canEdit || saving) ? 0.7 : 1 }}
          >{saving ? "Saving..." : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
