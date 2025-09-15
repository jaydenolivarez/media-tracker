import * as admin from "firebase-admin";

/**
 * Checks if admin debug notification
 * override is enabled and returns the override email if so.
 * @return {Promise<string|null>}
 * The override email if enabled, otherwise null.
 */
export async function getAdminDebugNotificationOverrideEmail():
  Promise<string|null> {
  try {
    const overrideDoc =
    await admin.firestore().doc("notifications/debugOverride").get();
    if (overrideDoc.exists && overrideDoc.get("enabled")) {
      // Get admin debug email from settings
      const settingsDoc =
      await admin.firestore().doc("notifications/settings").get();
      const adminEmail = settingsDoc.get("adminDebugEmail");
      if (typeof adminEmail === "string" && adminEmail.trim()) {
        return adminEmail.trim();
      }
    }
    return null;
  } catch (err) {
    console.error("Error checking admin debug notification override:", err);
    return null;
  }
}
