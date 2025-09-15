import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { getUserDisplayName } from "../utils/userDisplayName";
import StageProgressBar from "./StageProgressBar";
import { FiMessageCircle } from "react-icons/fi";
import CommentModal from "./CommentModal";
import { getFirestore, collection, addDoc, serverTimestamp } from "firebase/firestore";
import { getMediaTypeLabel, getMediaTypeColor } from "../constants/mediaTypes";
import { getStagesForMediaType } from "../constants/stages";

// Use canonical stages per media type to determine current stage
function getCurrentStage(task) {
  const { NAMES: stageNames } = getStagesForMediaType(task?.mediaType);
  if (!task) return stageNames[0];
  if (typeof task.stage === "string") {
    const normalized = task.stage.replace("Ready to Publish", "Publishing");
    if (stageNames.includes(normalized)) return normalized;
  }
  return stageNames[0];
}

const TaskLookupTable = ({ tasks = [], onAddNew }) => {
  const { user: currentUser } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTask, setModalTask] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Firestore comment submit handler
  const handleCommentSubmit = async (comment, { onSuccess } = {}) => {
    if (!modalTask || !modalTask.id) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const db = getFirestore();
      // Write comment to subcollection under the task
      const commentsRef = collection(db, "tasks", modalTask.id, "comments");
      const docRef = await addDoc(commentsRef, {
        text: comment,
        user: currentUser?.uid || 'unknown',
        createdAt: serverTimestamp(),
        timestamp: new Date().toISOString(),
        createdVia: "TaskLookupPage", // Ensures only comments from this page trigger notification
        mediaType: "Photos"
      });
      setShowConfirmation(true);
      if (onSuccess) onSuccess();
    } catch (err) {
      setSubmitError("Failed to submit comment. Please try again.");
    }
    setSubmitting(false);
  };


  const handleModalClose = () => {
    setModalOpen(false);
    setModalTask(null);
    setShowConfirmation(false);
    setSubmitError("");
  };

  return (
    <div
      style={{
        width: "100%",
        borderRadius: 14,
        boxShadow: "0 2px 16px rgba(80,120,200,0.07)",
        background: "var(--bg-card)",
        overflow: "hidden",
        marginTop: 16
      }}
    >
      <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", background: "var(--bg-card)" }}>
        <thead>
          <tr>
            <th style={{ width: "15%", textAlign: "left", padding: "14px 6px", color: "var(--text-main)", fontWeight: 600, background: "var(--table-header-bg, var(--sidebar-bg))", fontSize: 15 }}>Media Type</th>
            <th style={{ width: "30%", textAlign: "left", padding: "14px 12px", color: "var(--text-main)", fontWeight: 600, background: "var(--table-header-bg, var(--sidebar-bg))", fontSize: 15 }}>Update Type</th>
            <th style={{ width: "30%", textAlign: "left", padding: "14px 12px", color: "var(--text-main)", fontWeight: 600, background: "var(--table-header-bg, var(--sidebar-bg))", fontSize: 15 }}>Progress</th>
            <th style={{ width: "15%", textAlign: "left", padding: "14px 12px", color: "var(--text-main)", fontWeight: 600, background: "var(--table-header-bg, var(--sidebar-bg))", fontSize: 15 }}>Completed Date</th>
            <th style={{ width: "10%", textAlign: "center", padding: "14px 6px", color: "var(--text-main)", fontWeight: 600, background: "var(--table-header-bg, var(--sidebar-bg))", fontSize: 15 }}></th>
          </tr>
        </thead>
        <tbody>
          {tasks.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ textAlign: "center", color: "var(--text-main)", padding: 32 }}>
                No tasks to display.
              </td>
            </tr>
          ) : (
            tasks.map((task, idx) => {
              // Determine completed date
              // Use the same completed date logic as CompletedTasksView
              let completedDateRaw = task.completedDate || task.lastProgressUpdate || task.stageUpdated || task.completedAt || task.updatedAt || task.createdAt || null;
              let completedDate = "";
              if (completedDateRaw) {
                if (typeof completedDateRaw === "object" && completedDateRaw.seconds) {
                  // Firestore Timestamp
                  completedDate = new Date(completedDateRaw.seconds * 1000).toLocaleDateString();
                } else if (typeof completedDateRaw === "string" || typeof completedDateRaw === "number") {
                  const d = new Date(completedDateRaw);
                  completedDate = isNaN(d) ? "" : d.toLocaleDateString();
                }
              }
              // Only show date if task is completed
              const isCompleted = getCurrentStage(task) === "Completed";
              return (
                <tr key={task.id || idx}>
                  <td style={{ padding: "14px 12px", fontSize: 15, color: 'var(--text-main)' }}>
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
                  <td style={{ padding: "14px 12px", fontSize: 15, color: 'var(--text-main)' }}>{task.updateType}</td>
                  <td style={{ padding: "14px 12px", fontSize: 15, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <StageProgressBar stage={getCurrentStage(task)} mediaType={task.mediaType} isStalled={task.isStalled} />
                  </td>
                  <td style={{ padding: "14px 12px", fontSize: 15, color: 'var(--text-main)' }}>{isCompleted && completedDate ? completedDate : "In Progress"}</td>
                  <td style={{ textAlign: "center", padding: "10px 6px" }}>
                    <button
                      title="Add comment"
                      style={{
                        background: '#f3f6ff',
                        border: 'none',
                        borderRadius: '50%',
                        padding: 8,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 1px 4px rgba(80,120,200,0.08)',
                        transition: 'background 0.15s',
                      }}
                      onClick={() => { setModalOpen(true); setModalTask(task); }}
                    >
                      <FiMessageCircle size={22} color="#4f8cff" />
                    </button>
                  </td>
                </tr>
              );
            })
          )}
          {/* Add New Task Row */}
          <tr>
            <td colSpan={5} style={{ padding: 0, background: 'transparent' }}>
              <button
                type="button"
                style={{
                  width: '100%',
                  background: 'var(--add-row-bg, rgba(79,140,255,0.10))',
                  color: 'var(--text-main)',
                  border: 'none',
                  borderTop: '1.5px solid var(--sidebar-border, #e3e8f0)',
                  borderRadius: '0 0 14px 14px',
                  padding: '10px 0',
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: 'pointer',
                  transition: 'background 0.16s',
                  outline: 'none',
                  letterSpacing: 0.1,
                }}
                onMouseOver={e => { e.currentTarget.style.background = 'var(--add-row-bg-hover, rgba(79,140,255,0.18))'; }}
                onMouseOut={e => { e.currentTarget.style.background = 'var(--add-row-bg, rgba(79,140,255,0.10))'; }}
                onClick={onAddNew}
                tabIndex={0}
              >
                + Request New
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <CommentModal
        open={modalOpen}
        onClose={handleModalClose}
        onSubmit={handleCommentSubmit}
        submitting={submitting}
        error={submitError}
        confirmationMessage="Comment submitted!"
      />
    </div>
  );
};

export default TaskLookupTable;
