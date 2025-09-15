import { useEffect, useState } from "react";
import { getFirestore, collection, query, onSnapshot } from "firebase/firestore";
import app from "../firebase";

// Custom hook for real-time tasks
export default function useTasks() {
  const [tasks, setTasks] = useState([]);
  useEffect(() => {
    const db = getFirestore(app);
    const q = query(collection(db, "tasks"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const arr = [];
      querySnapshot.forEach((doc) => arr.push({ id: doc.id, ...doc.data() }));
      setTasks(arr);
    });
    return () => unsubscribe();
  }, []);
  return tasks;
}
