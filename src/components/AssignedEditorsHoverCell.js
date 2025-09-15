import React, { useState, useRef } from "react";
import AssignedEditorsTooltip from "./AssignedEditorsTooltip";

export default function AssignedEditorsHoverCell({ assignments, users }) {
  const [hovered, setHovered] = useState(false);
  const cellRef = useRef();
  const [tooltipPos, setTooltipPos] = useState({});

  function handleMouseEnter() {
    if (cellRef.current) {
      const rect = cellRef.current.getBoundingClientRect();
      setTooltipPos({
        left: rect.left + rect.width / 2 + window.scrollX,
        top: rect.top + window.scrollY - 12, // tweak as needed
        width: rect.width
      });
    }
    setHovered(true);
  }

  function handleMouseLeave() {
    setHovered(false);
  }

  return (
    <span
      ref={cellRef}
      style={{ position: "relative", fontWeight: 600, cursor: "pointer" }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      tabIndex={0}
      aria-label="Show assigned editors"
    >
      {assignments.length} Assigned
      {hovered && (
        <div
          style={{
            position: "fixed",
            left: tooltipPos.left,
            top: tooltipPos.top,
            zIndex: 99999,
            pointerEvents: "none"
          }}
        >
          <AssignedEditorsTooltip assignments={assignments} users={users} />
        </div>
      )}
    </span>
  );
}
