import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import crypto from "crypto";

// Ensure app is initialized (index.ts also initializes)
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Config
const gmailEmail = functions.config().gmail?.email;
const gmailPass = functions.config().gmail?.password;
const unsubscribeSecret: string |undefined =
functions.config().reservations?.secret;

// Use nodemailer from existing notify file pattern to keep consistency
import nodemailer from "nodemailer";
import {getAdminDebugNotificationOverrideEmail}
  from "./adminDebugNotificationOverride";
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {user: gmailEmail, pass: gmailPass},
});

// Helpers
/**
 * Parse VEVENT blocks from iCal text to start/end Date pairs.
 *
 * @param {*} icalText Raw iCal content as text
 * @return {*} Array of busy intervals
 */
function parseICalEvents(icalText: string): { start: Date; end: Date }[] {
  const events: { start: Date; end: Date }[] = [];
  const veventRegex = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/g;
  let match: RegExpExecArray | null;
  while ((match = veventRegex.exec(icalText)) !== null) {
    const block = match[1];
    const dtstartMatch = /DTSTART(?:;[^:\n]*)?:(\d{8})(T\d{6}Z)?/.exec(block);
    const dtendMatch = /DTEND(?:;[^:\n]*)?:(\d{8})(T\d{6}Z)?/.exec(block);
    if (dtstartMatch && dtendMatch) {
      if (!dtstartMatch[2] && !dtendMatch[2]) {
        const startDate = new Date(
          `${dtstartMatch[1].slice(0, 4)}-${dtstartMatch[1].slice(4, 6)}-
          ${dtstartMatch[1].slice(6, 8)}T00:00:00`
        );
        const endDate = new Date(
          `${dtendMatch[1].slice(0, 4)}-${dtendMatch[1].slice(4, 6)}-
          ${dtendMatch[1].slice(6, 8)}T00:00:00`
        );
        events.push({start: startDate, end: endDate});
      } else {
        const startDate = new Date(
          `${dtstartMatch[1].slice(0, 4)}-${dtstartMatch[1].slice(4, 6)}-
          ${dtstartMatch[1].slice(6, 8)}T${dtstartMatch[2] ?
  dtstartMatch[2].slice(1, 7) : "00:00:00"}`
        );
        const endDate = new Date(
          `${dtendMatch[1].slice(0, 4)}-${dtendMatch[1].slice(4, 6)}-
          ${dtendMatch[1].slice(6, 8)}T${dtendMatch[2] ?
  dtendMatch[2].slice(1, 7) : "00:00:00"}`
        );
        events.push({start: startDate, end: endDate});
      }
    }
  }
  return events;
}

/**
 * Determine if two [start, end) intervals overlap.
 *
 * @param {*} aStart First interval start
 * @param {*} aEnd First interval end (exclusive)
 * @param {*} bStart Second interval start
 * @param {*} bEnd Second interval end (exclusive)
 * @return {boolean} True if the intervals overlap
 */
function intervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date): boolean {
  // end-exclusive semantics
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Build a deterministic key representing overlaps for a given task + schedule.
 *
 * @param {*} taskId Task document ID
 * @param {*} schedStart Scheduled shooting start
 * @param {*} schedEnd Scheduled shooting end
 * @param {*} overlaps Overlapping busy windows
 * @return {string} A stable hash key for deduplication
 */
function buildOverlapKey(
  taskId: string,
  schedStart: Date,
  schedEnd: Date,
  overlaps: { start: Date; end: Date }[]): string {
  const base = [
    taskId,
    schedStart.toISOString().slice(0, 10),
    schedEnd.toISOString().slice(0, 10),
    ...overlaps
      .map((o) => `${o.start.toISOString().slice(0, 10)}_
      ${o.end.toISOString().slice(0, 10)}`)
      .sort(),
  ].join("|");
  return crypto.createHash("sha256").update(base).digest("hex");
}

/**
 * Lookup a user's email by UID.
 *
 * @param {*} uid Firebase Auth UID
 * @return {*} Email or null if unavailable
 */
async function getUserEmail(uid?: string | null): Promise<string | null> {
  if (!uid) return null;
  try {
    const user = await admin.auth().getUser(uid);
    return user.email || null;
  } catch {
    return null;
  }
}

/**
 * Format a value as YYYY-MM-DD.
 *
 * @param {*} dateish Date|number|string compatible value
 * @return {string} A YYYY-MM-DD string or '-' if invalid
 */
function fmtYmd(dateish: unknown): string {
  const src = dateish as string | number | Date | undefined;
  const d = new Date(src as string | number | Date);
  if (isNaN(d.getTime())) return "-";
  return `${d.getFullYear()}-
  ${String(d.getMonth() + 1).padStart(2, "0")}-
  ${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Build a short-lived signed unsubscribe token.
 *
 * @param {*} taskId Task document ID
 * @param {*} expiresAtMs Epoch millis when token should expire
 * @return {*} Base64url token or null if secret unavailable
 */
function buildUnsubToken(taskId: string, expiresAtMs: number): string | null {
  if (!unsubscribeSecret) return null;
  const payload = `${taskId}:${expiresAtMs}`;
  const sig = crypto.createHmac("sha256", unsubscribeSecret)
    .update(payload)
    .digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

/**
 * Verify unsubscribe token integrity and expiry.
 *
 * @param {*} token Base64url token from email link
 * @return {*} Validation result
 */
function verifyUnsubToken(token: string): { ok: boolean; taskId?: string } {
  try {
    if (!unsubscribeSecret) return {ok: false};
    const raw = Buffer.from(token, "base64url").toString("utf8");
    const [taskId, expStr, sig] = raw.split(":");
    const expected = crypto.createHmac("sha256", unsubscribeSecret)
      .update(`${taskId}:${expStr}`)
      .digest("hex");
    if (expected !== sig) return {ok: false};
    const exp = Number(expStr);
    if (!exp || Date.now() > exp) return {ok: false};
    return {ok: true, taskId};
  } catch {
    return {ok: false};
  }
}

/**
 * HTTPS endpoint to unsubscribe a single task from reservation conflict emails.
 */
export const unsubscribeReservationConflict =
functions.https.onRequest(async (req, res) => {
  /* eslint-disable max-len */
  try {
    const token = (req.query.token as string) || "";
    const {ok, taskId} = verifyUnsubToken(token);
    if (!ok || !taskId) {
      // eslint-disable-next-line max-len
      res.status(400).set("Content-Type", "text/html; charset=utf-8").send(`<!doctype html>
<html><head><meta charset="utf-8"><title>Unsubscribe</title>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Helvetica,Arial,sans-serif;padding:40px;background:#f8fafc;color:#0f172a} .card{max-width:560px;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.08);padding:28px} h1{font-size:20px;margin:0 0 8px} p{margin:0 0 12px;color:#334155}</style>
</head><body><div class="card"><h1>Link expired or invalid</h1><p>Please request a new unsubscribe link from the latest email.</p></div></body></html>`);
      return;
    }
    await db.collection("tasks").doc(taskId).update({blockAlertOptOut: true});
    // eslint-disable-next-line max-len
    res.status(200).set("Content-Type", "text/html; charset=utf-8").send(`<!doctype html>
<html><head><meta charset="utf-8"><title>Unsubscribed</title>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Helvetica,Arial,sans-serif;padding:40px;background:#f8fafc;color:#0f172a} .card{max-width:560px;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.08);padding:28px} h1{font-size:20px;margin:0 0 8px} p{margin:0 0 12px;color:#334155}</style>
</head><body><div class="card"><h1>Unsubscribed</h1><p>Reservation conflict notifications have been turned off for this task.</p></div></body></html>`);
  } catch (e) {
    console.error("unsubscribeReservationConflict error:", e);
    // eslint-disable-next-line max-len
    res.status(500).set("Content-Type", "text/html; charset=utf-8").send(`<!doctype html>
<html><head><meta charset="utf-8"><title>Error</title>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Helvetica,Arial,sans-serif;padding:40px;background:#f8fafc;color:#0f172a} .card{max-width:560px;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.08);padding:28px} h1{font-size:20px;margin:0 0 8px} p{margin:0 0 12px;color:#334155}</style>
</head><body><div class="card"><h1>Something went wrong</h1><p>Please try again later.</p></div></body></html>`);
  }
  /* eslint-enable max-len */
});

/**
 * Fetch raw iCal text from URL.
 *
 * @param {*} icalUrl iCal feed URL
 * @return {*} Raw iCal string
 */
async function fetchICal(icalUrl: string): Promise<string> {
  const resp = await fetch(icalUrl);
  if (!resp.ok) throw new Error(`iCal fetch failed: ${resp.status}`);
  return await resp.text();
}

/**
 * For a given task, identify overlapping iCal events with its scheduled range.
 *
 * @param {*} task Task data
 * @return {*} Overlap info and normalized schedule window
 */
async function findOverlapsForTask(
  task: FirebaseFirestore.DocumentData):
  Promise<{
  hasOverlap: boolean;
  overlaps: {start: Date; end: Date}[];
  schedStart: Date | null;
  schedEnd: Date | null;
}> {
  const sched = task?.scheduledShootDate;
  const ical = task?.ical;
  if (!sched || !ical) {
    return {
      hasOverlap: false,
      overlaps: [],
      schedStart: null,
      schedEnd: null,
    };
  }
  const start = new Date(sched.start || sched.end);
  const end = new Date(sched.end || sched.start);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return {
      hasOverlap: false,
      overlaps: [],
      schedStart: null,
      schedEnd: null,
    };
  }

  // Only consider windows that include today or are in the future
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (end < today) {
    return {
      hasOverlap: false,
      overlaps: [],
      schedStart: start,
      schedEnd: end,
    };
  }

  const icalRaw = await fetchICal(ical);
  const busy = parseICalEvents(icalRaw);
  const overlaps: { start: Date; end: Date }[] = [];
  for (const ev of busy) {
    if (intervalsOverlap(start, end, ev.start, ev.end)) {
      overlaps.push({start: ev.start, end: ev.end});
    }
  }
  return {
    hasOverlap: overlaps.length > 0,
    overlaps,
    schedStart: start,
    schedEnd: end,
  };
}

/**
 * Send reservation conflict email to recipients with an unsubscribe link.
 *
 * @param {*} taskId Task ID
 * @param {*} task Task data
 * @param {*} recipients Recipient email addresses
 * @param {*} unsubUrl Unsubscribe URL
 */
async function sendReservationEmail(
  taskId: string,
  task: FirebaseFirestore.DocumentData,
  recipients: string[],
  unsubUrl: string,
) {
  if (!recipients.length) return;
  const propertyName = task.propertyName || "";
  const updateType = task.updateType || "";
  const publicId = task.publicId || taskId;
  const link = `https://media.ortools.co/dashboard/tasks/${publicId}`;
  const sched = task.scheduledShootDate;
  const shootingDateRange =
    sched ? `${fmtYmd(sched.start || sched.end)}
    to ${fmtYmd(sched.end || sched.start)}` : "-";
  const mailOptions = {
    from: `Media Tracker <${gmailEmail}>`,
    to: recipients.join(","),
    subject: "Reservation conflict during assigned shooting date",
    text:
      "A reservation has been made during an assigned shooting date\n\n" +
      ` Property: ${propertyName}\n` +
      `Update Type: ${updateType}\n` +
      `Shooting Date: ${shootingDateRange}\n` +
      `Task Link: ${link}\n\n` +
      `Want to turn off this notification for this task? ${unsubUrl}`,
  };
  await transporter.sendMail(mailOptions);
}

/**
 * Process tasks in Shooting stage and send notifications for new overlaps.
 */
async function processOnce(): Promise<void> {
  // Fetch candidate tasks: ONLY stage === 'Shooting';
  // must have scheduledShootDate and ical
  const snap =
  await db.collection("tasks").where("stage", "==", "Shooting").get();
  const candidates: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  snap.forEach((docSnap) => {
    const t = docSnap.data();
    if (t.archived) return;
    if (!t.scheduledShootDate || !t.ical) return;
    candidates.push(docSnap);
  });

  for (const docSnap of candidates) {
    try {
      const task = docSnap.data();
      if (task.blockAlertOptOut === true) {
        continue;
      }
      const {hasOverlap, overlaps, schedStart, schedEnd} =
      await findOverlapsForTask(task);
      if (!schedStart || !schedEnd) {
        continue;
      }
      if (!hasOverlap) {
        continue;
      }

      const key = buildOverlapKey(docSnap.id, schedStart, schedEnd, overlaps);
      const lastKey = task.lastBlockAlertKey || null;
      const initialKey = task.initialBlockKey || null;
      const scheduledOverBlocked = task.scheduledOverBlockedAtCreate === true;

      const isNewSinceInitial = !initialKey || key !== initialKey;
      const isNewSinceLast = !lastKey || key !== lastKey;

      if (isNewSinceLast && (!scheduledOverBlocked || isNewSinceInitial)) {
        // Resolve recipients: assignedPhotographer + scheduledByUid
        const emails: string[] = [];
        const photogEmail = await getUserEmail(task.assignedPhotographer);
        const schedByEmail = await getUserEmail(task.scheduledByUid);
        if (photogEmail) {
          emails.push(photogEmail);
        }
        if (schedByEmail && !emails.includes(schedByEmail)) {
          emails.push(schedByEmail);
        }
        // Admin Debug Override: redirect all notifications to admin email
        const debugEmail = await getAdminDebugNotificationOverrideEmail();
        if (debugEmail) {
          // replace recipients with the single admin debug email
          emails.splice(0, emails.length, debugEmail);
        }

        // Build unsubscribe URL
        let unsubUrl = "";
        const expires = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
        const token = buildUnsubToken(docSnap.id, expires);
        if (token) {
          // eslint-disable-next-line max-len
          unsubUrl = `https://us-central1-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/unsubscribeReservationConflict?token=${encodeURIComponent(token)}`;
        } else {
          unsubUrl = "(unsub link unavailable)";
        }

        await sendReservationEmail(docSnap.id, task, emails, unsubUrl);
        await docSnap.ref.update({
          lastBlockAlertKey: key,
          lastBlockAlertAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    } catch (e) {
      console.warn(
        "notifyOnReservationConflict: error per task", docSnap.id, e);
    }
  }
}

/**
 * Scheduled Pub/Sub runner for reservation conflict notifications.
 */
export const notifyOnReservationConflict = functions.pubsub
  .schedule("0 7,10,13,15,17 * * *")
  .timeZone("America/Chicago")
  .onRun(async () => {
    await processOnce();
    return null;
  });

/**
 * HTTPS manual trigger for reservation conflict processing.
 */
export const triggerReservationConflictManually =
functions.https.onRequest(async (_req, res) => {
  try {
    await processOnce();
    res.status(200).send("Reservation conflict notifier ran successfully.");
  } catch (e) {
    console.error(e);
    res.status(500).send("Error running reservation conflict notifier.");
  }
});

