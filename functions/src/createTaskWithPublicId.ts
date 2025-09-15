import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";

const db = admin.firestore();

/**
 * Callable Cloud Function to create a new task with an atomic,
incrementing publicId.
 * Expects taskData (object) as parameter.
 * Returns: { taskId, publicId }
 */
export const createTaskWithPublicId =
functions.https.onCall(async (data, context) => {
  // Optionally, check for authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated", "User must be authenticated"
    );
  }

  const taskData = data.taskData;
  if (!taskData) {
    throw new functions.https.HttpsError(
      "invalid-argument", "Missing taskData"
    );
  }

  const counterRef = db.doc("counters/taskPublicId");
  const tasksRef = db.collection("tasks");

  // Run everything in a transaction and return the taskId and publicId
  const result = await db.runTransaction(async (transaction) => {
    const counterSnap = await transaction.get(counterRef);
    if (!counterSnap.exists) {
      throw new functions.https.HttpsError(
        "failed-precondition", "Counter does not exist."
      );
    }
    const current = counterSnap.get("current") || 0;
    const newPublicId = current + 1;
    transaction.update(counterRef, {current: newPublicId});

    const newTaskData = {
      ...taskData,
      publicId: newPublicId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: context.auth!.uid,
    };
    const taskRef = tasksRef.doc(); // Pre-generate ID for atomicity
    transaction.set(taskRef, newTaskData);

    return {taskId: taskRef.id, publicId: newPublicId};
  });

  return result;
});
