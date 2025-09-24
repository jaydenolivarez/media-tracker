import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import * as nodemailer from "nodemailer";
import {getAdminDebugNotificationOverrideEmail}
  from "./adminDebugNotificationOverride";

const db = admin.firestore();

// Email config from environment
const gmailEmail = functions.config().gmail.email;
const gmailPass = functions.config().gmail.password;

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: gmailEmail,
    pass: gmailPass,
  },
});


/**
 * Resolve a heterogeneous recipients setting into a string[] of emails,
 * optionally filtering by mediaType key if provided.
 * Accepts values in these shapes:
 * - string
 * - string[]
 * - { email: string, mediaTypes?: string[] }[]
 *
 * @param {*} raw Input list of recipients
 * @param {*} [opts] Optional options with opts.mediaTypeKey...
 * ... specifying the media type filter
 * @return {string[]} Flat list of recipient emails after filtering
 */
function resolveRecipients(
  raw: unknown,
  opts?: { mediaTypeKey?: string }
): string[] {
  const canon = (k: string) => {
    const s = (k || "").toString().trim().toLowerCase();
    if (!s) return "";
    if (s === "photo") return "photos";
    if (s === "3d" || s === "3d_tour") return "3d_tours";
    return s;
  };
  const mediaKey = canon(opts?.mediaTypeKey || "");
  if (!raw) return [];
  const includeAll = (arr?: unknown[]): boolean => !arr || arr.length === 0;

  if (typeof raw === "string") {
    const s = raw.trim();
    return s ? [s] : [];
  }
  if (Array.isArray(raw)) {
    type RecipientObj = { email?: unknown; mediaTypes?: unknown[] };
    const out: string[] = [];
    for (const item of raw as Array<string | RecipientObj>) {
      if (typeof item === "string") {
        const s = item.trim();
        if (s) out.push(s);
        continue;
      }
      if (item && typeof item === "object") {
        const email = (item.email == null ? "" : String(item.email)).trim();
        if (!email) continue;
        const rawMts = Array.isArray(item.mediaTypes) ? item.mediaTypes : [];
        const mts = (rawMts as unknown[])
          .map((x) => canon(String(x ?? "")))
          .filter((v) => Boolean(v));
        const allow = !mediaKey || includeAll(mts) || mts.includes(mediaKey);
        if (allow) out.push(email);
      }
    }
    return out;
  }
  return [];
}


/**
 * Normalize internal mediaType values to human-friendly labels for emails.
 * Examples: 'photos' -> 'Photo', '3d_tours' -> '3D Tour'.
 *
 * @param {unknown} mt - Raw mediaType value from the task document.
 * @return {string} Human-friendly media type label for display.
 */
function formatMediaType(mt: unknown): string {
  const raw = (mt ?? "").toString().trim().toLowerCase();
  const map: Record<string, string> = {
    "photos": "Photo",
    "photo": "Photo",
    "3d_tours": "3D Tour",
    "3d_tour": "3D Tour",
    "3d": "3D Tour",
  };
  if (map[raw]) return map[raw];
  if (!raw) return "Media";
  const pretty = raw.replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return pretty || "Media";
}


