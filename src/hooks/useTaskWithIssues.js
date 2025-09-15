import { useEffect, useState } from "react";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { getFirestore } from "firebase/firestore";

export function useTaskWithIssues(taskId) {
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!taskId) return;
    const db = getFirestore();

    async function fetchTaskAndIssues() {
      setLoading(true);
      try {
        // Fetch main task document
        const taskRef = doc(db, "tasks", taskId);
        const taskSnap = await getDoc(taskRef);
        if (!taskSnap.exists()) {
          setTask(null);
          setLoading(false);
          return;
        }
        const taskData = { id: taskSnap.id, ...taskSnap.data() };

        // Fetch issues subcollection
        const issuesRef = collection(taskRef, "issues");
        const issuesSnap = await getDocs(issuesRef);
        const issues = issuesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Attach issues to task object
        setTask({ ...taskData, issues });
      } catch (e) {
        setTask(null);
      }
      setLoading(false);
    }

    fetchTaskAndIssues();
  }, [taskId]);

  return { task, loading };
}
