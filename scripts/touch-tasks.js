// Save this as touch-tasks.js and run with: node touch-tasks.js
const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function touchAllTasks() {
  const snap = await db.collection('tasks').get();
  for (const doc of snap.docs) {
    // Update a dummy field to trigger Algolia sync
    await doc.ref.update({ _reindex: Date.now() });
  }
  console.log('All tasks touched for reindexing.');
}

touchAllTasks().then(() => process.exit());