export const notifyOnTaskCreate = functions.firestore
  .document("tasks/{taskId}")
  .onCreate(
    async (
      snap: FirebaseFirestore.QueryDocumentSnapshot,
      context: functions.EventContext
    ) => {
      console.log("notifyOnTaskCreate TRIGGERED",
        {taskId: snap.id, contextParams: context.params});
      const taskData = snap.data();
      console.log("notifyOnTaskCreate taskData:", taskData);
      if (!taskData) {
        return;
      }

      // Attempt to auto-attach iCal for New Property tasks
      // Conditions:
      // - updateType === "New Property" OR isNewProperty === true
      // - task does not already have an ical
      try {
        const isNewPropertyTask =
          (taskData.updateType === "New Property") ||
          (taskData.isNewProperty === true);
        if (isNewPropertyTask && !taskData.ical) {
          const propDoc =
          await db.collection("autocomplete").doc("propertyNames").get();
          const namesList: unknown[] =
          Array.isArray(propDoc.get("names")) ? propDoc.get("names") : [];
          const rawProperty = (taskData.propertyName || "").toString();
          const lowerProp = rawProperty.trim().toLowerCase();

          let matchedIcal: string | null = null;
          for (const itemRaw of namesList) {
            if (!itemRaw) {
              continue;
            }
            const item = itemRaw as {
              unitCode?: unknown;
              name?: unknown;
              ical?: string;
            };
            const uc = (item.unitCode || "").toString().trim().toLowerCase();
            const nm = (item.name || "").toString().trim().toLowerCase();
            if ((uc && uc === lowerProp) || (nm && nm === lowerProp)) {
              if (item.ical) {
                matchedIcal = item.ical;
              }
              break;
            }
          }

          if (matchedIcal) {
            await db.collection("tasks")
              .doc(snap.id)
              .update({ical: matchedIcal});
            console.log(
              "notifyOnTaskCreate: Attached iCal from " +
              "autocomplete/propertyNames",
              {
                taskId: snap.id,
                propertyName: taskData.propertyName,
                ical: matchedIcal,
              });
          } else {
            console.log(
              "notifyOnTaskCreate: No iCal match found for property",
              {
                taskId: snap.id,
                propertyName: taskData.propertyName,
              });
          }
        }
      } catch (err) {
        console.warn(
          "notifyOnTaskCreate: Failed while attempting to auto-attach iCal",
          err);
      }

      // Detect notification type (fallback to createdVia for legacy)
      // kept for future use if needed

      // Fetch notification recipients from Firestore settings
      let recipientEmails: string[] = [];
      try {
        const notifDoc = await db
          .collection("notifications")
          .doc("settings")
          .get();
        const mediaRequestRecipients =
          notifDoc.get("mediaRequestCreation");
        const mediaKey = ((taskData.mediaType || "") + "")
          .toLowerCase();
        recipientEmails = resolveRecipients(
          mediaRequestRecipients,
          {mediaTypeKey: mediaKey}
        );
        // Admin Debug Override: only override if there are matches
        const debugEmail = await getAdminDebugNotificationOverrideEmail();
        const hadMatches = recipientEmails.length > 0;
        if (debugEmail && hadMatches) {
          recipientEmails = [debugEmail];
        }
      } catch (err) {
        console.warn(
          "Could not fetch notification recipients from settings:", err);
        return;
      }
      // Extract creator UID from log[0].user and fetch their email from Auth
      let creatorEmail = "";
      if (
        Array.isArray(taskData.log) &&
        taskData.log[0] &&
        taskData.log[0].user &&
        taskData.log[0].user.uid
      ) {
        const creatorUid = taskData.log[0].user.uid;
        try {
          const userRecord = await admin.auth().getUser(creatorUid);
          creatorEmail = userRecord.email || "";
        } catch (err) {
          console.warn("Could not fetch creator email for filtering:", err);
        }
      }
      // Exclude creator from notification recipients
      if (creatorEmail) {
        const creatorEmailNorm = creatorEmail.trim().toLowerCase();
        recipientEmails = recipientEmails.filter(
          (email) => email.trim().toLowerCase() !== creatorEmailNorm
        );
      }
      if (recipientEmails.length === 0) {
        console.log("No notification recipients (other than creator)");
        return;
      }

      // Extract user info from log[0].user
      let creatorName = "";
      if (Array.isArray(taskData.log) &&
      taskData.log[0] &&
      taskData.log[0].user) {
        const user = taskData.log[0].user;
        creatorName = user.displayName ||
        user.email ||
        user.uid || "Unknown User";
      }
      // Fetch notes (first comment in comments subcollection)
      let notes = "";
      try {
        const commentsSnap = await db.collection(
          `tasks/${snap.id}/comments`).orderBy("createdAt").limit(1).get();
        if (!commentsSnap.empty) {
          notes = commentsSnap.docs[0].get("text") || "";
        }
      } catch (err) {
        console.warn("Could not fetch notes for notification email", err);
      }

      // Prepare email content based on notification type
      const publicId = taskData.publicId || context.params.taskId;
      const link = `https://media.ortools.co/dashboard/tasks/${publicId}`;
      const mediaType = formatMediaType(taskData.mediaType);
      const mailOptions = {
        from: `Media Tracker <${gmailEmail}>`,
        to: recipientEmails.join(","),
        subject: `New ${mediaType} Request Created`,
        text:
            "A new media request has been created.\n\n" +
            `Property: ${taskData.propertyName || ""}\n` +
            `Update Type: ${taskData.updateType || ""}\n` +
            `Notes: ${notes}\n` +
            (taskData.nextAvailable &&
              (taskData.nextAvailable.start ||
                taskData.nextAvailable.end) ?
              `Next Available:\n${taskData.nextAvailable.start ||
                "—"} to ${taskData.nextAvailable.end || "—"}\n` :
              "") +
            `Created By: ${creatorName}\n` +
            `Task Link: ${link}`,
        html:
            `<h3>New ${mediaType} Request Created</h3>` +
            `<p><b>Property:</b> ${taskData.propertyName || ""}<br/>` +
            `<b>Update Type:</b> ${taskData.updateType || ""}<br/>` +
            `<b>Notes:</b> ${notes}<br/>` +
            (taskData.nextAvailable &&
              (taskData.nextAvailable.start ||
                taskData.nextAvailable.end) ?
              `<b>Next Available:</b> ${taskData.nextAvailable.start ||
                "—"} to ${taskData.nextAvailable.end || "—"}<br/>` :
              "") +
            `<b>Created By:</b> ${creatorName}<br/>` +
            `<b>Task Link:</b> <a href='${link}'>View Task</a></p>`,
      };


      try {
        await transporter.sendMail(mailOptions);
        console.log("Notification email sent to", recipientEmails);
      } catch (err) {
        console.error("Failed to send notification email:", err);
      }
    }
  );

