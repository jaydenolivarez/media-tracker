import React, { useState, useEffect } from "react";

/**
 * FadeInOverlay
 * @param {number} sidebarWidth - Width of sidebar in px (set to 0 for full-screen overlay)
 * @param {function} onClose - Function to call when overlay is dismissed
 * @param {React.ReactNode|function} children - Modal content or render function (handleFadeOut)
 */
export default function FadeInOverlay({ sidebarWidth = 0, children, onClose }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { setVisible(true); }, []);

  // Handler for fade-out
  const handleFadeOut = () => {
    setVisible(false);
    setTimeout(() => {
      if (onClose) onClose();
    }, 350); // match transition duration
  };

  return (
    <div
      style={{
        position: "fixed",
        left: sidebarWidth,
        top: 0,
        width: `calc(100vw - ${sidebarWidth}px)`,
        height: "100vh",
        background: 'rgba(0,0,0,0.24)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        zIndex: 99999,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        overflowY: "auto",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.35s cubic-bezier(.4,0,.2,1)"
      }}
      onClick={e => {
        // Only close if clicking directly on the overlay (not on children/modal)
        if (e.target === e.currentTarget) handleFadeOut();
      }}
    >
      {typeof children === "function" ? children(handleFadeOut) : children}
    </div>
  );
}
