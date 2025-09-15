import React, { useState, useEffect } from "react";

/**
 * SettingsOverlay - a standalone overlay for the global settings modal.
 * This is a copy of FadeInOverlay, but not imported from Dashboard.js.
 *
 * @param {number} sidebarWidth - Width of sidebar in px (set to 0 for full-screen overlay)
 * @param {function} onClose - Function to call when overlay is dismissed
 * @param {React.ReactNode|function} children - Modal content or render function (handleFadeOut)
 */

export default function SettingsOverlay({ sidebarWidth = 0, children, onClose }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(true);
  }, []);

  const handleClose = () => {
    setOpen(false);
    setTimeout(() => {
      if (onClose) onClose();
    }, 50); // Match transition duration
  };

  return (
    <div
      className={`settings-overlay${open ? " open" : ""}`}
      style={{
        position: "fixed",
        left: sidebarWidth,
        top: 0,
        width: `calc(100vw - ${sidebarWidth}px)`,
        height: "100vh",
        background: 'rgba(0,0,0,0.24)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        zIndex: 99999999,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        overflowY: "auto"
      }}
      onClick={e => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      {typeof children === "function" ? children(handleClose) : children}
    </div>
  );
}