// Notify tagged users when they are mentioned in a comment
export const notifyOnTaskComment = functions.firestore
  .document("tasks/{taskId}/comments/{commentId}")
  .onCreate(async (snap, context) => {
    const comment = snap.data();
    if (!comment || !Array.isArray(comment.taggedUsers) ||
    comment.taggedUsers.length === 0) return;
    const {taskId} = context.params;
    // Fetch task for property name and link
    const taskSnap = await db.collection("tasks").doc(taskId).get();
    const task = taskSnap.exists ? taskSnap.data() : {};
    const propertyName = task?.propertyName || "";
    const link = `https://media.ortools.co/dashboard/tasks/${task?.publicId || taskId}`;
    // Fetch all tagged user emails
    const userEmails: string[] = [];
    for (const uid of comment.taggedUsers) {
      try {
        const userRecord = await admin.auth().getUser(uid);
        if (userRecord.email) userEmails.push(userRecord.email);
      } catch (err) {
        console.warn("Could not fetch user for mention notification:",
          uid, err);
      }
    }
    if (userEmails.length === 0) return;
    // Send notification email to each tagged user
    // Get commenter name
    // Prefer top-level displayName/email/uid,
    // but fall back to comment.user fields
    const commenterName =
      comment.displayName ||
      (comment.user &&
        (comment.user.displayName ||
        comment.user.email ||
        comment.user.uid)) ||
      comment.email ||
      comment.uid ||
      "Unknown User";
    const mailOptions = {
      from: `Media Tracker <${gmailEmail}>`,
      to: userEmails.join(","),
      subject: "You were mentioned in a comment",
      text:
        `You were mentioned in a comment on property: ${propertyName}\n` +
        `Comment: ${comment.text || ""}\n` +
        `Commented by: ${commenterName}\n` +
        `View task: ${link}`,
      html:
        "<h3>You were mentioned in a comment</h3>" +
        `<p><b>Property:</b> ${propertyName}<br/>` +
        `<b>Comment:</b> ${comment.text || ""}<br/>` +
        `<b>Commented by:</b> ${commenterName}<br/>` +
        `<b>Task Link:</b> <a href='${link}'>View Task</a></p>`,
    };
    try {
      await transporter.sendMail(mailOptions);
      console.log("Mention notification sent to", userEmails);
    } catch (err) {
      console.error("Failed to send mention notification:", err);
    }
  });

