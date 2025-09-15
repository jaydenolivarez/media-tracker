import React, { useState, useRef } from "react";

const modalBackdropStyle = {
  position: "fixed",
  top: 0,
  left: 0,
  width: "100vw",
  height: "100vh",
  background: "rgba(0,0,0,0.24)",
  zIndex: 1000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center"
};

const modalStyle = {
  background: "var(--bg-card)",
  borderRadius: 12,
  boxShadow: "0 4px 24px rgba(80,120,200,0.15)",
  padding: "32px 28px 24px 28px",
  minWidth: 340,
  maxWidth: "90vw",
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  position: "relative"
};

const inputStyle = {
  borderRadius: 8,
  border: "1.5px solid var(--sidebar-border)",
  padding: "12px 10px",
  fontSize: 16,
  minHeight: 80,
  marginBottom: 18,
  resize: "vertical",
  background: "var(--bg-main)",
  color: "var(--text-main)",
  width: "100%",
  boxSizing: "border-box"
};

const buttonStyle = {
  background: "#3b82f6",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "10px 0",
  fontWeight: 600,
  fontSize: 16,
  cursor: "pointer",
  marginTop: 8,
  width: "100%"
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

export default function CommentModal({ open, onClose, onSubmit, submitting, error, confirmationMessage }) {
  const [comment, setComment] = useState("");
  const [showConfirmation, setShowConfirmation] = useState(false);
  const timeoutRef = useRef();

  // Always call hooks at the top level

  if (!open) return null;

  // Click outside to close
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && !submitting && !showConfirmation) {
      onClose();
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (comment.trim()) {
      onSubmit(comment.trim(), {
        onSuccess: () => {
          setShowConfirmation(true);
          setComment("");
          timeoutRef.current = setTimeout(() => {
            setShowConfirmation(false);
            onClose();
          }, 1200);
        }
      });
    }
  };


  return (
    <div style={modalBackdropStyle} onClick={handleBackdropClick}>
      <div style={modalStyle}>
        <button style={closeBtnStyle} onClick={onClose} aria-label="Close">×</button>
        <h3 style={{ fontWeight: 600, fontSize: 20, marginBottom: 18, textAlign: 'center' }}>Send Message</h3>
        {showConfirmation ? (
          <div style={{ color: '#219e4a', fontWeight: 600, textAlign: 'center', fontSize: 18, padding: '30px 0 18px 0' }}>
            {confirmationMessage || "Message sent!"}
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <textarea
              style={inputStyle}
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Enter your message..."
              required
              disabled={submitting}
              maxLength={600}
              autoFocus
            />
            {error && <div style={{ color: '#c00', marginBottom: 10 }}>{error}</div>}
            <button type="submit" style={buttonStyle} disabled={submitting || !comment.trim()}>
              {submitting ? "Submitting..." : "Submit"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
