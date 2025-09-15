/**
 * Resolve recipients from heterogeneous structures (string, string[], or
 * { email, mediaTypes? }[]) with optional mediaType filtering.
 *
 * @param {*} raw Input list of recipients.
 * @param {*} mediaTypeKey Optional media type key to filter by.
 * @return {string[]} Flat list of recipient emails after filtering.
 */
function resolveRecipients(raw: unknown, mediaTypeKey?: unknown): string[] {
  const canon = (k: string) => {
    const s = (k || "").toString().trim().toLowerCase();
    if (!s) return "";
    if (s === "photo") return "photos";
    if (s === "3d" || s === "3d_tour") return "3d_tours";
    return s;
  };
  const key = canon((mediaTypeKey ?? "") as string);
  const includeAll = (arr?: unknown[]): boolean => !arr || arr.length === 0;
  if (!raw) return [];
  if (typeof raw === "string") {
    const s = raw.trim();
    return s ? [s] : [];
  }
  if (Array.isArray(raw)) {
    const out: string[] = [];
    type RecipientObj = { email?: unknown; mediaTypes?: unknown[] };
    for (const item of raw as Array<string | RecipientObj>) {
      if (typeof item === "string") {
        const s = item.trim();
        if (s) out.push(s);
        continue;
      }
      if (item && typeof item === "object") {
        const email = (item.email == null ? "" : String(item.email)).trim();
        if (!email) continue;
        const mtList = Array.isArray(item.mediaTypes) ? item.mediaTypes : [];
        const mts: string[] = mtList
          .map((x) => canon(x == null ? "" : String(x)))
          .filter(Boolean);
        if (!key || includeAll(mts) || mts.includes(key)) {
          out.push(email);
        }
      }
    }
    return out;
  }
  return [];
}

// Use v1 import for schedule support
import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import nodemailer from "nodemailer";
import {getAdminDebugNotificationOverrideEmail}
  from "./adminDebugNotificationOverride";

// Only initialize if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const gmailEmail = functions.config().gmail.email;
const gmailPassword = functions.config().gmail.password;

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: gmailEmail,
    pass: gmailPassword,
  },
});

interface Task {
  id: string;
  mediaType?: unknown;
  [key: string]: unknown;
}

/**
 * Gets all tasks that are not
 * completed/archived and haven't been updated in thresholdDays.
 * @param {number} thresholdDays - Number of days to consider a task stagnant.
 * @return {Promise<Task[]>}
 */
async function getStagnantTasks(thresholdDays: number):
  Promise<{task: Task, docRef: FirebaseFirestore.DocumentReference}[]> {
  const now = Date.now();
  const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
  const cutoff = now - thresholdMs;
  const tasksRef = admin.firestore().collection("tasks");
  // Firestore does not support '!=' queries, ...
  // ... so fetch all not completed and filter archived in code
  const snapshot = await tasksRef
    .where("stage", "!=", "Completed") // Not completed
    .get(); // Split for max-len compliance
  const stagnant: {
    task: Task, docRef: FirebaseFirestore.DocumentReference}[] = [];
  snapshot.forEach((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
    const data = doc.data();
    if (data.archived) return;
    const lastUpdateRaw =
      data.stageUpdated ||
      data.lastProgressUpdate ||
      data.createdAt;
    if (!lastUpdateRaw) return;
    let last: number;
    if (lastUpdateRaw.toDate) {
      last = lastUpdateRaw.toDate().getTime();
    } else {
      last = new Date(lastUpdateRaw).getTime();
    }
    // Only consider stagnant if not notified since last update
    const lastNotifiedRaw = data.lastStagnantNotified;
    let lastNotified = 0;
    if (lastNotifiedRaw) {
      if (lastNotifiedRaw.toDate) {
        lastNotified = lastNotifiedRaw.toDate().getTime();
      } else {
        lastNotified = new Date(lastNotifiedRaw).getTime();
      }
    }
    if (last < cutoff && (!lastNotified || lastNotified < last)) {
      stagnant.push({task: {id: doc.id, ...data}, docRef: doc.ref});
    }
  });
  return stagnant;
}

// Helper: Send notification email
/**
 * Sends a stagnant task notification email to the given recipients.
 * @param {Task} task The stagnant task object.
 * @param {string[]} recipients Array of recipient email addresses.
 * @param {number} thresholdDays Number of days to consider a task stagnant.
 * @return {Promise<void>}
 */
async function sendStagnantTaskEmail(
  task: Task, recipients: string[], thresholdDays: number): Promise<void> {
  const propertyName = task.propertyName || task.title || task.id;
  const publicId = task.publicId || task.id;
  const link = `https://media.ortools.co/dashboard/tasks/${publicId}`;
  const updateType = task.updateType;
  const mailOptions = {
    from: `Media Tracker <${gmailEmail}>`,
    to: recipients.join(","),
    subject: `Stagnant Task: ${propertyName}`,
    text:
      "Task for " + propertyName +
      " has not made progress in " + thresholdDays + " days." +
      "\n\nUpdate Type: " + updateType +
      "\n\nTask: " + link,
  };
  await transporter.sendMail(mailOptions);
}

// Scheduled function: runs daily at 8am UTC
export const notifyOnStagnantTasks = functions.pubsub.schedule("0 8 * * *")
  .timeZone("UTC")
  .onRun(async () => {
    await runStagnantTaskNotification();
    return null;
  });

// Manual HTTP trigger for stagnant task notifications
export const triggerStagnantTaskNotificationManually =
  functions.https.onRequest(async (req, res) => {
    try {
      await runStagnantTaskNotification();
      res.status(200).send(
        "Stagnant task notification triggered successfully.");
    } catch (error) {
      console.error("Manual stagnant notification error:", error);
      res.status(500).send("Error triggering stagnant task notification.");
    }
  });

// Core notification logic (shared by both triggers)
/**
 * Runs the stagnant task notification logic.
 * @return {Promise<void>}
 */
async function runStagnantTaskNotification() {
  const notifDoc = await admin
    .firestore()
    .collection("config")
    .doc("notifications")
    .get();
  const thresholdDays = notifDoc.get("stagnantTaskThresholdDays") ?? 14;
  const stagnantTasks = await getStagnantTasks(thresholdDays);
  if (!stagnantTasks.length) return;
  const rawRecipients = notifDoc.get("stagnantTaskRecipients");
  for (const {task, docRef} of stagnantTasks) {
    let recipients = resolveRecipients(rawRecipients, task.mediaType);
    // Admin Debug Override
    const debugEmail = await getAdminDebugNotificationOverrideEmail();
    if (debugEmail) {
      recipients = [debugEmail];
    }
    if (!recipients.length) continue;
    await sendStagnantTaskEmail(task, recipients, thresholdDays);
    // Update lastStagnantNotified
    await docRef.update(
      {lastStagnantNotified: admin.firestore.FieldValue.serverTimestamp()}
    );
  }
}
