// clear-ical-without-unitcode.js
// One-off cleanup: clear task.ical for tasks that do not have a unit code field.
// Usage:
//   node clear-ical-without-unitcode.js [--dry-run]
//
// Notes:
// - Scans all documents in the `tasks` collection.
// - If a task has no unit code (checks unitCode | unit_code | unit | unitName) and has a non-empty `ical`, it will be cleared (set to null).
// - Use --dry-run to preview actions without writing.

const admin = require('firebase-admin');
const path = require('path');

// Service account expected at scripts/serviceAccountKey.json (same as other scripts)
const serviceAccount = require(path.resolve(__dirname, './serviceAccountKey.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

function hasUnitCode(data) {
  const candidate = (data.unitCode || data.unit_code || data.unit || data.unitName || '').toString().trim();
  return candidate.length > 0;
}

function hasNonEmptyIcal(data) {
  const ical = (data.ical == null) ? '' : String(data.ical).trim();
  return ical.length > 0;
}

async function run() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  console.log(`Starting iCal cleanup (dryRun=${dryRun})...`);
  const snap = await db.collection('tasks').get();

  let considered = 0;
  let toClear = [];

  snap.forEach(docSnap => {
    const data = docSnap.data();
    if (!hasUnitCode(data) && hasNonEmptyIcal(data)) {
      toClear.push(docSnap.ref);
    }
    considered++;
  });

  console.log(`Scanned ${considered} task(s). To clear: ${toClear.length}.`);

  if (dryRun) {
    console.log('Dry run mode: no writes performed.');
    process.exit(0);
  }

  let cleared = 0;
  // Commit in batches to avoid limits
  for (let i = 0; i < toClear.length; i += 450) {
    const batch = db.batch();
    const slice = toClear.slice(i, i + 450);
    slice.forEach(ref => {
      batch.update(ref, { ical: admin.firestore.FieldValue.delete() });
      // Alternatively use null: batch.update(ref, { ical: null });
    });
    await batch.commit();
    cleared += slice.length;
    console.log(`Committed ${cleared}/${toClear.length} clears...`);
  }

  console.log(`Cleanup complete. Cleared iCal on ${cleared} task(s).`);
}

run().catch(err => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
