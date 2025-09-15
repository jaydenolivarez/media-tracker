// Utility for adminTesting debug notification override
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";

const ADMIN_OVERRIDE_DOC = "notifications/debugOverride";
const NOTIF_SETTINGS_DOC = "notifications/settings";
const NOTIF_CONFIG_DOC = "config/notifications";

// Returns { enabled: boolean, backup: { ...original lists... } }
export async function getAdminDebugState() {
  const db = getFirestore();
  const snap = await getDoc(doc(db, ADMIN_OVERRIDE_DOC));
  if (!snap.exists()) return { enabled: false, backup: null };
  return snap.data();
}

// Enable override: backup current, set all to {email: adminEmail}
export async function enableAdminDebug(adminEmail) {
  const db = getFirestore();
  // Backup current
  const notifSnap = await getDoc(doc(db, NOTIF_SETTINGS_DOC));
  const configSnap = await getDoc(doc(db, NOTIF_CONFIG_DOC));
  const backup = {
    mediaRequestCreation: notifSnap.data()?.mediaRequestCreation || [],
    taskCompletion: notifSnap.data()?.taskCompletion || [],
    shootingCompletion: notifSnap.data()?.shootingCompletion || [],
    editingCompletion: notifSnap.data()?.editingCompletion || [],
    issueCreation: notifSnap.data()?.issueCreation || [],
    taskComment: notifSnap.data()?.taskComment || [],
    stagnantTaskRecipients: configSnap.data()?.stagnantTaskRecipients || [],
    priorityRequestRecipients: configSnap.data()?.priorityRequestRecipients || [],
    stagnantTaskThresholdDays: configSnap.data()?.stagnantTaskThresholdDays || 14,
  };
  // Overwrite all lists
  const one = [{ email: adminEmail }];
  await setDoc(doc(db, NOTIF_SETTINGS_DOC), {
    mediaRequestCreation: one,
    taskCompletion: one,
    shootingCompletion: one,
    editingCompletion: one,
    issueCreation: one,
    taskComment: one,
  }, { merge: true });
  await setDoc(doc(db, NOTIF_CONFIG_DOC), {
    stagnantTaskRecipients: one,
    priorityRequestRecipients: one,
    // Do not overwrite threshold days
  }, { merge: true });
  // Save debug state
  await setDoc(doc(db, ADMIN_OVERRIDE_DOC), { enabled: true, backup, adminEmail });
}

// Disable override: restore backup
export async function disableAdminDebug() {
  const db = getFirestore();
  const snap = await getDoc(doc(db, ADMIN_OVERRIDE_DOC));
  if (!snap.exists() || !snap.data().backup) return;
  const { backup } = snap.data();
  await setDoc(doc(db, NOTIF_SETTINGS_DOC), {
    mediaRequestCreation: backup.mediaRequestCreation,
    taskCompletion: backup.taskCompletion,
    shootingCompletion: backup.shootingCompletion,
    editingCompletion: backup.editingCompletion,
    issueCreation: backup.issueCreation,
    taskComment: backup.taskComment,
  }, { merge: true });
  await setDoc(doc(db, NOTIF_CONFIG_DOC), {
    stagnantTaskRecipients: backup.stagnantTaskRecipients,
    priorityRequestRecipients: backup.priorityRequestRecipients,
    stagnantTaskThresholdDays: backup.stagnantTaskThresholdDays,
  }, { merge: true });
  await setDoc(doc(db, ADMIN_OVERRIDE_DOC), { enabled: false, backup: null });
}
