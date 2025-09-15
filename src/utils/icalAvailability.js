// Utility for fetching and caching iCal availability for property scheduling
// Fetches iCal, parses for today's availability, and caches results for a short period

import { getCachedICalAvailability, setCachedICalAvailability } from "./icalFirestoreCache";
import { getFirestore, doc, getDoc } from "firebase/firestore";

const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes
let adminTestingMode = false;

export function setAdminTestingMode(val) {
  adminTestingMode = val === true;
}

// Firestore-backed iCal resolution
async function loadPropertyNamesDocOnce() {
  try {
    const db = getFirestore();
    const ref = doc(db, "autocomplete", "propertyNames");
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const names = Array.isArray(snap.get("names")) ? snap.get("names") : [];
      return names;
    }
  } catch (e) {
    // ignore; fallback empty
  }
  return [];
}

function normalizeStr(v) {
  return (v || "").toString().trim().toLowerCase();
}

function resolveIcalFromNames(namesList, task) {
  if (!Array.isArray(namesList) || !task) return null;
  const unitCode = normalizeStr(task.unitCode || task.propertyName);
  const propName = normalizeStr(task.propertyName);
  if (!unitCode && !propName) return null;
  for (const itemRaw of namesList) {
    const item = itemRaw || {};
    const uc = normalizeStr(item.unitCode);
    const nm = normalizeStr(item.name);
    if ((uc && (uc === unitCode || uc === propName)) || (nm && (nm === unitCode || nm === propName))) {
      if (item.ical) return item.ical;
    }
  }
  return null;
}

export async function getIcalForTask(task, namesListOpt) {
  if (!task) return null;
  if (task.ical) return task.ical;
  const names = Array.isArray(namesListOpt) ? namesListOpt : await loadPropertyNamesDocOnce();
  return resolveIcalFromNames(names, task);
}

// Helper: Parse iCal text for busy events covering today
function isAvailableToday(icalText, now = new Date()) {
  // Basic iCal parsing for VEVENTs with DTSTART/DTEND covering today
  // Only looks for busy blocks (not freebusy format)
  try {
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const busyRegex = /BEGIN:VEVENT[\s\S]*?DTSTART(?:;[^\n]*)?:(\d{8})T\d{6}Z[\s\S]*?DTEND(?:;[^\n]*)?:(\d{8})T\d{6}Z[\s\S]*?END:VEVENT/g;
    let match;
    while ((match = busyRegex.exec(icalText)) !== null) {
      const start = new Date(match[1].slice(0,4)+'-'+match[1].slice(4,6)+'-'+match[1].slice(6,8)+'T00:00:00Z');
      const end = new Date(match[2].slice(0,4)+'-'+match[2].slice(4,6)+'-'+match[2].slice(6,8)+'T00:00:00Z');
      if (start < tomorrow && end > today) {
        return false; // Busy at some point today
      }
    }
    return true;
  } catch (e) {
    return false;
  }
}

export async function fetchPropertyAvailability(icalUrl, now = new Date()) {
  if (!icalUrl) return null;
  // Always use Firestore cache as source of truth
  const cache = await getCachedICalAvailability(icalUrl);
  if (adminTestingMode) {
    // In admin testing, never fetch live
    return cache ? cache.weeklyAvailability : null;
  }
  if (cache) {
    return cache.weeklyAvailability;
  }
  // No valid cache, fetch live and parse for next 7 days
  try {
    const resp = await fetch(icalUrl);
    const text = await resp.text();
    // Parse events from iCal
    const events = parseICalEvents(text);
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const weeklyAvailability = [];
    // --- Revised logic: mark DTEND (checkout) day as available unless immediately rebooked ---
    // Collect all busy intervals
    const busy = events.map(ev => ({ start: new Date(ev.start), end: new Date(ev.end) }));
    // Collect all DTENDs and DTSTARTs for quick lookup
    const dtendMap = new Map();
    const dtstartMap = new Map();
    for (const ev of busy) {
      const dtendStr = ev.end.toISOString().slice(0, 10);
      const dtstartStr = ev.start.toISOString().slice(0, 10);
      dtendMap.set(dtendStr, true);
      dtstartMap.set(dtstartStr, true);
    }
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      const dateStr = date.toISOString().slice(0,10);
      const label = date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
      let isTurn = false;
      let covered = false;
      for (const ev of busy) {
        // Normalize event start to midnight for comparison (YYYY-MM-DD)
        const evStartStr = ev.start.toISOString().slice(0,10);
        if (evStartStr === dateStr) {
          isTurn = true;
        }
        if (ev.start <= date && ev.end > date) {
          covered = true;
        }
      }
      let available = !covered;
      // Only if a day is both a DTEND and a DTSTART (back-to-back), override both to false
      if (dtendMap.has(dateStr) && dtstartMap.has(dateStr)) {
        available = false;
        isTurn = true;
      }
      weeklyAvailability.push({ date: dateStr, label, available, isTurn });
    }

    await setCachedICalAvailability(icalUrl, weeklyAvailability, text);
    return weeklyAvailability;
  } catch (e) {
    await setCachedICalAvailability(icalUrl, [], null);
    return [];
  }
}