// Notify when a comment is left via TaskLookupPage
// Notify when a task is marked as completed
export const notifyOnTaskCompletion = functions.firestore
  .document("tasks/{taskId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    if (!before || !after) return;

    // Detect transition to completed
    // (stage === "completed" or status === 'completed')
    const wasCompleted = before.stage === "Completed" ||
    before.status === "Completed";
    const isCompleted = after.stage === "Completed" ||
    after.status === "Completed";
    if (!isCompleted || wasCompleted) return; // Only trigger on transition

    const notifDoc = await db.doc("notifications/settings").get();
    const completionRaw = notifDoc.get("taskCompletion");
    const completionKey = ((after.mediaType || "") + "").toLowerCase();
    const completionOpts = {mediaTypeKey: completionKey};
    let recipients = resolveRecipients(completionRaw, completionOpts);
    // Admin Debug Override: only override if there are matches
    const debugEmail = await getAdminDebugNotificationOverrideEmail();
    const hadMatches = recipients.length > 0;
    if (debugEmail && hadMatches) {
      recipients = [debugEmail];
    }
    console.log("taskCompletion recipients:", recipients);
    if (!hadMatches) {
      console.log("No notification recipients set for task completions.");
      return;
    }

    const propertyName = after.propertyName || "";
    const updateType = after.updateType || "";
    // Fetch notes from the initial note comment (tagged on creation)
    let notes = "";
    try {
      const commentsRef =
      db.collection(`tasks/${context.params.taskId}/comments`);
      const initialNoteSnap = await commentsRef
        .where("isInitialNote", "==", true)
        .limit(1)
        .get();
      if (!initialNoteSnap.empty) {
        notes = initialNoteSnap.docs[0].get("text") || "";
      }
    } catch (err) {
      console.warn(
        "notifyOnTaskCompletion:",
        "Could not fetch initial notes for notification email",
        err
      );
    }
    const publicId = after.publicId || context.params.taskId;
    const link = "https://media.ortools.co/dashboard/tasks/" + publicId;

    const mediaTypeSuffix =
      after.mediaType ? ` - ${formatMediaType(after.mediaType)}` : "";
    const mailOptions = {
      from: `Media Tracker <${gmailEmail}>`,
      to: recipients.join(","),
      subject: `Task Completed${mediaTypeSuffix}`,
      text:
        "A task has been marked as completed.\n\n" +
        `Property: ${propertyName}\n` +
        `Update Type: ${updateType}\n` +
        `Notes: ${notes}\n` +
        `View task: ${link}`,
      html:
        `<h3>Task Completed${mediaTypeSuffix}</h3>` +
        `<p><b>Property:</b> ${propertyName}<br/>` +
        `<b>Update Type:</b> ${updateType}<br/>` +
        `<b>Notes:</b> ${notes}<br/>` +
        `<b>Task Link:</b> <a href='${link}'>View Task</a></p>`,
    };
    console.log("notifyOnTaskCompletion: mailOptions:", mailOptions);
    try {
      const info = await transporter.sendMail(mailOptions);
      console.log("notifyOnTaskCompletion: Email sent. Info:", info);
    } catch (err) {
      console.error("notifyOnTaskCompletion: Failed to send email:", err);
    }
  });

// Notify when a task's shooting is marked complete (via task log entry)
export const notifyOnShootingCompletion = functions.firestore
  .document("tasks/{taskId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    if (!before || !after) return;

    type TaskLogEntry = {
      type?: string;
      user?: { displayName?: string; email?: string; uid?: string };
      [key: string]: unknown;
    };
    const beforeLogs: TaskLogEntry[] = Array.isArray(before.log) ?
      (before.log as TaskLogEntry[]) : [];
    const afterLogs: TaskLogEntry[] = Array.isArray(after.log) ?
      (after.log as TaskLogEntry[]) : [];
    // Find newly-added shooting_completed entries
    const newlyAdded = afterLogs.filter((entry: TaskLogEntry) =>
      entry && entry.type === "shooting_completed" &&
      !beforeLogs.some(
        (b: TaskLogEntry) => JSON.stringify(b) === JSON.stringify(entry)
      )
    );
    if (newlyAdded.length === 0) return;

    // Fetch recipients from notifications/settings
    const notifDoc = await db.doc("notifications/settings").get();
    let recipients: string[] = [];
    try {
      const shootRaw = notifDoc.get("shootingCompletion");
      const key = ((after.mediaType || "") + "").toLowerCase();
      recipients = resolveRecipients(shootRaw, {mediaTypeKey: key});
    } catch (err) {
      console.warn(
        "notifyOnShootingCompletion: Failed to read settings:",
        err
      );
    }
    // Admin Debug Override: only override if there are matches
    const debugEmail = await getAdminDebugNotificationOverrideEmail();
    const hadMatches = recipients.length > 0;
    if (debugEmail && hadMatches) {
      recipients = [debugEmail];
    }
    if (!hadMatches) {
      console.log("notifyOnShootingCompletion: No recipients set.");
      return;
    }

    const propertyName = after.propertyName || "";
    const updateType = after.updateType || "";
    const publicId = after.publicId || context.params.taskId;
    const link = `https://media.ortools.co/dashboard/tasks/${publicId}`;
    const mediaTypeSuffix = after.mediaType ?
      ` - ${formatMediaType(after.mediaType)}` :
      "";

    // Actor info (take the last newly-added entry)
    const actor = newlyAdded[newlyAdded.length - 1];
    const actorName =
      actor?.user?.displayName ||
      actor?.user?.email ||
      actor?.user?.uid ||
      "Unknown User";

    // Attempt to fetch the most recent shooting completion notes comment
    let notes = "";
    try {
      const commentsSnap = await db
        .collection(`tasks/${context.params.taskId}/comments`)
        .orderBy("createdAt", "desc")
        .limit(10)
        .get();
      for (const d of commentsSnap.docs) {
        const txt = (d.get("text") || "").toString();
        if (/^Shooting Completion Notes:\s/i.test(txt)) {
          notes = txt.replace(/^Shooting Completion Notes:\s*/i, "").trim();
          break;
        }
      }
    } catch (err) {
      console.warn("notifyOnShootingCompletion: Could not fetch notes:", err);
    }

    const mailOptions = {
      from: `Media Tracker <${gmailEmail}>`,
      to: recipients.join(","),
      subject: `Shooting Completed${mediaTypeSuffix}`,
      text:
        "Shooting has been marked complete for a task.\n\n" +
        `Property: ${propertyName}\n` +
        `Update Type: ${updateType}\n` +
        (notes ? `Notes: ${notes}\n` : "") +
        `Marked By: ${actorName}\n` +
        `View task: ${link}`,
      html:
        `<h3>Shooting Completed${mediaTypeSuffix}</h3>` +
        `<p><b>Property:</b> ${propertyName}<br/>` +
        `<b>Update Type:</b> ${updateType}<br/>` +
        (notes ? `<b>Notes:</b> ${notes}<br/>` : "") +
        `<b>Marked By:</b> ${actorName}<br/>` +
        `<b>Task Link:</b> <a href='${link}'>View Task</a></p>`,
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      console.log("notifyOnShootingCompletion: Email sent.", info);
    } catch (err) {
      console.error("notifyOnShootingCompletion: Failed to send email:", err);
    }
  });

