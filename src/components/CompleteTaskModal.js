import React, { useState } from "react";
import ReactDOM from "react-dom";

export default function CompleteTaskModal({ open, onClose, onConfirm, submitting }) {
  const [notes, setNotes] = useState("");
  if (!open) return null;
  const overlay = (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        background: "rgba(0,0,0,0.24)",
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        width: "calc(100vw - 68px)",
        marginLeft: "68px"
      }}
      onClick={() => !submitting && onClose()}
      aria-modal="true"
      role="dialog"
    >
      <div
        style={{
          background: "var(--bg-card)",
          borderRadius: 16,
          padding: 32,
          minWidth: 340,
          maxWidth: 420,
          boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
          display: "flex",
          flexDirection: "column",
          gap: 18,
          alignItems: "stretch",
          position: "relative"
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 6, color: "var(--text-main)" }}>
          Mark Task as Complete
        </div>
        <div style={{ color: "var(--text-main)", fontSize: 15, marginBottom: 10 }}>
          Are you sure you want to mark this task as complete? You may leave an optional note below.
        </div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Completion notes (optional)"
          style={{ minHeight: 80, borderRadius: 8, border: "1.5px solid var(--input-border, #b8c6e6)", padding: 10, fontSize: 15, background: "var(--bg-main)", color: "var(--text-main)", marginBottom: 10 }}
          disabled={submitting}
          maxLength={600}
        />
        <div style={{ display: "flex", gap: 12, marginTop: 10, justifyContent: "flex-end" }}>
          <button
            style={{
              background: "var(--sidebar-bg)",
              color: "var(--text-main)",
              border: "1.5px solid var(--sidebar-border)",
              borderRadius: 7,
              padding: "8px 20px",
              fontWeight: 600,
              fontSize: 15,
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.7 : 1
            }}
            onClick={() => !submitting && onClose()}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            style={{
              background: "#3b82f6",
              color: "#fff",
              border: "none",
              borderRadius: 7,
              padding: "8px 20px",
              fontWeight: 600,
              fontSize: 15,
              cursor: submitting ? "not-allowed" : "pointer",
              boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
              opacity: submitting ? 0.7 : 1
            }}
            onClick={() => !submitting && onConfirm(notes)}
            disabled={submitting}
          >
            {submitting ? "Completing..." : "Confirm Complete"}
          </button>
        </div>
      </div>
    </div>
  );
  return typeof document !== 'undefined' ? ReactDOM.createPortal(overlay, document.body) : overlay;
}