export async function fetchManyAvailabilities(icalList, now = new Date(), concurrency = 10) {
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < icalList.length) {
      const myIdx = idx++;
      const url = icalList[myIdx];
      results[myIdx] = await fetchPropertyAvailability(url, now);
    }
  }
  const workers = [];
  for (let i = 0; i < Math.min(concurrency, icalList.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

// Helper: Parse DTSTART/DTEND as local times (4pm/10am logic)
export function parseICalEvents(icalText) {
  const events = [];
  const veventRegex = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/g;
  let match;
  while ((match = veventRegex.exec(icalText)) !== null) {
    const block = match[1];
    // Match both all-day and timed events
    const dtstartMatch = /DTSTART(?:;[^:\n]*)?:(\d{8})(T\d{6}Z)?/.exec(block);
    const dtendMatch = /DTEND(?:;[^:\n]*)?:(\d{8})(T\d{6}Z)?/.exec(block);
    if (dtstartMatch && dtendMatch) {
      // All-day event: DTSTART:YYYYMMDD, DTEND:YYYYMMDD (exclusive)
      if (!dtstartMatch[2] && !dtendMatch[2]) {
        const startDate = new Date(`${dtstartMatch[1].slice(0,4)}-${dtstartMatch[1].slice(4,6)}-${dtstartMatch[1].slice(6,8)}T00:00:00`);
        const endDate = new Date(`${dtendMatch[1].slice(0,4)}-${dtendMatch[1].slice(4,6)}-${dtendMatch[1].slice(6,8)}T00:00:00`);
        events.push({ start: startDate, end: endDate });
      } else {
        // Timed event: DTSTART:YYYYMMDDTHHMMSSZ
        const startDate = new Date(`${dtstartMatch[1].slice(0,4)}-${dtstartMatch[1].slice(4,6)}-${dtstartMatch[1].slice(6,8)}T${dtstartMatch[2] ? dtstartMatch[2].slice(1,7) : '00:00:00'}`);
        const endDate = new Date(`${dtendMatch[1].slice(0,4)}-${dtendMatch[1].slice(4,6)}-${dtendMatch[1].slice(6,8)}T${dtendMatch[2] ? dtendMatch[2].slice(1,7) : '00:00:00'}`);
        events.push({ start: startDate, end: endDate });
      }
    }
  }
  return events;
}
 

// Main utility: parseWeeklyAvailability(tasks, now)
// Main utility: parseWeeklyAvailability(tasks, now)
// Refactored to ensure tasks are always included on turn days if available, and to make merging logic robust.
export async function parseWeeklyAvailability(tasks, now = new Date()) {
  // Only include tasks in 'Scheduling' stage
  const filtered = tasks.filter(t => t.stage === "Scheduling");
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  // Prepare days array for next 7 days
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    days.push({
      date: date.toISOString().slice(0,10),
      label: date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }),
      tasks: [],
      hasTurn: false // will be set true if any task isTurn that day
    });
  }
  const tasksWithoutIcal = [];
  // Load propertyNames once for this run to minimize reads
  const namesList = await loadPropertyNamesDocOnce();
  // For each task, fetch and parse ical
  for (const task of filtered) {
    const effectiveIcal = task.ical || resolveIcalFromNames(namesList, task);
    if (!effectiveIcal) {
      tasksWithoutIcal.push(task);
      continue;
    }
    let weeklyAvailability = [];
    try {
      weeklyAvailability = await fetchPropertyAvailability(effectiveIcal, now);
    } catch (e) {
      tasksWithoutIcal.push(task);
      continue;
    }
    // For each day, show the task if (available || isTurn), matching original utility
    for (let i = 0; i < days.length; i++) {
      if (
        weeklyAvailability && weeklyAvailability[i] &&
        (weeklyAvailability[i].available || weeklyAvailability[i].isTurn)
      ) {
        const isTurn = !!weeklyAvailability[i].isTurn;
        days[i].tasks.push({ task, isTurn });
        if (isTurn) {
          days[i].hasTurn = true;
        }
      }
    }
  }
  // Optionally, for debugging: ensure that if a day isTurn for any task, it is reflected in hasTurn and tasks array
  // This logic ensures no turn day is missed in the UI
  return { days, tasksWithoutIcal };
}


