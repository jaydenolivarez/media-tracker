// Utility to append a log entry to a task in Firestore
import { getFirestore, doc, updateDoc, arrayUnion } from "firebase/firestore";

/**
 * Appends a log entry to the log array of a task document in Firestore.
 * @param {string} taskId - Firestore document ID of the task
 * @param {object} logEntry - { type, user, timestamp, description }
 */
export async function addTaskLog(taskId, logEntry) {
  const db = getFirestore();
  const taskRef = doc(db, "tasks", taskId);
  await updateDoc(taskRef, {
    log: arrayUnion(logEntry)
  });
}

/**
 * Appends a comment to the comments array of a task document in Firestore.
 * @param {string} taskId - Firestore document ID of the task
 * @param {object} comment - { user, timestamp, message }
 */
export async function addTaskComment(taskId, comment) {
  const db = getFirestore();
  const taskRef = doc(db, "tasks", taskId);
  await updateDoc(taskRef, {
    comments: arrayUnion(comment)
  });
}
