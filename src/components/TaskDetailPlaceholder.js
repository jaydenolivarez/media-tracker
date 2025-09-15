import React from "react";

const TaskDetailPlaceholder = ({ task }) => {
  if (!task) {
    return (
      <div style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#888",
        fontSize: 22,
        fontWeight: 500,
        flexDirection: "column",
        opacity: 0.8,
      }}>
        <div>No task selected</div>
        <div style={{ fontSize: 14, marginTop: 8, color: "#aaa" }}>
          Select a task from the left to view details here.
        </div>
      </div>
    );
  }
  // Placeholder for future task detail content
  return (
    <div style={{ padding: 32 }}>
      <h2>Task Details</h2>
      <pre style={{ fontSize: 14, color: "#555", background: "#f7f7f7", padding: 16, borderRadius: 8 }}>
        {JSON.stringify(task, null, 2)}
      </pre>
    </div>
  );
};

export default TaskDetailPlaceholder;
