import { getFirestore, collection, addDoc, serverTimestamp } from "firebase/firestore";

/**
 * Lightweight client-side logger for admin-only action tracking.
 * Use for low-volume operational audit notes.
 *
 * Security expectations:
 * - Firestore rules should restrict reads to users with permissions.adminTrackingLog == true.
 * - For MVP, allow authenticated creates with field validation.
 * - Prefer moving writes to a Cloud Function if spoofing becomes a concern.
 */
export async function logAction({
  action,
  userId,
  userEmail,
  actingRoles = [],
  permissionsSnapshot = {},
  targetType,
  targetId,
  context,
  severity = "info",
  message = "",
  metadata = {},
  ttlDays = 180,
}) {
  try {
    const db = getFirestore();

    // Basic validation/normalization to keep documents small and consistent
    const safeString = (v, max = 500) =>
      typeof v === "string" ? v.slice(0, max) : "";

    const safeEnum = (v, allowed) =>
      allowed.includes(v) ? v : allowed[0];

    const now = new Date();
    const ttlDeleteAt = new Date(now.getTime() + Math.max(1, ttlDays) * 24 * 60 * 60 * 1000);

    const docData = {
      ts: serverTimestamp(),
      action: safeString(action, 64),
      userId: safeString(userId, 128),
      userEmail: safeString(userEmail, 256),
      actingRoles: Array.isArray(actingRoles) ? actingRoles.slice(0, 10).map(r => safeString(r, 64)) : [],
      permissionsSnapshot: typeof permissionsSnapshot === "object" && permissionsSnapshot ? permissionsSnapshot : {},
      targetType: safeString(targetType, 64),
      targetId: safeString(targetId, 256),
      context: safeString(context, 64),
      severity: safeEnum(severity, ["info", "warning", "critical"]),
      message: safeString(message, 500),
      metadata: typeof metadata === "object" && metadata ? metadata : {},
      ttlDeleteAt,
    };

    // Remove empty keys to reduce index/storage use
    Object.keys(docData).forEach((k) => {
      const v = docData[k];
      if (
        v === "" ||
        v === null ||
        (Array.isArray(v) && v.length === 0) ||
        (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0)
      ) {
        delete docData[k];
      }
    });

    const ref = await addDoc(collection(db, "actionLogs"), docData);
    return ref.id;
  } catch (e) {
    // Fail silently to avoid disrupting user flows; optionally console.warn in dev
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn("logAction failed", e);
    }
    return null;
  }
}
