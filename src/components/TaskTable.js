import React from "react";
import AssignedEditorsHoverCell from "./AssignedEditorsHoverCell";
import './pulse-dot.css';
import StageProgressBar from "./StageProgressBar";
import { getMediaTypeLabel, getMediaTypeColor } from "../constants/mediaTypes";
import { getStagesForMediaType } from "../constants/stages";

// Inline style for pulsing orange and red rows
const pulseKeyframes = `@keyframes pulseOrange {
  0% { background-color: rgba(255, 184, 117, 0.18); }
  50% { background-color: rgba(255, 184, 117, 0.38); }
  100% { background-color: rgba(255, 184, 117, 0.18); }
}
@keyframes pulseRed {
  0% { background-color: rgba(255, 99, 71, 0.13); }
  50% { background-color: rgba(255, 99, 71, 0.28); }
  100% { background-color: rgba(255, 99, 71, 0.13); }
}`;
if (typeof document !== 'undefined' && !document.getElementById('pulse-orange-style')) {
  const style = document.createElement('style');
  style.id = 'pulse-orange-style';
  style.innerHTML = pulseKeyframes;
  document.head.appendChild(style);
}

const pulseOrangeRow = {
  animation: 'pulseOrange 1.8s infinite',
  backgroundColor: 'rgba(255, 184, 117, 0.18)'
};
const pulseRedRow = {
  animation: 'pulseRed 1.8s infinite',
  backgroundColor: 'rgba(255, 99, 71, 0.13)'
};

// Maps legacy progressState (number) to the new stage name
const STAGE_NAMES = [
  "Created",
  "Scheduling",
  "Shooting",
  "Editing",
  "Publishing",
  "Completed"
];

function getCurrentStage(task) {
  const { NAMES: stageNames } = getStagesForMediaType(task?.mediaType);
  if (!task) return stageNames[0];
  if (typeof task.stage === "string" && stageNames.includes(task.stage)) return task.stage.replace('Ready to Publish', 'Publishing');
  return stageNames[0];
}

// Returns true if the task has been in the SAME stage for more than 4 days
// Uses stageUpdated or lastProgressUpdate (ISO string) as the timestamp for last stage change
// Only marks as stalled if the current stage matches the last updated stage (prevents orange after a stage change)
function isTaskStalled(task) {
  const now = new Date();
  const thresholdMs = 14 * 24 * 60 * 60 * 1000; // 14 days
  const lastStageChange = task.stageUpdated || task.lastProgressUpdate || task.createdAt;
  if (!lastStageChange) return false;
  // If backend provides a "lastStage" or similar, use it for more robust detection
  // Otherwise, assume that stageUpdated/lastProgressUpdate always reflects the current stage
  const last = new Date(lastStageChange);
  return now - last > thresholdMs;
}