// Notify when editing is submitted for review (via task log entry)
export const notifyOnEditingSubmission = functions.firestore
  .document("tasks/{taskId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    if (!before || !after) return;

    type TaskLogEntry = {
      type?: string;
      user?: { displayName?: string; email?: string; uid?: string };
      [key: string]: unknown;
    };
    const beforeLogs: TaskLogEntry[] = Array.isArray(before.log) ?
      (before.log as TaskLogEntry[]) : [];
    const afterLogs: TaskLogEntry[] = Array.isArray(after.log) ?
      (after.log as TaskLogEntry[]) : [];
    const newlyAdded = afterLogs.filter((entry: TaskLogEntry) =>
      entry && entry.type === "editing_completed" &&
      !beforeLogs.some(
        (b: TaskLogEntry) => JSON.stringify(b) === JSON.stringify(entry)
      )
    );
    if (newlyAdded.length === 0) return;

    const notifDoc = await db.doc("notifications/settings").get();
    let recipients: string[] = [];
    try {
      const editRaw = notifDoc.get("editingCompletion");
      const key = ((after.mediaType || "") + "").toLowerCase();
      recipients = resolveRecipients(editRaw, {mediaTypeKey: key});
    } catch (err) {
      console.warn(
        "notifyOnEditingSubmission: Failed to read settings:",
        err
      );
    }
    const debugEmail = await getAdminDebugNotificationOverrideEmail();
    const hadMatches = recipients.length > 0;
    if (debugEmail && hadMatches) {
      recipients = [debugEmail];
    }
    if (!hadMatches) {
      console.log("notifyOnEditingSubmission: No recipients set.");
      return;
    }

    const propertyName = after.propertyName || "";
    const updateType = after.updateType || "";
    const publicId = after.publicId || context.params.taskId;
    const link = `https://media.ortools.co/dashboard/tasks/${publicId}`;
    const mediaTypeSuffix = after.mediaType ?
      ` - ${formatMediaType(after.mediaType)}` :
      "";

    const actor = newlyAdded[newlyAdded.length - 1];
    const actorName =
      actor?.user?.displayName ||
      actor?.user?.email ||
      actor?.user?.uid ||
      "Unknown User";

    let notes = "";
    try {
      const commentsSnap = await db
        .collection(`tasks/${context.params.taskId}/comments`)
        .orderBy("createdAt", "desc")
        .limit(10)
        .get();
      for (const d of commentsSnap.docs) {
        const txt = (d.get("text") || "").toString();
        if (/^Editing Completion Notes\b/i.test(txt)) {
          notes = txt.replace(/^Editing Completion Notes\s*/i, "").trim();
          break;
        }
      }
    } catch (err) {
      console.warn("notifyOnEditingSubmission: Could not fetch notes:", err);
    }

    const mailOptions = {
      from: `Media Tracker <${gmailEmail}>`,
      to: recipients.join(","),
      subject: `Editing Submitted for Review${mediaTypeSuffix}`,
      text:
        "An edit has been submitted for review.\n\n" +
        `Property: ${propertyName}\n` +
        `Update Type: ${updateType}\n` +
        (notes ? `Notes: ${notes}\n` : "") +
        `Submitted By: ${actorName}\n` +
        `View task: ${link}`,
      html:
        `<h3>Editing Submitted for Review${mediaTypeSuffix}</h3>` +
        `<p><b>Property:</b> ${propertyName}<br/>` +
        `<b>Update Type:</b> ${updateType}<br/>` +
        (notes ? `<b>Notes:</b> ${notes}<br/>` : "") +
        `<b>Submitted By:</b> ${actorName}<br/>` +
        `<b>Task Link:</b> <a href='${link}'>View Task</a></p>`,
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      console.log("notifyOnEditingSubmission: Email sent.", info);
    } catch (err) {
      console.error("notifyOnEditingSubmission: Failed to send email:", err);
    }
  });

