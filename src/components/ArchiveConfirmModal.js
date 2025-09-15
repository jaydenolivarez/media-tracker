import React from "react";
import ReactDOM from "react-dom";

export default function ArchiveConfirmModal({ open, onConfirm, onCancel, submitting }) {
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
        zIndex: 120000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        width: "calc(100vw - 68px)",
        marginLeft: "68px",
      }}
      onClick={(e) => {
        if (!submitting && e.target === e.currentTarget) onCancel();
      }}
      aria-modal="true"
      role="dialog"
    >
      <div
        style={{
          background: "var(--bg-card)",
          borderRadius: 16,
          padding: 32,
          width: "22%",
          boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center"
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 18, color: "var(--text-main)" }}>
          Archive Task?
        </div>
        <div style={{ fontSize: 16, color: "var(--text-main)", marginBottom: 28, textAlign: "center" }}>
          Are you sure you want to archive this task? It will be hidden from all lists until restored.
        </div>
        <div style={{ display: "flex", gap: 18 }}>
          <button
            style={{
              background: "#e0e7ef",
              color: "#223",
              border: "none",
              borderRadius: 7,
              padding: "8px 20px",
              fontWeight: 600,
              fontSize: 15,
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.7 : 1
            }}
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            style={{
              background: "#b82e2e",
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
            onClick={onConfirm}
            disabled={submitting}
          >
            {submitting ? "Archiving..." : "Confirm Archive"}
          </button>
        </div>
      </div>
    </div>
  );
  return typeof document !== 'undefined' ? ReactDOM.createPortal(overlay, document.body) : overlay;
}

