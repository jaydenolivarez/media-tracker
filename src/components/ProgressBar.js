// -- DECOMMISSIONED --
// Replaced by StageProgressBar


import React from "react";

export const STAGES = [
  "Created",
  "Scheduling",
  "Shooting",
  "Editing",
  "Publishing",
  "Completed"
];

const STAGE_COLORS = {
  completed: "#096617",
  current: "#5abf69",
  late: "#e38e4d",
  future: "#e7eaf1"
};

// Helper: is the task late?
function isLate(expectedCompletion, currentStageIdx) {
  if (!expectedCompletion || currentStageIdx === STAGES.length - 1) return false;
  const now = new Date();
  const due = new Date(expectedCompletion);
  return now > due;
}

export default function ProgressBar({ progress = 0, expectedCompletion, createdAt, style = {}, compact = false, height = 20, isEditing = false, onStageClick = null }) {
  // Clamp progress
  const stageIdx = Math.max(0, Math.min(progress, STAGES.length - 1));
  const late = isLate(expectedCompletion, stageIdx);

  return (
    <div style={{
      position: 'relative',
      display: "flex",
      alignItems: "center",
      minWidth: 100,
      maxWidth: "100%",
      background: 'var(--bg-card)',
      color: 'var(--text-main)',
      ...style
    }}>
      {isEditing && (
        <span
          style={{
            position: 'absolute',
            left: -10,
            right: -10,
            top: -10,
            bottom: -10,
            borderRadius: 28,
            zIndex: 0,
            background: '#f8f9fa',
            opacity: 0.10,
            animation: 'progressBarPulseWhite 1.2s infinite alternate',
            pointerEvents: 'none',
            transition: 'opacity 0.3s',
          }}
        />
      )}
      <style>{`
        @keyframes progressBarPulseWhite {
          0% { opacity: 0.10; }
          100% { opacity: 0.22; }
        }
      `}</style>
      {STAGES.map((stage, idx) => {
        let color = STAGE_COLORS.future;
        let pulse = false;
        if (idx < stageIdx) color = STAGE_COLORS.completed;
        else if (idx === stageIdx) {
          color = late ? STAGE_COLORS.late : STAGE_COLORS.current;
          pulse = !late;
        }
        // Label color: white for green/orange, dark for gray
        const labelColor = [STAGE_COLORS.completed, STAGE_COLORS.current, STAGE_COLORS.late].includes(color) ? "#fff" : "#223";
        return (
          <div key={stage} style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginRight: idx !== STAGES.length - 1 ? 2 : 0
          }}>
            <div
              style={{
                width: "100%",
                minWidth: 48,
                height: height,
                borderRadius: height / 2,
                background: color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 500,
                fontFamily: 'Inter, Arial, sans-serif',
                fontSize: 12,
                color: labelColor,
                overflow: "hidden",
                position: "relative",
                transition: "background 0.2s",
                letterSpacing: 0.06,
                cursor: isEditing ? 'pointer' : 'default'
              }}
              aria-label={isEditing ? `Set progress to ${stage}` : undefined}
              onClick={isEditing && onStageClick ? () => onStageClick(idx) : undefined}
            >
              <span
                style={{
                  position: "absolute",
                  top: 0, left: 0, right: 0, bottom: 0,
                  borderRadius: 11,
                  zIndex: 0,
                  pointerEvents: "none",
                  background: pulse
                    ? (color === STAGE_COLORS.late
                        ? undefined
                        : color)
                    : undefined,
                  animation: pulse
                    ? (color === STAGE_COLORS.late
                        ? "progressPulseOrange 1.5s infinite alternate"
                        : "progressPulseGreen 1.5s infinite alternate")
                    : undefined
                }}
              />
              <span style={{ position: "relative", zIndex: 1 }}>{stage}</span>
            </div>
          </div>
        );
      })}
      {/* Add keyframes for pulsing effect */}
      <style>{`
        @keyframes progressPulseGreen {
          0% { background: #5abf69; }
          100% { background: #92e7a2; }
        }
        @keyframes progressPulseOrange {
          0% { background: #e38e4d; }
          100% { background: #ffd2a1; }
        }
      `}</style>
    </div>
  );
}