export const notifyOnTaskLookupComment = functions.firestore
  .document("tasks/{taskId}/comments/{commentId}")
  .onCreate(async (snap, context) => {
    const comment = snap.data();
    console.log("notifyOnTaskLookupComment: FUNCTION TRIGGERED");
    console.log(
      "notifyOnTaskLookupComment: createdVia value:",
      comment?.createdVia
    );
    console.log("notifyOnTaskLookupComment: full comment object:", comment);
    if (!comment || comment.createdVia !== "TaskLookupPage") return;
    const {taskId} = context.params;
    // Fetch notification email for task comments
    const notifDoc = await db.doc("notifications/settings").get();
    let recipients = resolveRecipients(notifDoc.get("taskComment"));
    // Admin Debug Override: only override if there are matches
    const debugEmail = await getAdminDebugNotificationOverrideEmail();
    const hadMatches = recipients.length > 0;
    if (debugEmail && hadMatches) {
      recipients = [debugEmail];
    }
    console.log("notifyOnTaskLookupComment: recipients:", recipients);
    if (!hadMatches) {
      console.log("No notification email set for task comments.");
      return;
    }
    // Fetch parent task for property name and link
    const taskSnap = await db.collection("tasks").doc(taskId).get();
    const task = taskSnap.exists ? taskSnap.data() : {};
    const propertyName = task?.propertyName || "";
    const publicId = task?.publicId || taskId;
    const link = `https://media.ortools.co/dashboard/tasks/${publicId}`;
    // Prepare email
    const mailOptions = {
      from: `Media Tracker <${gmailEmail}>`,
      to: recipients.join(","),
      subject: "New Comment on Task (Task Lookup Page)",
      text:
        "A new comment was left on a task.\n\n" +
        `Property: ${propertyName}\n` +
        `Comment: ${comment.text || "(No comment text)"}\n` +
        `View task: ${link}`,
      html:
        "<h3>New Comment on Task (Task Lookup Page)</h3>" +
        `<p><b>Property:</b> ${propertyName}<br/>` +
        `<b>Comment:</b> ${comment.text || "(No comment text)"}<br/>` +
        `<b>Task Link:</b> <a href='${link}'>View Task</a></p>`,
    };
    console.log("notifyOnTaskLookupComment: mailOptions:", mailOptions);
    try {
      const info = await transporter.sendMail(mailOptions);
      console.log("notifyOnTaskLookupComment: Email sent. Info:", info);
    } catch (err) {
      console.error("notifyOnTaskLookupComment: Failed to send email:", err);
    }
  });

