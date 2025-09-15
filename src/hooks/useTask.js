import { useEffect, useState } from "react";
import { getFirestore, doc, onSnapshot } from "firebase/firestore";
import app from "../firebase";

// Custom hook for real-time single task
export default function useTask(taskId) {
  const [task, setTask] = useState(null);
  useEffect(() => {
    if (!taskId) return;
    const db = getFirestore(app);
    const ref = doc(db, "tasks", taskId);
    const unsubscribe = onSnapshot(ref, (docSnap) => {
      setTask(docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null);
    });
    return () => unsubscribe();
  }, [taskId]);
  return task;
}
