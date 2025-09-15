import React, { useEffect, useState } from "react";
import { getFirestore, collectionGroup, query, where, onSnapshot, doc, getDoc } from "firebase/firestore";
import { FiAlertCircle } from "react-icons/fi";
import { useAuth } from "../context/AuthContext";

const IssueNavBubble = ({ onClick, visible }) => {
  const [count, setCount] = useState(0);
  const { user, role } = useAuth();

  useEffect(() => {
    const db = getFirestore();
    const q = query(collectionGroup(db, "issues"), where("status", "==", "open"));
    let unsubscribe;
    if (role === "editor" && user?.uid) {
      unsubscribe = onSnapshot(q, async (snap) => {
        // For each issue, fetch parent task and filter
        const issues = snap.docs.map(docSnap => {
          const pathSegments = docSnap.ref.path.split("/");
          const taskId = pathSegments[pathSegments.indexOf("tasks") + 1];
          return { id: docSnap.id, ...docSnap.data(), taskId };
        });
        // Get all unique taskIds
        const uniqueTaskIds = [...new Set(issues.map(i => i.taskId))];
        // Fetch all parent tasks in parallel
        const taskSnaps = await Promise.all(
          uniqueTaskIds.map(async tid => {
            try {
              const docRef = doc(db, "tasks", tid);
              const docSnap = await getDoc(docRef);
              if (docSnap.exists()) {
                return { id: tid, ...docSnap.data() };
              }
            } catch (e) {}
            return { id: tid };
          })
        );
        const tasksObj = {};
        taskSnaps.forEach(t => { if (t && t.id) tasksObj[t.id] = t; });
        // Only count issues where parent task is assigned to this editor and at progressState 4
        const filtered = issues.filter(issue => {
          const task = tasksObj[issue.taskId];
          return task && task.assignedEditor === user.uid && task.progressState === 4;
        });
        setCount(filtered.length);
      });
    } else {
      unsubscribe = onSnapshot(q, (snap) => {
        setCount(snap.size);
      });
    }
    return () => unsubscribe && unsubscribe();
  }, [role, user]);

  if (!visible) return null;

  return (
    <button
      title="View Issues"
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        position: "relative",
        marginTop: 24,
        cursor: "pointer",
        width: 44,
        height: 44,
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}
    >
      <FiAlertCircle size={28} color="#b82e2e" />
      {count > 0 && (
        <span
          style={{
            position: "absolute",
            top: 0,
            right: -5,
            background: "#b82e2e",
            color: "#fff",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 700,
            minWidth: 20,
            height: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 0px",
            boxShadow: "0 1px 4px rgba(184,46,46,0.14)"
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
};

export default IssueNavBubble;
