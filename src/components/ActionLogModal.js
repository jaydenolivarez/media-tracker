import React from "react";
import { getFirestore, collection, query, where, Timestamp, getCountFromServer } from "firebase/firestore";

export default function ActionLogModal({ open, onClose }) {
  const [count, setCount] = React.useState(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const db = getFirestore();
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const q = query(
          collection(db, "actionLogs"),
          where("ts", ">=", Timestamp.fromDate(sevenDaysAgo))
        );
        const snapshot = await getCountFromServer(q);
        if (mounted) setCount(snapshot.data().count || 0);
      } catch (_) {
        if (mounted) setCount(0);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [open]);

  if (!open) return null;

  return (
    <div style={modalBackdropStyle} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...modalStyle, display: 'flex', flexDirection: 'column', maxHeight: '90vh', minHeight: 0 }}>
        <button aria-label="Close" onClick={onClose} style={closeBtnStyle}>&times;</button>
        <h2 style={{ margin: 0, fontWeight: 700, color: "var(--text-main)", fontSize: 22, marginBottom: 18, textAlign: 'center', letterSpacing: '-0.5px' }}>
          Action Log
        </h2>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingBottom: 8 }}>
          <div style={{ color: 'var(--text-main)', textAlign: 'center', fontWeight: 600 }}>
            {loading ? 'Loading…' : `(${count ?? 0}) Action(s) recorded in the past 7 days`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 12, justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => { onClose && onClose(); window.location.href = '/admin/action-log'; }}
            style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 18px', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}
          >Open full Action Log</button>
          <button type="button" onClick={onClose} style={cancelBtnStyle}>Close</button>
        </div>
      </div>
    </div>
  );
}

const modalBackdropStyle = {
  position: "fixed",
  top: 0,
  left: 0,
  width: "100vw",
  height: "100vh",
  background: "transparent",
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
  zIndex: 1000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "calc(100vw - 68px)",
};

const modalStyle = {
  background: "var(--bg-card)",
  borderRadius: 14,
  boxShadow: "0 4px 24px rgba(80,120,200,0.15)",
  padding: "32px 28px 24px 28px",
  minWidth: 440,
  maxWidth: "92vw",
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  position: "relative"
};

const cancelBtnStyle = {
  background: "var(--sidebar-bg)",
  border: "1.5px solid var(--sidebar-border)",
  color: "var(--text-main)",
  borderRadius: 8,
  padding: "7px 18px",
  fontWeight: 600,
  fontSize: 15,
  cursor: "pointer"
};

const closeBtnStyle = {
  position: "absolute",
  top: 18,
  right: 18,
  background: "none",
  border: "none",
  color: "#888",
  fontSize: 22,
  cursor: "pointer"
};
