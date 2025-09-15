import React, { useEffect, useState } from "react";
import { getFirestore, collection, query, where, onSnapshot } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { FiClock } from "react-icons/fi";

const PendingTasksNavBubble = ({ onClick, visible }) => {
  const [count, setCount] = useState(0);
  const { role } = useAuth();

  useEffect(() => {
    if (!visible) return;
    const db = getFirestore();
    const q = query(collection(db, "tasks"), where("stage", "==", "Scheduling"));
    const unsubscribe = onSnapshot(q, (snap) => {
      setCount(snap.size);
    });
    return unsubscribe;
  }, [visible, role]);

  if (!visible) return null;

  return (
    <button onClick={onClick} style={{
      position: "relative",
      background: "none",
      border: "none",
      marginTop: 24,
      cursor: "pointer",
      width: 44,
      height: 44,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 10
    }} 
    onMouseOver={e => { e.currentTarget.style.background = 'var(--sidebar-hover-bg, #6982b5)'; }}
    onMouseOut={e => { e.currentTarget.style.background = 'none'; }}>
      <FiClock size={28} color="#fff" />
      {count > 0 && (
        <span style={{
          position: "absolute",
          top: 0,
          right: -5,
          background: "#4f8cff",
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
          boxShadow: "0 1px 4px rgba(79,140,255,0.14)",
        }}>
          {count}
        </span>
      )}
    </button>
  );
};

export default PendingTasksNavBubble;