// Notify on new issue creation
export const notifyOnIssueCreate = functions.firestore
  .document("tasks/{taskId}/issues/{issueId}")
  .onCreate(async (snap, context) => {
    const issue = snap.data();
    const {taskId} = context.params;
    if (!issue) return;
    // Fetch notification email for issue creation
    const notifDoc = await db.doc("notifications/settings").get();
    const recipientsRaw = resolveRecipients(notifDoc.get("issueCreation"));
    const debugEmail = await getAdminDebugNotificationOverrideEmail();
    const hadMatches = recipientsRaw.length > 0;
    const recipients =
    (debugEmail && hadMatches) ?
      [debugEmail] : recipientsRaw;
    console.log("notifyOnIssueCreate: recipients:", recipients);
    if (!hadMatches) {
      console.log("No notification email set for issue reports.");
      return;
    }
    // Fetch parent task for property name and publicId
    const taskSnap = await db.collection("tasks").doc(taskId).get();
    const task = taskSnap.exists ? taskSnap.data() : {};
    const propertyName = task?.propertyName || "";
    const publicId = task?.publicId || taskId;
    const link = `https://media.ortools.co/dashboard/tasks/${publicId}`;
    // Prepare email
    const mailOptions = {
      from: `Media Tracker <${gmailEmail}>`,
      to: recipients.join(","),
      subject: "New Issue Reported",
      text:
        "A new issue has been reported.\n\n" +
        `Property: ${propertyName}\n` +
        `Message: ${issue.message || issue.text || "(No message)"}\n` +
        `View task: ${link}`,
      html:
        "<h3>New Issue Reported</h3>" +
        `<p><b>Property:</b> ${propertyName}<br/>` +
        `<b>Message:</b> ${issue.message ||
          issue.text ||
          "(No message)"}<br/>` +
        `<b>Task Link:</b> <a href='${link}'>View Task</a></p>`,
    };
    console.log("notifyOnIssueCreate: mailOptions:", mailOptions);
    try {
      const info = await transporter.sendMail(mailOptions);
      console.log("notifyOnIssueCreate: Email sent. Info:", info);
    } catch (err) {
      console.error("notifyOnIssueCreate: Failed to send email:", err);
    }
  });

export const notifyOnPriorityRequest = functions.firestore
  .document("tasks/{taskId}")
  .onUpdate(
    async (
      change: functions.Change<FirebaseFirestore.DocumentSnapshot>,
      context: functions.EventContext
    ) => {
      const before = change.before.data();
      const after = change.after.data();
      console.log("[notifyOnPriorityRequest] Triggered", {before, after});
      if (!before || !after) return;

      // Only trigger if priorityRequest changed from not true to true
      const wasPriority = before.priorityRequest === true;
      const isPriority = after.priorityRequest === true;
      console.log(
        "[notifyOnPriorityRequest] wasPriorityRequest:",
        wasPriority, "isPriorityRequest:", isPriority);
      if (isPriority && !wasPriority) {
        // Fetch recipients from config/notifications
        let recipientEmails: string[] = [];
        try {
          const notifDoc = await admin
            .firestore()
            .collection("config")
            .doc("notifications")
            .get();
          const raw = notifDoc.get("priorityRequestRecipients");
          const key = ((after.mediaType || "") + "").toLowerCase();
          recipientEmails = resolveRecipients(raw, {mediaTypeKey: key});
          // Admin Debug Override: only override if there are matches
          const debugEmail = await getAdminDebugNotificationOverrideEmail();
          const hadMatches = recipientEmails.length > 0;
          if (debugEmail && hadMatches) {
            recipientEmails = [debugEmail];
          }
        } catch (err) {
          console.warn(
            "Could not fetch priority request notification recipients:", err);
          return;
        }
        console.log("[notifyOnPriorityRequest] Recipients:", recipientEmails);
        if (recipientEmails.length === 0) {
          console.log("No priority request notification recipients set.");
          return;
        }
        // Prepare email content
        const propertyName = after.propertyName || "";
        const updateType = after.updateType || "";
        const publicId = after.publicId || context.params.taskId;
        const link = `https://media.ortools.co/dashboard/tasks/${publicId}`;
        // Determine who marked the task as priority
        // Prefer the newly added priority_request_change log entry user
        type TaskLogEntry = {
          type?: string;
          user?: { displayName?: string; email?: string; uid?: string };
          [key: string]: unknown;
        };
        const beforeLogs: TaskLogEntry[] = Array.isArray(before.log) ?
          (before.log as TaskLogEntry[]) :
          [];
        const afterLogs: TaskLogEntry[] = Array.isArray(after.log) ?
          (after.log as TaskLogEntry[]) :
          [];
        const newlyAddedPriorityLogs = afterLogs.filter((entry: TaskLogEntry) =>
          entry && entry.type === "priority_request_change" &&
          !beforeLogs.some((b: TaskLogEntry) => JSON.stringify(b) ===
            JSON.stringify(entry))
        );
        // Compute marker (actor) name
        let markerName = "";
        const pickName =
          (u?: { displayName?: string; email?: string; uid?: string }) =>
            (u?.displayName || u?.email || u?.uid || "Unknown User");
        if (newlyAddedPriorityLogs.length > 0) {
          const actor =
            newlyAddedPriorityLogs[newlyAddedPriorityLogs.length - 1];
          markerName = pickName(actor.user);
        } else {
          // Fallback: find most recent priority_request_change in afterLogs
          const lastPriority =
            [...afterLogs].reverse().find((e) => e && e.type ===
              "priority_request_change");
          if (lastPriority) {
            markerName = pickName(lastPriority.user);
          } else if (Array.isArray(after.log) &&
            after.log[0] && (after.log[0] as any).user) {
            // Final fallback: task creator (first log entry)
            const user =
              (after.log[0] as any).user as {
                displayName?: string;
                email?: string;
                uid?: string;
              };
            markerName = pickName(user);
          } else {
            markerName = "Unknown User";
          }
        }
        const mediaTypeSuffix =
          after.mediaType ? ` - ${formatMediaType(after.mediaType)}` : "";
        const mailOptions = {
          from: `Media Tracker <${gmailEmail}>`,
          to: recipientEmails.join(","),
          subject: `Task Marked as Priority Request${mediaTypeSuffix}`,
          text:
            "A task has been marked as a PRIORITY REQUEST.\n\n" +
            `Property: ${propertyName}\n` +
            `Update Type: ${updateType}\n` +
            `Marked By: ${markerName}\n` +
            `Task Link: ${link}`,
          html:
            `<h3>Task Marked as Priority Request${mediaTypeSuffix}</h3>` +
            `<p><b>Property:</b> ${propertyName}<br/>` +
            `<b>Update Type:</b> ${updateType}<br/>` +
            `<b>Marked By:</b> ${markerName}<br/>` +
            `<b>Task Link:</b> <a href='${link}'>View Task</a></p>`,
        };
        try {
          const info = await transporter.sendMail(mailOptions);
          console.log(
            "Priority request notification sent to",
            recipientEmails,
            info
          );
        } catch (err) {
          console.error(
            "Failed to send priority request notification:",
            err
          );
        }
      }
    }
  );

