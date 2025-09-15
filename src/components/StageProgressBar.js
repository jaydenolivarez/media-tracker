import React, { useState, useRef, useLayoutEffect } from "react";
import ReactDOM from "react-dom";
import { FiLock, FiUnlock } from "react-icons/fi";
import styles from "./StageProgressBar.module.css";

import { getStagesForMediaType } from "../constants/stages";


/**
 * StageProgressBar
 * Props:
 *   stage: string - Current stage name
 *   editable: boolean - If true, segments are clickable
 *   onStageChange: function - Handler for segment click
 *   isStalled: boolean - If true, highlights the active segment orange to indicate a stalled task
 */

/**
 * StageProgressBar
 * Props:
 *   stage: string - Current stage name
 *   mediaType: string - The media type for the task (e.g., 'photos', '3d_tours')
 *   editable: boolean - If true, segments are clickable
 *   onStageChange: function - Handler for segment click
 *   isStalled: boolean - If true, highlights the active segment orange to indicate a stalled task
 *   hideStageLabel: boolean - If true, hides the stage label
 *   showLockIcon: boolean - If true, shows the lock/unlock icon
 */
export default function StageProgressBar({ stage, mediaType, editable = false, onStageChange, isStalled = false, hideStageLabel = false, showLockIcon = false, onToggleLock }) {
    // Get stages and descriptions for the current mediaType
  const { NAMES: stageNames, DESCRIPTIONS: stageDescriptions } = getStagesForMediaType(mediaType);

  // Defensive: fallback to last stage if unknown
  let currentIdx = stageNames.indexOf(stage);
  let displayStage = stage;
  if (currentIdx === -1) {
    if (stage === "Completed") {
      currentIdx = stageNames.length - 1;
      displayStage = "Completed";
    } else {
      currentIdx = 0; // fallback to 'Created'
      displayStage = stageNames[0];
    }
  }
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ left: 0, top: 0, width: 0 });
  const segmentRefs = useRef([]);
  const tooltipRef = useRef(null);

  useLayoutEffect(() => {
    if (hoveredIdx !== null && segmentRefs.current[hoveredIdx]) {
      const rect = segmentRefs.current[hoveredIdx].getBoundingClientRect();
      let tooltipHeight = 40; // default height
      if (tooltipRef.current) {
        tooltipHeight = tooltipRef.current.offsetHeight;
      }
      let top = rect.top + window.scrollY - tooltipHeight - 8;
      // If not enough space above, show below
      if (top < window.scrollY + 8) {
        top = rect.bottom + window.scrollY + 8;
      }
      setTooltipPos({
        left: rect.left + rect.width / 2,
        top,
        width: rect.width
      });
    }
  }, [hoveredIdx]);

  return (
    <div className={styles.wrapper} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div className={styles.bar} onMouseLeave={() => setHoveredIdx(null)}>
        {stageNames.map((s, i) => {
          let segClass = styles.empty;
          // If completed, all segments green
          if (stage === "Completed") {
            segClass = styles.completed;
          } else if (i < currentIdx) segClass = styles.filled;
          else if (i === currentIdx) segClass = isStalled ? styles.activeStalled : styles.active;
          return (
            <div
              key={s}
              className={`${styles.segment} ${segClass}`}
              aria-label={s}
              tabIndex={editable ? 0 : -1}
              ref={el => (segmentRefs.current[i] = el)}
              style={editable ? { cursor: 'pointer' } : undefined}
              onClick={editable && onStageChange ? () => onStageChange(s) : undefined}
              onKeyDown={editable && onStageChange ? (e) => { if (e.key === 'Enter' || e.key === ' ') onStageChange(s); } : undefined}
              onMouseEnter={() => setHoveredIdx(i)}
              onFocus={() => setHoveredIdx(i)}
              onBlur={() => setHoveredIdx(null)}
            >
              {/* visually hidden label for a11y */}
              <span className={styles.visuallyHidden}>{s}</span>
            </div>
          );
        })}
        
        {hoveredIdx !== null && ReactDOM.createPortal(
          <div
            className={`${styles.tooltip} ${styles.tooltipPortal}`}
            role="tooltip"
            ref={tooltipRef}
            style={{
              position: 'fixed',
              left: tooltipPos.left,
              top: tooltipPos.top,
              transform: 'translate(-50%, 0)',
              pointerEvents: 'none',
              zIndex: 99999,
              opacity: 1
            }}
          >
            <strong>{stageNames[hoveredIdx]}</strong>
            <div>{stageDescriptions[stageNames[hoveredIdx]]}</div>
          </div>,
          document.body
        )}


      </div>
      {!hideStageLabel && <span className={styles.currentStage}>{stage}</span>}
      {showLockIcon && (
        onToggleLock ? (
          editable ? (
            <button
              type="button"
              onClick={onToggleLock}
              title="Lock and save"
              style={{
                marginLeft: 8,
                background: 'transparent',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center'
              }}
              aria-label="Lock and save progress"
            >
              <FiLock />
            </button>
          ) : (
            <button
              type="button"
              onClick={onToggleLock}
              title="Unlock to edit"
              style={{
                marginLeft: 8,
                background: 'transparent',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center'
              }}
              aria-label="Unlock to edit progress"
            >
              <FiUnlock />
            </button>
          )
        ) : (
          editable ? <FiUnlock title="Progress editing unlocked" style={{ marginLeft: 8 }} /> : <FiLock title="Progress editing locked" style={{ marginLeft: 8 }} />
        )
      )}
    </div>
  );
}
