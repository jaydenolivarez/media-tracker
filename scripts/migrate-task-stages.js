// migrate-task-stages.js
// Node.js script to migrate Firestore tasks from numeric progressState to string-based stage
// Usage: node migrate-task-stages.js

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json'); // <-- Place your Firebase service account key here

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Mapping of old numeric progressState to new string stage
const STAGE_MAP = {
  0: 'Created',
  1: 'Scheduling',
  2: 'Shooting',
  3: 'Editing',      // 'Sent to 1st Editor' → 'Editing'
  4: 'Editing',      // 'In-House Editing' → 'Editing'
  5: 'Ready to Publish',
  6: 'Completed'
};

async function migrateTasks() {
  const tasksRef = db.collection('tasks');
  const snapshot = await tasksRef.get();
  let updated = 0, skipped = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    let newStage = null;
    let needsUpdate = false;

    // Migrate numeric progressState
    if (typeof data.progressState === 'number' && STAGE_MAP.hasOwnProperty(data.progressState)) {
      newStage = STAGE_MAP[data.progressState];
      needsUpdate = true;
    }
    // Migrate legacy string stages
    else if (data.stage === 'Sent to 1st Editor' || data.stage === 'In-House Editing') {
      newStage = 'Editing';
      needsUpdate = true;
    }

    if (needsUpdate) {
      await doc.ref.update({
        stage: newStage,
        progressState: admin.firestore.FieldValue.delete()
      });
      console.log(`[UPDATED] ${doc.id}: stage → ${newStage}`);
      updated++;
    } else {
      skipped++;
    }
  }
  console.log(`\nMigration complete. Updated: ${updated}, Skipped: ${skipped}`);
}

migrateTasks().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
