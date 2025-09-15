// Utilities for working with per-property security codes
// Codes are stored as { codeType, code, startDate, endDate } with date strings in YYYY-MM-DD
// Business rules:
// - Timezone is always Central (America/Chicago)
// - End date is NON-inclusive (code is NOT active on end date)
// - Start date is inclusive (code is active starting on start date)

/**
 * Return today's date as YYYY-MM-DD in America/Chicago (Central) time.
 * @param {Date} now JavaScript Date (optional)
 * @returns {string} YYYY-MM-DD
 */
export function todayYmdCentral(now = new Date()) {
  // Use Intl.DateTimeFormat to compute the Y/M/D in the desired timezone
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  // en-CA returns YYYY-MM-DD
  return dtf.format(now);
}

/**
 * Normalize an input to strict YYYY-MM-DD or return empty string if invalid.
 * @param {string} s
 * @returns {string}
 */
export function normalizeYmd(s) {
  const v = (s || '').toString().trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return '';
  return v;
}

/**
 * Determine if a code is active on a given day per Central time.
 * End date is NON-inclusive; Start date is inclusive.
 * If startDate or endDate are missing/blank, they are treated as unbounded on that side.
 * @param {Object} codeEntry
 * @param {string} [dateYmd] YYYY-MM-DD string in Central time. If omitted, uses today.
 * @param {Date} [now] Optional Date used when dateYmd is omitted.
 * @returns {boolean}
 */
export function isCodeActiveOn(codeEntry, dateYmd, now = new Date()) {
  const today = dateYmd && /^\d{4}-\d{2}-\d{2}$/.test(dateYmd)
    ? dateYmd
    : todayYmdCentral(now);
  const start = normalizeYmd(codeEntry?.startDate);
  const end = normalizeYmd(codeEntry?.endDate);
  // Start inclusive: (no start) or (start <= today)
  const startOk = !start || start <= today;
  // End NON-inclusive: (no end) or (today < end)
  const endOk = !end || today < end;
  return !!(startOk && endOk);
}

/**
 * Filter a list of code entries to only those active as of Central time today (or a provided date).
 * @param {Array} codes Array of { codeType, code, startDate, endDate }
 * @param {string} [dateYmd] Optional YYYY-MM-DD in Central time to evaluate against
 * @param {Date} [now] Optional Date when dateYmd is omitted
 * @returns {Array}
 */
export function getActiveSecurityCodes(codes, dateYmd, now = new Date()) {
  const list = Array.isArray(codes) ? codes : [];
  return list.filter(c => isCodeActiveOn(c, dateYmd, now));
}

/**
 * Group active codes by codeType for convenience when displaying.
 * Returns a map-like object: { [codeType]: Array<codeEntry> }
 * Keeps all entries per type; does not deduplicate.
 * @param {Array} codes
 * @param {string} [dateYmd]
 * @param {Date} [now]
 * @returns {Object<string, Array>}
 */
export function groupActiveCodesByType(codes, dateYmd, now = new Date()) {
  const active = getActiveSecurityCodes(codes, dateYmd, now);
  const grouped = {};
  for (const c of active) {
    const key = (c?.codeType || '').toString().trim() || 'Unknown';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(c);
  }
  return grouped;
}
