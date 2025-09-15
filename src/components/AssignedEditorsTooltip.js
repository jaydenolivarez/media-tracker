import React from "react";
import styles from "./StageProgressBar.module.css";

/**
 * Tooltip for displaying a vertical stack of assigned editors and their labels.
 * Matches the style of StageProgressBar's tooltip.
 * @param {Object[]} assignments - Array of {editorId, label, customLabel}
 * @param {Object[]} users - Array of user objects
 * @param {Object} style - Additional style for positioning
 */
export default function AssignedEditorsTooltip({ assignments, users, style = {} }) {
  return (
    <div className={styles.tooltip} style={style}>
      {assignments.map((a, idx) => {
        const u = users.find(u => (u.uid || u.id) === a.editorId);
        const name = u ? (u.displayName || u.email || u.uid || u.id) : a.editorId;
        const label = a.label === 'Custom' ? a.customLabel : a.label;
        return (
          <div key={a.editorId + '-' + (a.label || '')} style={{ marginBottom: 4, fontWeight: 500 }}>
            {name} <span style={{ color: '#bbb', fontSize: 13 }}>({label})</span>
          </div>
        );
      })}
    </div>
  );
}
