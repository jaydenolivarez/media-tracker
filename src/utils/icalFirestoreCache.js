// Firestore-based iCal cache utility
// Each iCal URL is mapped to a doc in /icalCache/{hash}
// Used to globally limit iCal fetches to once per 30 minutes across all users

import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { sha256 } from "js-sha256"; // Add this to your dependencies if not present

const CACHE_COLLECTION = "icalCache";
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

// Hash iCal URL for use as Firestore doc ID
export function icalCacheDocId(icalUrl) {
  return sha256(icalUrl);
}

// Get cached availability from Firestore
export async function getCachedICalAvailability(icalUrl) {
  const db = getFirestore();
  const docId = icalCacheDocId(icalUrl);
  const cacheRef = doc(db, CACHE_COLLECTION, docId);
  const snap = await getDoc(cacheRef);
  if (!snap.exists()) return null;
  const data = snap.data();
  if (!data.expires || data.expires < Date.now()) return null;
  return data;
}

// Set cache in Firestore
export async function setCachedICalAvailability(icalUrl, weeklyAvailability, rawIcalText = null) {
  const db = getFirestore();
  const docId = icalCacheDocId(icalUrl);
  const cacheRef = doc(db, CACHE_COLLECTION, docId);
  const expires = Date.now() + CACHE_DURATION_MS;
  await setDoc(cacheRef, {
    icalUrl,
    weeklyAvailability, // Array of 7 days, each with date, label, available, isTurn, etc.
    expires,
    lastFetched: serverTimestamp(),
    ...(rawIcalText ? { rawIcalText } : {})
  });
}