// Fetch raw iCal text using cache when valid, updating cache when fetching live
async function getOrFetchICalRaw(icalUrl, now = new Date()) {
  const cache = await getCachedICalAvailability(icalUrl);
  if (cache && cache.rawIcalText) {
    return cache.rawIcalText;
  }
  // Fetch live, compute a weeklyAvailability snapshot for compatibility, and store raw text
  const resp = await fetch(icalUrl);
  const text = await resp.text();
  try {
    // Build a 7-day availability snapshot starting today for weekly consumers
    const events = parseICalEvents(text);
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const weeklyAvailability = [];
    const busy = events.map(ev => ({ start: new Date(ev.start), end: new Date(ev.end) }));
    const dtendMap = new Map();
    const dtstartMap = new Map();
    for (const ev of busy) {
      dtendMap.set(ev.end.toISOString().slice(0,10), true);
      dtstartMap.set(ev.start.toISOString().slice(0,10), true);
    }
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      const dateStr = date.toISOString().slice(0,10);
      const label = date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
      let isTurn = false;
      let covered = false;
      for (const ev of busy) {
        const evStartStr = ev.start.toISOString().slice(0,10);
        if (evStartStr === dateStr) isTurn = true;
        if (ev.start <= date && ev.end > date) covered = true;
      }
      let available = !covered;
      if (dtendMap.has(dateStr) && dtstartMap.has(dateStr)) {
        available = false;
        isTurn = true;
      }
      weeklyAvailability.push({ date: dateStr, label, available, isTurn });
    }
    await setCachedICalAvailability(icalUrl, weeklyAvailability, text);
  } catch (e) {
    // Even if parsing fails, cache the raw text for later attempts
    await setCachedICalAvailability(icalUrl, [], text);
  }
  return text;
}

// Parse availability for an arbitrary date range, excluding days before today
export async function parseRangeAvailability(tasks, rangeStart, rangeEnd, now = new Date()) {
  const filtered = tasks.filter(t => t.stage === "Scheduling");
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const start = new Date(Math.max(new Date(rangeStart).setHours(0,0,0,0), today.getTime()));
  const end = new Date(new Date(rangeEnd).setHours(0,0,0,0));
  if (end < start) return { days: [], tasksWithoutIcal: filtered.filter(t => !t.ical) };

  // Build days array inclusive
  const days = [];
  for (let d = new Date(start); d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    days.push({
      date: d.toISOString().slice(0,10),
      label: d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }),
      tasks: [],
      hasTurn: false
    });
  }

  const tasksWithoutIcal = [];
  const namesList = await loadPropertyNamesDocOnce();
  for (const task of filtered) {
    const effectiveIcal = task.ical || resolveIcalFromNames(namesList, task);
    if (!effectiveIcal) {
      tasksWithoutIcal.push(task);
      continue;
    }
    let raw;
    try {
      raw = await getOrFetchICalRaw(effectiveIcal, now);
    } catch (e) {
      tasksWithoutIcal.push(task);
      continue;
    }
    const events = parseICalEvents(raw);
    const busy = events.map(ev => ({ start: new Date(ev.start), end: new Date(ev.end) }));
    const dtendMap = new Map();
    const dtstartMap = new Map();
    for (const ev of busy) {
      dtendMap.set(ev.end.toISOString().slice(0,10), true);
      dtstartMap.set(ev.start.toISOString().slice(0,10), true);
    }
    for (let i = 0; i < days.length; i++) {
      const day = new Date(days[i].date + 'T00:00:00');
      const dateStr = days[i].date;
      let isTurn = false;
      let covered = false;
      for (const ev of busy) {
        const evStartStr = ev.start.toISOString().slice(0,10);
        if (evStartStr === dateStr) isTurn = true;
        if (ev.start <= day && ev.end > day) covered = true;
      }
      let available = !covered;
      if (dtendMap.has(dateStr) && dtstartMap.has(dateStr)) {
        available = false;
        isTurn = true;
      }
      if (available || isTurn) {
        days[i].tasks.push({ task, isTurn });
        if (isTurn) days[i].hasTurn = true;
      }
    }
  }
  return { days, tasksWithoutIcal };
}