const TaskTable = ({ tasks = [], onRowClick, sortColumn, sortDirection, onSort, users = [], visibleColumns, customHeaders = {}, customCellRenderers = {}, columnWidths = {}, rowProps, enableRowProps = false }) => {

  // Lookup function for assigned editor
  const getEditorName = (uid) => {
    if (!uid) return "Unassigned";
    const user = users.find(u => u.uid === uid || u.id === uid);
    return user ? (user.displayName || user.email || user.uid || user.id) : uid;
  };

  // Sort tasks by stage index if sorting by progressState
  let sortedTasks = [...tasks];
  if (sortColumn === "progressState") {
    sortedTasks.sort((a, b) => {
      const { NAMES: stagesA } = getStagesForMediaType(a?.mediaType);
      const { NAMES: stagesB } = getStagesForMediaType(b?.mediaType);
      const idxA = stagesA.indexOf(getCurrentStage(a));
      const idxB = stagesB.indexOf(getCurrentStage(b));
      return sortDirection === "asc" ? idxA - idxB : idxB - idxA;
    });
  } else if (sortColumn) {
    sortedTasks.sort((a, b) => {
      // Special-case: priority request column sorts by unified flag
      if (sortColumn === 'emergency') {
        const aFlag = !!(a.emergency || a.priorityRequest);
        const bFlag = !!(b.emergency || b.priorityRequest);
        if (aFlag === bFlag) return 0;
        return sortDirection === 'asc' ? (aFlag ? -1 : 1) : (aFlag ? 1 : -1);
      }
      if (sortColumn === 'completedDate') {
        const coalesce = (t) => t?.completedDate || t?.lastProgressUpdate || t?.stageUpdated || t?.completedAt || t?.updatedAt || t?.createdAt || null;
        const da = new Date(coalesce(a));
        const db = new Date(coalesce(b));
        const va = da instanceof Date && !isNaN(da);
        const vb = db instanceof Date && !isNaN(db);
        if (!va && !vb) return 0;
        if (!va) return sortDirection === 'asc' ? 1 : -1; // invalids last for asc, first for desc
        if (!vb) return sortDirection === 'asc' ? -1 : 1;
        return sortDirection === 'asc' ? (da - db) : (db - da);
      }
      const valA = a[sortColumn];
      const valB = b[sortColumn];
      if (valA === undefined || valA === null) return 1;
      if (valB === undefined || valB === null) return -1;
      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortDirection === 'asc' ? valA - valB : valB - valA;
    });
  }

  return (
    <div
      style={{
        width: "100%",
        boxShadow: "0 2px 16px rgba(80,120,200,0.07)",
        background: "var(--bg-card)",
        overflow: "hidden"
      }}
    >
      {/* Custom Scrollbar Styles */}
      <style>{`
        .task-table-scroll::-webkit-scrollbar {
          width: 10px;
        }
        .task-table-scroll::-webkit-scrollbar-thumb {
          background: var(--scrollbar-thumb, #c1c8d1);
          border-radius: 8px;
        }
        .task-table-scroll::-webkit-scrollbar-track {
          background: var(--scrollbar-track, transparent);
        }
        .task-table-scroll {
          scrollbar-width: thin;
          scrollbar-color: var(--scrollbar-thumb, #c1c8d1) var(--scrollbar-track, transparent);
        }
      `}</style>
      {/* Two-table pattern for perfect sticky header and alignment */}
      {/* Header-only table */}
      <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", background: "var(--bg-card)" }}>
        <thead>
          <tr>
            {(!visibleColumns || visibleColumns.includes("mediaType")) && (
              <th style={{
                width: columnWidths.mediaType?.width || "5%",
                maxWidth: columnWidths.mediaType?.maxWidth || 160,
                textAlign: "left",
                padding: "14px 12px",
                color: "var(--text-main)",
                fontWeight: 600,
                background: "var(--table-header-bg, var(--table-header))",
                fontSize: 15,
                cursor: "pointer",
                userSelect: "none",
                verticalAlign: "middle"
              }} onClick={() => onSort && onSort("mediaType")}> {sortColumn === "mediaType" && (sortDirection === "asc" ? "\u25b2" : "\u25bc")}</th>
            )}
            {(!visibleColumns || visibleColumns.includes("propertyName")) && (
              <th style={{
                width: columnWidths.propertyName?.width || "18%",
                maxWidth: columnWidths.propertyName?.maxWidth || 180,
                textAlign: "left",
                padding: "14px 12px",
                color: "var(--text-main)",
                fontWeight: 600,
                background: "var(--table-header-bg, var(--table-header))",
                fontSize: 15,
                cursor: "pointer",
                userSelect: "none",
                whiteSpace: "normal",
                wordBreak: "break-word",
                overflow: "hidden",
                textOverflow: "ellipsis",
                verticalAlign: "middle"
              }} onClick={() => onSort && onSort("propertyName")}>Property Name {sortColumn === "propertyName" && (sortDirection === "asc" ? "\u25b2" : "\u25bc")}</th>
            )}
            {(!visibleColumns || visibleColumns.includes("progressState")) && (
              <th style={{
                width: columnWidths.progressState?.width || "16%",
                minWidth: columnWidths.progressState?.minWidth || 120,
                maxWidth: columnWidths.progressState?.maxWidth || 160,
                textAlign: "left",
                padding: "14px 12px",
                color: "var(--text-main)",
                fontWeight: 600,
                background: "var(--table-header-bg, var(--table-header))",
                fontSize: 15,
                cursor: "pointer",
                userSelect: "none",
                verticalAlign: "middle"
              }} onClick={() => onSort && onSort("progressState")}>Progress {sortColumn === "progressState" && (sortDirection === "asc" ? "\u25b2" : "\u25bc")}</th>
            )}
            {(!visibleColumns || visibleColumns.includes("updateType")) && (
              <th style={{
                width: columnWidths.updateType?.width || "25%",
                maxWidth: columnWidths.updateType?.maxWidth || 120,
                textAlign: "left",
                padding: "14px 12px",
                color: "var(--text-main)",
                fontWeight: 600,
                background: "var(--table-header-bg, var(--table-header))",
                fontSize: 15,
                cursor: "pointer",
                userSelect: "none",
                whiteSpace: "normal",
                wordBreak: "break-word",
                verticalAlign: "middle"
              }} onClick={() => onSort && onSort("updateType")}>Update Type {sortColumn === "updateType" && (sortDirection === "asc" ? "\u25b2" : "\u25bc")}</th>
            )}
            {(!visibleColumns || visibleColumns.includes("assignedEditorDisplayName")) && (
              <th
                style={{
                  width: columnWidths.assignedEditorDisplayName?.width || "15%",
                  maxWidth: columnWidths.assignedEditorDisplayName?.maxWidth,
                  textAlign: "center",
                  padding: "14px 12px",
                  color: "var(--text-main)",
                  fontWeight: 600,
                  background: "var(--table-header-bg, var(--table-header))",
                  fontSize: 15,
                  cursor: "pointer",
                  userSelect: "none",
                  verticalAlign: "middle",
                  whiteSpace: "normal",
                  wordBreak: "break-word",
                  overflow: "hidden",
                  textOverflow: "ellipsis"
                }} onClick={() => onSort && onSort("assignedEditorDisplayName")}>Assigned Editor {sortColumn === "assignedEditorDisplayName" && (sortDirection === "asc" ? "\u25b2" : "\u25bc")}
              </th>
            )}
            {(!visibleColumns || visibleColumns.includes("expectedCompletion")) && (
              <th
                style={{
                  width: columnWidths.expectedCompletion?.width || "8%",
                  maxWidth: columnWidths.expectedCompletion?.maxWidth,
                  textAlign: "center",
                  padding: "14px 12px",
                  color: "var(--text-main)",
                  fontWeight: 600,
                  background: "var(--table-header-bg, var(--table-header))",
                  fontSize: 15,
                  cursor: "pointer",
                  userSelect: "none",
                  verticalAlign: "middle",
                  whiteSpace: "normal",
                  wordBreak: "break-word",
                  overflow: "hidden",
                  textOverflow: "ellipsis"
                }} onClick={() => onSort && onSort("expectedCompletion")}>Expected Completion {sortColumn === "expectedCompletion" && (sortDirection === "asc" ? "\u25b2" : "\u25bc")}
              </th>
            )}
            {(!visibleColumns || visibleColumns.includes("emergency")) && (
              <th style={{
                width: columnWidths.emergency?.width || "8%",
                maxWidth: columnWidths.emergency?.maxWidth,
                textAlign: "center",
                padding: "14px 12px",
                color: "var(--text-main)",
                fontWeight: 600,
                background: "var(--table-header-bg, var(--table-header))",
                fontSize: 15,
                cursor: "pointer",
                userSelect: "none",
                verticalAlign: "middle"
              }} onClick={() => onSort && onSort("emergency")}>Priority Request {sortColumn === "emergency" && (sortDirection === "asc" ? "\u25b2" : "\u25bc")}</th>
            )}
            {(!visibleColumns || visibleColumns.includes("completedDate")) && (
              <th style={{
                width: columnWidths.completedDate?.width || "16%",
                maxWidth: columnWidths.completedDate?.maxWidth,
                textAlign: "left",
                padding: "14px 12px",
                color: "var(--text-main)",
                fontWeight: 600,
                background: "var(--table-header-bg, var(--table-header))",
                fontSize: 15,
                userSelect: "none",
                verticalAlign: "middle",
                cursor: "pointer"
              }} onClick={() => onSort && onSort("completedDate")}>
                {(customHeaders && customHeaders.completedDate ? customHeaders.completedDate : "Completed Date")} {sortColumn === "completedDate" && (sortDirection === "asc" ? "\u25b2" : "\u25bc")}
              </th>
            )}
            {(!visibleColumns || visibleColumns.includes("createdAt")) && (
              <th style={{
                width: columnWidths.createdAt?.width || "10%",
                maxWidth: columnWidths.createdAt?.maxWidth,
                textAlign: "left",
                padding: "14px 12px",
                color: "var(--text-main)",
                fontWeight: 600,
                background: "var(--table-header-bg, var(--table-header))",
                fontSize: 15,
                cursor: "pointer",
                userSelect: "none",
                verticalAlign: "middle"
              }} onClick={() => onSort && onSort("createdAt")}>Created Date {sortColumn === "createdAt" && (sortDirection === "asc" ? "\u25b2" : "\u25bc")}</th>
            )}
          </tr>
        </thead>
      </table>
      {/* Body-only table in scrollable area */}
      <div
        className="task-table-scroll"
        style={{
          maxHeight: "80vh",
          overflowY: "auto",
          width: "100%",
          background: "inherit",
        }}
      >
        <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", background: "var(--bg-card)" }}>
          <tbody>
            {sortedTasks.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", color: "var(--text-main)", padding: 32 }}>
                  No tasks to display.
                </td>
              </tr>
            ) : (
              sortedTasks.map((task, idx) => {
                const cellBorder = idx === 0 ? undefined : "1px solid #e7eaf1";
                const isCompleted = task.progressState === 6 || task.stage === 'Completed';
                const isNearDue = (() => {
                  if (!task.expectedCompletion || isCompleted) return false;
                  const due = new Date(task.expectedCompletion);
                  const now = new Date();
                  const diff = (due - now) / (1000 * 60 * 60 * 24);
                  return diff >= 0 && diff <= 3;
                })();
                const isOverdue = (() => {
                  if (!task.expectedCompletion) return false;
                  const due = new Date(task.expectedCompletion);
                  const now = new Date();
                  return due < now;
                })();
                return (
                  <tr
                    key={task.id || idx}
                    {...(enableRowProps && typeof rowProps === "function" ? rowProps(task, idx) : {})}
                    onClick={() => onRowClick && onRowClick(task)}
                    style={{
                      cursor: onRowClick ? "pointer" : undefined,
                      transition: "background 0.15s",
                      color: "var(--text-main)",
                      ...((isOverdue && !isCompleted) ? pulseRedRow : {}),
                      ...((!isOverdue && isNearDue && !isCompleted) ? pulseOrangeRow : {})
                    }}
                    onMouseEnter={e => {
                      if (onRowClick) {
                        const isDark = typeof window !== 'undefined' && window.document?.documentElement?.getAttribute('data-theme') === 'dark';
                        e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.06)" : "#f7faff";
                        e.currentTarget.style.color = 'var(--text-main)';
                      }
                    }}
                    onMouseLeave={e => {
                      if (onRowClick) {
                        e.currentTarget.style.background = isNearDue && !isCompleted ? "rgba(255,184,117,0.18)" : "";
                        e.currentTarget.style.color = 'var(--text-main)';
                      }
                    }}
                  >
                    {( !visibleColumns || visibleColumns.includes("mediaType")) && (
                      <td style={{
                        width: columnWidths.mediaType?.width || "5%",
                        maxWidth: columnWidths.mediaType?.maxWidth || 160,
                        padding: "14px 12px",
                        fontSize: 15,
                        color: 'var(--text-main)',
                        borderTop: cellBorder,
                        background: 'transparent',
                        overflow: 'hidden',
                        verticalAlign: 'middle',
                      }}>
                        <span style={{
                          display: 'inline-block',
                          background: getMediaTypeColor(task.mediaType),
                          color: '#fff',
                          borderRadius: 12,
                          padding: '3px 12px',
                          fontSize: 13,
                          fontWeight: 600,
                          marginRight: 8,
                          verticalAlign: 'middle',
                          minWidth: 0,
                          maxWidth: 120,
                          textOverflow: 'ellipsis',
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                        }}>{getMediaTypeLabel(task.mediaType)}</span>
                      </td>
                    )}
                    {(!visibleColumns || visibleColumns.includes("propertyName")) && (
                      <td style={{
                        width: columnWidths.propertyName?.width || "18%",
                        maxWidth: columnWidths.propertyName?.maxWidth || 180,
                        padding: "14px 12px",
                        fontSize: 15,
                        color: 'var(--text-main)',
                        borderTop: cellBorder,
                        whiteSpace: 'normal',
                        wordBreak: 'break-word',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        verticalAlign: 'middle',
                      }} title={task.propertyName}>
                       {task.propertyName}
                      </td>
                    )}
                    {(!visibleColumns || visibleColumns.includes("progressState")) && (
                      <td style={{
                        width: columnWidths.progressState?.width || "16%",
                        minWidth: columnWidths.progressState?.minWidth || 120,
                        maxWidth: columnWidths.progressState?.maxWidth || 160,
                        padding: "14px 12px 14px 12px",
                        fontSize: 15,
                        color: 'var(--text-main)',
                        borderTop: cellBorder,
                        background: 'transparent',
                        overflow: 'hidden',
                        verticalAlign: 'middle',
                      }}>
                        <StageProgressBar stage={getCurrentStage(task)} mediaType={task.mediaType} isStalled={isTaskStalled(task)} />
                      </td>
                    )}
                    {(!visibleColumns || visibleColumns.includes("updateType")) && (
                      <td className="update-type-cell" style={{
                        width: columnWidths.updateType?.width || "25%",
                        maxWidth: columnWidths.updateType?.maxWidth || 120,
                        padding: "14px 12px",
                        fontSize: 15,
                        color: 'var(--text-main)',
                        borderTop: cellBorder,
                        whiteSpace: 'normal',
                        wordBreak: 'break-word',
                      }}>{task.updateType}</td>
                    )}
                    {(!visibleColumns || visibleColumns.includes("assignedEditorDisplayName")) && (
                      <td style={{
                        width: columnWidths.assignedEditorDisplayName?.width || "15%",
                        maxWidth: columnWidths.assignedEditorDisplayName?.maxWidth,
                        padding: "14px 12px",
                        fontSize: 15,
                        color: 'var(--text-main)',
                        borderTop: cellBorder,
                        textAlign: 'center',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>
                        {/* Multi-editor hover tooltip logic */}
                        {Array.isArray(task.assignedEditors)
                          ? (
                              task.assignedEditors.length === 0
                                ? <span style={{ color: '#888' }}>Unassigned</span>
                                : (
                                    task.assignedEditors.length === 1
                                      ? (() => {
                                          const a = task.assignedEditors[0];
                                          const u = users.find(u => (u.uid || u.id) === a.editorId);
                                          const name = u ? (u.displayName || u.email || u.uid || u.id) : a.editorId;
                                          const label = a.label === 'Custom' ? a.customLabel : a.label;
                                          return <span>{name} <span style={{ color: '#888', fontSize: 13 }}>({label})</span></span>;
                                        })()
                                      : (
                                        <AssignedEditorsHoverCell assignments={task.assignedEditors} users={users} />
                                      )
                                  )
                            )
                          : (getEditorName(task.assignedEditor) || <span style={{ color: '#888' }}>Unassigned</span>)
                        }
                      </td>
                      
                    )}
                     {(!visibleColumns || visibleColumns.includes("expectedCompletion")) && (
                       <td style={{
                         width: columnWidths.expectedCompletion?.width || "8%",
                         maxWidth: columnWidths.expectedCompletion?.maxWidth,
                         padding: "14px 12px",
                         fontSize: 15,
                         color: 'var(--text-main)',
                         borderTop: cellBorder,
                         textAlign: 'center',
                       }}>{task.expectedCompletion ? new Date(task.expectedCompletion).toLocaleDateString() : "-"}</td>
                    )}
                    {(!visibleColumns || visibleColumns.includes("emergency")) && (
                      <td style={{
                        width: columnWidths.emergency?.width || "8%",
                        maxWidth: columnWidths.emergency?.maxWidth,
                        padding: "14px 12px",
                        fontSize: 15,
                        color: 'var(--text-main)',
                        fontWeight: 600,
                        borderTop: cellBorder,
                        textAlign: 'center',
                      }}>
                        {(task.emergency || task.priorityRequest) && (
                          <span style={{
                            display: 'inline-block',
                            width: 18,
                            height: 18,
                            borderRadius: '50%',
                            background: '#d32f2f',
                            opacity: 0.7,
                            animation: 'pulse-dot 1.2s infinite',
                            verticalAlign: 'middle',
                            boxShadow: '0 0 0 0 #d32f2f44'
                          }} />
                        )}
                      </td>
                    )}
                    {(!visibleColumns || visibleColumns.includes("completedDate")) && (
                      <td style={{
                        width: columnWidths.completedDate?.width || "16%",
                        maxWidth: columnWidths.completedDate?.maxWidth,
                        padding: "14px 12px",
                        fontSize: 15,
                        color: 'var(--text-main)',
                        borderTop: cellBorder,
                      }}>
                        {customCellRenderers && customCellRenderers.completedDate
                          ? customCellRenderers.completedDate(task)
                          : (task.completedDate ? (isNaN(new Date(task.completedDate)) ? '-' : new Date(task.completedDate).toLocaleString()) : '-')}
                      </td>
                    )}
                    {(!visibleColumns || visibleColumns.includes("createdAt")) && (
                      <td style={{
                        width: columnWidths.createdAt?.width || "10%",
                        maxWidth: columnWidths.createdAt?.maxWidth,
                        padding: "14px 12px",
                        fontSize: 15,
                        color: 'var(--text-main)',
                        borderTop: cellBorder,
                      }}>
                        {(() => {
                          if (!task.createdAt) return "-";
                          if (typeof task.createdAt.toDate === "function") {
                            const d = task.createdAt.toDate();
                            return isNaN(d) ? "-" : d.toLocaleDateString();
                          }
                          const d = new Date(task.createdAt);
                          return isNaN(d) ? "-" : d.toLocaleDateString();
                        })()}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TaskTable;
