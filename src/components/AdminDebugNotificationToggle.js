import React, { useEffect, useState } from "react";
import { getAdminDebugState, enableAdminDebug, disableAdminDebug } from "../utils/adminDebugNotification";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { logAction } from "../utils/logAction";

const containerStyle = {
  background: "#fffbe7",
  border: "1.5px solid #f7d674",
  borderRadius: 8,
  padding: "18px 18px 10px 18px",
  marginBottom: 24,
  marginTop: 8,
  color: "#665200",
  fontSize: 16,
  boxShadow: "0 1px 6px rgba(200,180,50,0.07)",
  maxWidth: 480
};
const toggleStyle = {
  margin: "12px 0 0 0",
  padding: "8px 18px",
  background: "#f7d674",
  color: "#665200",
  border: "none",
  borderRadius: 5,
  fontWeight: 600,
  fontSize: 16,
  cursor: "pointer"
};

export default function AdminDebugNotificationToggle() {
  const { user: currentUser, userData } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adminEmail, setAdminEmail] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    async function fetchState() {
      setLoading(true);
      setError("");
      try {
        // Get admin email from Firestore
        const db = getFirestore();
        const notifDoc = await getDoc(doc(db, "notifications", "settings"));
        const email = notifDoc.data()?.adminDebugEmail || "";
        setAdminEmail(email);
        // Get debug state
        const state = await getAdminDebugState();
        if (!mounted) return;
        setEnabled(state.enabled);
      } catch (e) {
        setError("Failed to load admin debug state.");
      }
      setLoading(false);
    }
    fetchState();
    return () => { mounted = false; };
  }, []);

  async function handleToggle() {
    setLoading(true);
    setError("");
    try {
      if (!adminEmail) throw new Error("No admin debug email set in Firestore (notifications/settings.adminDebugEmail)");
      if (!enabled) {
        await enableAdminDebug(adminEmail);
        setEnabled(true);
      } else {
        await disableAdminDebug();
        setEnabled(false);
      }
      // Log action: admin debug toggle
      try {
        const device = { ua: (typeof navigator!== 'undefined' && navigator.userAgent) || '', platform: (typeof navigator!== 'undefined' && navigator.platform) || '', lang: (typeof navigator!== 'undefined' && navigator.language) || '', w: (typeof window!=='undefined' && window.innerWidth) || null, h: (typeof window!=='undefined' && window.innerHeight) || null };
        await logAction({
          action: 'admin_debug_toggle',
          userId: currentUser?.uid || '',
          userEmail: currentUser?.email || '',
          actingRoles: Array.isArray(userData?.roles) ? userData.roles : (userData?.role ? [userData.role] : []),
          permissionsSnapshot: { adminTrackingLog: !!userData?.permissions?.adminTrackingLog },
          targetType: 'config',
          targetId: 'notifications/adminDebug',
          context: 'settings',
          severity: 'warning',
          message: `Admin debug notification redirect: ${!enabled ? 'enabled' : 'disabled'}`,
          metadata: { flag: 'notificationRedirect', newValue: !enabled, device },
        });
      } catch (_) {}
    } catch (e) {
      setError(e.message || "Failed to toggle debug mode.");
    }
    setLoading(false);
  }

  return (
    <div style={containerStyle}>
      <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 8 }}>Admin Debug Notification Redirect</div>
      <div style={{ marginBottom: 8 }}>
        <div><b>Status:</b> {enabled ? <span style={{ color: '#c90000' }}>ENABLED</span> : <span style={{ color: '#0b8600' }}>DISABLED</span>}</div>
        <div><b>Admin Email:</b> <span style={{ color: '#0055b0' }}>{adminEmail || <em>Not set</em>}</span></div>
        <div style={{ fontSize: 14, marginTop: 4 }}>
          When enabled, all notification recipients are temporarily set to the admin email above. Toggle again to restore previous lists. <br />
          <b>To change the admin email, update <code>notifications/settings.adminDebugEmail</code> in Firestore.</b>
        </div>
      </div>
      {error && <div style={{ color: '#c90000', marginBottom: 6 }}>{error}</div>}
      <button style={toggleStyle} onClick={handleToggle} disabled={loading || !adminEmail}>
        {loading ? "Loading..." : (enabled ? "Disable Debug Redirect" : "Enable Debug Redirect")}
      </button>
    </div>
  );
}