export const notifyOnTaskUpdate = functions.firestore
  .document("tasks/{taskId}")
  .onUpdate(
    async (
      change: functions.Change<FirebaseFirestore.DocumentSnapshot>,
      context: functions.EventContext
    ) => {
      const before = change.before.data();
      const after = change.after.data();
      if (!after) return;

      // Only proceed if assignedEditor or progress changed
      const assignedEditorBefore = before?.assignedEditor || null;
      const assignedEditorAfter = after?.assignedEditor || null;
      const progressBefore = before?.progress;
      const progressAfter = after?.progress;

      // CASE 1: Newly assigned editor and progress is already 4
      const editorJustAssigned =
      assignedEditorBefore !==
      assignedEditorAfter &&
      assignedEditorAfter &&
      progressAfter === 4;
      // CASE 2: Progress just updated to 4 and an editor is already assigned
      const progressJustSetTo4 =
      progressBefore !== 4 &&
      progressAfter === 4 &&
      assignedEditorAfter;

      if (editorJustAssigned || progressJustSetTo4) {
        // Fetch editor email
        let editorEmail = null;
        try {
          const userSnap = await admin.auth().getUser(assignedEditorAfter);
          editorEmail = userSnap.email;
        } catch (err) {
          console.error("Could not fetch editor email for notification:", err);
          return;
        }

        // Prepare email content
        const propertyName = after.propertyName || "";
        const updateType = after.updateType || "";
        const isPriority = after.priority === true ? "Yes" : "No";
        const expectedCompletion = after.expectedCompletion || "";
        const publicId = after.publicId || context.params.taskId;
        const link = `https://media.ortools.co/dashboard/tasks/${publicId}`;

        const mailOptions = {
          from: `Media Tracker <${gmailEmail}>`,
          to: editorEmail,
          subject: "You've been assigned a new edit",
          text:
            "You've been assigned a new edit.\n\n" +
            `Property: ${propertyName}\n` +
            `Update Type: ${updateType}\n` +
            `Priority: ${isPriority}\n` +
            `Expected Completion: ${expectedCompletion}\n` +
            `Task Link: ${link}`,
          html:
            "<h3>You've been assigned a new edit</h3>" +
            `<p><b>Property:</b> ${propertyName}<br/>` +
            `<b>Update Type:</b> ${updateType}<br/>` +
            `<b>Priority:</b> ${isPriority}<br/>` +
            `<b>Expected Completion:</b> ${expectedCompletion}<br/>` +
            `<b>Task Link:</b> <a href='${link}'>View Task</a></p>`,
        };

        try {
          await transporter.sendMail(mailOptions);
          console.log("Editor assignment notification sent to", editorEmail);
        } catch (err) {
          console.error("Failed to send editor assignment notification:", err);
        }
      }
    }
  );
