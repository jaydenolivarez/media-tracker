import React from "react";
import { FiCheckCircle } from "react-icons/fi";

export default function CompletedTasksNavBubble({ onClick, visible }) {
  if (!visible) return null;
  return (
    <button
      title="Completed Tasks"
      style={{
        position: "relative",
        width: 44,
        height: 44,
        background: "none",
        border: "none",
        padding: 0,
        cursor: "pointer",
        outline: "none",
        marginTop: 24,
        borderRadius: 10,
        transition: "background 0.15s"
      }}
      onClick={onClick}
      aria-label="Completed Tasks"
      onMouseOver={e => { e.currentTarget.style.background = 'var(--sidebar-hover-bg, #6982b5)'; }}
      onMouseOut={e => { e.currentTarget.style.background = 'none'; }}
    >
      <FiCheckCircle size={28} color="#8fe395" />
    </button>
  );
}
