import React from "react";
import ReactDOM from "react-dom";
import { DateRange, Calendar } from "react-date-range";
import { enUS } from "date-fns/locale";
import "react-date-range/dist/styles.css";
import "react-date-range/dist/theme/default.css";
import "../styles/dateRangeVars.css";

/**
 * DateAssignmentModal
 * Props:
 *  - open: boolean
 *  - onClose: function
 *  - onSave: function
 *  - onClear: function
 *  - value: {start, end} for range, or {date} for single
 *  - loading: boolean
 *  - error: string
 *  - success: string
 *  - onChange: function
 *  - rangeEnabled: boolean (if true, allow range selection; if false, single date)
 *  - title: string (optional override for modal title)
 */
import { useEffect, useState, useRef } from "react";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { parseICalEvents } from "../utils/icalAvailability";

// Use a global cache to avoid hot-reload TDZ issues
const getIcalCache = () => {
  // Prefer window (browser). Otherwise, use a module-local object as fallback.
  if (typeof window !== 'undefined') {
    if (!window.__ICAL_CACHE) window.__ICAL_CACHE = {};
    return window.__ICAL_CACHE;
  }
  // Last resort (shouldn't happen in this app): keep a module-level singleton
  if (!getIcalCache.__fallback) getIcalCache.__fallback = {};
  return getIcalCache.__fallback;
};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export default function DateAssignmentModal({
  open,
  onClose,
  onSave,
  onClear,
  value,
  firestoreValue, // <-- NEW PROP
  loading,
  error,
  success,
  onChange,
  rangeEnabled = false,
  title,
  unitCode,
  currentUserEmail = "",
  photographerEmail = "",
  inline = false,
  hideActions = false,
  embeddedStyle = false,
  onCalendarOptionsChange = () => {},
  invitePortalEl = null
}) {
  // Hooks must always be called
  const [reservedDates, setReservedDates] = useState([]);
  const lastFetchedRef = useRef({});
  const minDate = new Date('2025-07-19T00:00:00-05:00');
  const maxDate = new Date('2026-07-19T00:00:00-05:00');
  const [selectedDate, setSelectedDate] = React.useState(value && value.date ? value.date : "");
  // Calendar invite state
  const [sendInvite, setSendInvite] = useState(false);
  const [showRecipients, setShowRecipients] = useState(false);
  const [includeMe, setIncludeMe] = useState(!!currentUserEmail);
  const [includePhotog, setIncludePhotog] = useState(!!photographerEmail);
  const [customEmailInput, setCustomEmailInput] = useState("");
  const [customEmails, setCustomEmails] = useState([]);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Hold latest callback in a ref to avoid effect dependency loops
  const onCalRef = useRef(onCalendarOptionsChange);
  useEffect(() => { onCalRef.current = onCalendarOptionsChange; }, [onCalendarOptionsChange]);

  // Bubble calendar options up when toggles/recipients change (for embedded combined save)
  useEffect(() => {
    const recipients = (() => {
      const arr = [];
      if (sendInvite) {
        if (includeMe && currentUserEmail) arr.push(currentUserEmail.toLowerCase());
        if (includePhotog && photographerEmail) arr.push(photographerEmail.toLowerCase());
        for (const em of customEmails) { if (em && emailRegex.test(em)) arr.push(em.toLowerCase()); }
      }
      return Array.from(new Set(arr));
    })();
    // Use ref to avoid re-running when the parent recreates the callback each render
    if (typeof onCalRef.current === 'function') {
      onCalRef.current({ enabled: !!sendInvite, recipients });
    }
  }, [sendInvite, includeMe, includePhotog, customEmails, currentUserEmail, photographerEmail]);

  // When embedded inline in the combined panel, automatically include/exclude assigned photographer on change
  useEffect(() => {
    if (inline) {
      setIncludePhotog(!!photographerEmail);
    }
  }, [photographerEmail, inline]);

  useEffect(() => {
    // Reset invite toggles when modal opens
    if (!inline && open) {
      setSendInvite(false);
      setShowRecipients(false);
      setIncludeMe(!!currentUserEmail);
      setIncludePhotog(!!photographerEmail);
      setCustomEmailInput("");
      setCustomEmails([]);
    }
  }, [open, currentUserEmail, photographerEmail]);
  React.useEffect(() => {
    if ((inline && value) || (!inline && open)) {
      setSelectedDate(value && value.date ? value.date : "");
    }
  }, [open, value]);

  // (Removed duplicate fetchReservedDates effect that caused confusion)

  // Helper: check if date is reserved
  const isReserved = (dateObj) => {
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
    const dd = String(dateObj.getDate()).padStart(2, "0");
    return reservedDates.includes(`${yyyy}-${mm}-${dd}`);
  };

  // Custom day content for reserved styling
  function renderDayContent(day) {
    if (!isReserved(day)) return <span>{day.getDate()}</span>;

    // Check if previous/next days are reserved
    const prevDay = new Date(day);
    prevDay.setDate(day.getDate() - 1);
    const nextDay = new Date(day);
    nextDay.setDate(day.getDate() + 1);

    const prevReserved = isReserved(prevDay);
    const nextReserved = isReserved(nextDay);

    // Determine border radius for reservation segment
    let borderRadius = "0";
    if (!prevReserved && !nextReserved) {
      borderRadius = "8px"; // single day
    } else if (!prevReserved) {
      borderRadius = "8px 0 0 8px"; // start
    } else if (!nextReserved) {
      borderRadius = "0 8px 8px 0"; // end
    }

    // Negative margin to visually connect consecutive reserved days
    const marginLeft = prevReserved ? "-4px" : "0";
    const marginRight = nextReserved ? "-4px" : "0";

    return (
      <div
        style={{
          background: "#b0b0b0",
          color: "#fff",
          borderRadius,
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          cursor: "pointer",
          marginLeft,
          marginRight,
          boxSizing: "border-box",
          zIndex: 2
        }}
        title="Reserved"
      >
        <span>{day.getDate()}</span>
      </div>
    );
  }

  useEffect(() => {
    let cancelled = false;
    async function fetchReservedDates() {
      if (!open || !unitCode) return;
      // Cache logic
      const cacheKey = unitCode;
      const ICAL_CACHE = getIcalCache();
      const now = Date.now();
      if (
        ICAL_CACHE[cacheKey] &&
        ICAL_CACHE[cacheKey].expires > now
      ) {
        setReservedDates(ICAL_CACHE[cacheKey].dates);
        return;
      }
      try {
        const db = getFirestore();
        const ref = doc(db, "autocomplete", "propertyNames");
        const snap = await getDoc(ref);
        let icalUrl = null;
        if (snap.exists()) {
          const arr = snap.data().names || [];
          const found = arr.find(
            (x) => x.unitCode === unitCode || x.name === unitCode
          );
          if (found && found.ical) icalUrl = found.ical;
        }
        if (!icalUrl) {
          setReservedDates([]);
          return;
        }
        const resp = await fetch(icalUrl);
        const text = await resp.text();
        const events = parseICalEvents(text);
        // Flatten to list of all reserved days (YYYY-MM-DD)
        const days = [];
        for (const ev of events) {
          let d = new Date(ev.start);
          // iCal DTEND is exclusive, so don't include last day
          while (d < ev.end) {
            days.push(
              `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
            );
            d.setDate(d.getDate() + 1);
          }
        }
        const ICAL_CACHE2 = getIcalCache();
        ICAL_CACHE2[cacheKey] = {
          dates: days,
          expires: now + CACHE_DURATION
        };
        if (!cancelled) setReservedDates(days);
      } catch (e) {
        setReservedDates([]);
      }
    }
    if (open && unitCode) fetchReservedDates();
    return () => {
      cancelled = true;
    };
  }, [open, unitCode]);

  // Only render if open is true (for modal usage). For inline usage, parent controls visibility.
  if (!inline && !open) return null;

  // Build invite controls block (rendered inline or portaled)
  const inviteControls = (
    <div style={{ marginTop: 12, width: '90%', background: 'var(--bg-card, #141a24)', border: '1px solid var(--button-border)', borderRadius: 10, padding: 12 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
        <input
          type="checkbox"
          checked={sendInvite}
          onChange={e => setSendInvite(e.target.checked)}
          style={{ width: 16, height: 16 }}
        />
        <span style={{ color: 'var(--text-main)' }}>Open Google Calendar invite on save</span>
      </label>
      {sendInvite && (
        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            onClick={() => setShowRecipients(s => !s)}
            style={{
              background: 'var(--button-bg)',
              border: '1px solid var(--button-border)',
              color: 'var(--button-text)',
              borderRadius: 8,
              padding: '6px 10px',
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer'
            }}
          >
            {`Recipients (${[includeMe && currentUserEmail ? 1 : 0, includePhotog && photographerEmail ? 1 : 0].reduce((a,b)=>a+b,0) + customEmails.length})`}
          </button>
          {showRecipients && (
            <div style={{ marginTop: 10, padding: 10, border: '1px dashed var(--button-border)', borderRadius: 8 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" disabled={!currentUserEmail} checked={!!currentUserEmail && includeMe} onChange={e => setIncludeMe(e.target.checked)} />
                  <span style={{ color: currentUserEmail ? 'var(--text-main)' : '#8a8a8a' }}>Me{currentUserEmail ? ` (${currentUserEmail})` : ' (no email)'}
                  </span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" disabled={!photographerEmail} checked={!!photographerEmail && includePhotog} onChange={e => setIncludePhotog(e.target.checked)} />
                  <span style={{ color: photographerEmail ? 'var(--text-main)' : '#8a8a8a' }}>Assigned Photographer{photographerEmail ? ` (${photographerEmail})` : ' (no email)'}
                  </span>
                </label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                  <input
                    type="email"
                    placeholder="Add custom email"
                    value={customEmailInput}
                    onChange={e => setCustomEmailInput(e.target.value)}
                    style={{ flex: 1, padding: '8px 10px', borderRadius: 7, border: '1px solid var(--button-border)', background: 'transparent', color: 'var(--text-main)' }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const entry = (customEmailInput || '').trim();
                      if (!entry || !emailRegex.test(entry)) return;
                      const lc = entry.toLowerCase();
                      setCustomEmails(prev => Array.from(new Set([...(prev || []), lc])));
                      setCustomEmailInput("");
                    }}
                    disabled={!customEmailInput || !emailRegex.test(customEmailInput)}
                    style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '7px 12px', borderRadius: 7, fontWeight: 600, cursor: 'pointer' }}
                  >Add</button>
                </div>
                {customEmails.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {customEmails.map(em => (
                      <span key={em} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--button-bg)', border: '1px solid var(--button-border)', color: 'var(--button-text)', borderRadius: 999, padding: '4px 8px' }}>
                        {em}
                        <button type="button" onClick={() => setCustomEmails(prev => (prev || []).filter(x => x !== em))} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}>×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // Card content (used for inline and inside overlay)
  const card = (
      <div
        style={{
          background: embeddedStyle ? 'transparent' : "var(--bg-card, #181e29)",
          borderRadius: embeddedStyle ? 0 : 18,
          boxShadow: embeddedStyle ? 'none' : "0 4px 32px rgba(60,80,130,0.13)",
          padding: embeddedStyle ? 0 : 32,
          minWidth: 340,
          maxWidth: inline ? '100%' : "90vw",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          position: "relative",
        }}
        onClick={e => e.stopPropagation()}
      >
        {embeddedStyle ? null : (
        <div style={{ marginBottom: 10, position: 'relative', width: '100%', minHeight: 32 }}>
          <div style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            textAlign: 'center',
            fontWeight: 600,
            fontSize: 18,
            color: 'var(--text-main)',
            pointerEvents: 'none',
          }}>
            {title || (rangeEnabled ? 'Select Date Range' : 'Select Date')}
          </div>
        </div>
        )}
        {rangeEnabled ? (
          <DateRange
            months={1}
            direction="horizontal"
            locale={enUS}
            editableDateInputs={true}
            onChange={item => {
              if (onChange) {
                // Always pass both start and end as YYYY-MM-DD
                const startDate = item.selection.startDate;
                const endDate = item.selection.endDate;
                const yyyyMMDD = d => d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : "";
                onChange({
                  start: yyyyMMDD(startDate),
                  end: yyyyMMDD(endDate),
                });
              }
            }}
            moveRangeOnFirstSelection={false}
            ranges={[
              value && value.start && value.end
                ? {
                    startDate: (() => {
                      if (!value.start || !/^\d{4}-\d{2}-\d{2}$/.test(value.start)) return new Date();
                      const [ys, ms, ds] = value.start.split('-');
                      return new Date(Number(ys), Number(ms) - 1, Number(ds));
                    })(),
                    endDate: (() => {
                      if (!value.end || !/^\d{4}-\d{2}-\d{2}$/.test(value.end)) return new Date();
                      const [ye, me, de] = value.end.split('-');
                      return new Date(Number(ye), Number(me) - 1, Number(de));
                    })(),
                    key: "selection",
                  }
                : {
                    startDate: new Date(),
                    endDate: new Date(),
                    key: "selection",
                  }
            ]}
            minDate={minDate}
            maxDate={maxDate}
            showDateDisplay={false}
            dayContentRenderer={renderDayContent}
            style={{
              borderRadius: 14,
              boxShadow: "0 2px 16px rgba(60,80,130,0.08)",
              background: "var(--bg-card, #fff)",
              color: "var(--text-main)",
              fontSize: 16,
            }}
          />
        ) : (
          <Calendar
  date={selectedDate ? (() => {
    const [y, m, d] = selectedDate.split('-');
    return new Date(Number(y), Number(m) - 1, Number(d));
  })() : new Date()}
            onChange={date => {
              const yyyy = date.getFullYear();
              const mm = String(date.getMonth() + 1).padStart(2, '0');
              const dd = String(date.getDate()).padStart(2, '0');
              setSelectedDate(`${yyyy}-${mm}-${dd}`);
            }}
            locale={enUS}
            dayContentRenderer={renderDayContent}
            minDate={minDate}
            maxDate={maxDate}
            style={{
              borderRadius: 14,
              boxShadow: "0 2px 16px rgba(60,80,130,0.08)",
              background: "var(--bg-card, #fff)",
              fontSize: 16,
            }}
          />
        )}

        {/* Google Calendar invite controls: inline or portaled */}
        {invitePortalEl && inline ? null : inviteControls}
        {!hideActions && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginTop: 18 }}>
          <div>
            {(() => {
              // Debug logging
              if (typeof window !== 'undefined') {
                if (rangeEnabled && firestoreValue) {
                }
              }
              // Range mode: require both start and end to be valid YYYY-MM-DD
              if (
                rangeEnabled && firestoreValue && (
                  // Both are valid date strings (YYYY-MM-DD or ISO)
                  ((typeof firestoreValue.start === 'string' && firestoreValue.start.length >= 10 && !firestoreValue.start.startsWith('Invalid')) &&
                  (typeof firestoreValue.end === 'string' && firestoreValue.end.length >= 10 && !firestoreValue.end.startsWith('Invalid')))
                  ||
                  // Both are Firestore Timestamp objects
                  (typeof firestoreValue.start === 'object' && firestoreValue.start && firestoreValue.start.seconds &&
                  typeof firestoreValue.end === 'object' && firestoreValue.end && firestoreValue.end.seconds)
                )
              ) {
                return (
                  <button
                    type="button"
                    onClick={() => {
                      onClear && onClear();
                      onClose && onClose();
                    }}
                    aria-label="Clear date"
                    style={{
                      background: '#3b82f6',
                      padding: '7px 18px',
                      border: 'none',
                      color: '#fff',
                      borderRadius: 7,
                      marginRight: 12,
                      fontWeight: 600,
                      fontSize: 15,
                      cursor: 'pointer',
                    }}
                  >Remove Dates</button>
                );
              }
              // Single date mode: valid string, or Firestore Timestamp, or object with valid date string
              if (!rangeEnabled && firestoreValue) {
                if (typeof firestoreValue === 'string' && firestoreValue.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(firestoreValue)) {
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        onClear && onClear();
                        onClose && onClose();
                      }}
                      aria-label="Clear date"
                      style={{
                        background: '#3b82f6',
                        padding: '7px 18px',
                        border: 'none',
                        color: '#fff',
                        borderRadius: 7,
                        marginRight: 12,
                        fontWeight: 600,
                        fontSize: 15,
                        cursor: 'pointer',
                      }}
                    >Remove Date</button>
                  );
                }
                if (typeof firestoreValue === 'object') {
                  // Firestore Timestamp
                  if (firestoreValue.seconds) {
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          onClear && onClear();
                          onClose && onClose();
                        }}
                        aria-label="Clear date"
                        style={{
                          background: '#3b82f6',
                          padding: '7px 18px',
                          border: 'none',
                          color: '#fff',
                          borderRadius: 7,
                          marginRight: 12,
                          fontWeight: 600,
                          fontSize: 15,
                          cursor: 'pointer',
                        }}
                      >Remove Date</button>
                    );
                  }
                  // Object with .date property
                  if (typeof firestoreValue.date === 'string' && firestoreValue.date.length === 10) {
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          onClear && onClear();
                          onClose && onClose();
                        }}
                        aria-label="Clear date"
                        style={{
                          background: '#3b82f6',
                          padding: '7px 18px',
                          border: 'none',
                          color: '#fff',
                          borderRadius: 7,
                          marginRight: 12,
                          fontWeight: 600,
                          fontSize: 15,
                          cursor: 'pointer',
                        }}
                      >Remove Date</button>
                    );
                  }
                }
              }
              return null;
            })()}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              style={{ padding: '7px 18px', borderRadius: 7, background: '#3b82f6', color: '#fff', border: 'none', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}
              onClick={() => {
                const calendarOpts = {
                  enabled: !!sendInvite,
                  recipients: (() => {
                    const arr = [];
                    if (sendInvite) {
                      if (includeMe && currentUserEmail) arr.push(currentUserEmail.toLowerCase());
                      if (includePhotog && photographerEmail) arr.push(photographerEmail.toLowerCase());
                      for (const em of customEmails) { if (em && emailRegex.test(em)) arr.push(em.toLowerCase()); }
                    }
                    // dedupe
                    return Array.from(new Set(arr));
                  })(),
                };
                if (rangeEnabled) {
                  // Only save if both start and end are valid dates
                  if (value && value.start && value.end) {
                    const start = new Date(value.start);
                    const end = new Date(value.end);
                    if (!isNaN(start) && !isNaN(end)) {
                      onSave && onSave({
                        start: start.toISOString(),
                        end: end.toISOString()
                      }, calendarOpts);
                    } else {
                      onSave && onSave("", calendarOpts);
                    }
                  } else {
                    onSave && onSave("", calendarOpts);
                  }
                } else {
                  // For single date: format as YYYY-MM-DD
                  if (selectedDate) {
                    onSave && onSave(selectedDate, calendarOpts);
                  }
                }
              }}
              disabled={loading}
            >
              {loading ? 'Saving...' : 'Save'}
            </button>
            <button
              style={{ padding: '7px 18px', borderRadius: 7, background: 'var(--sidebar-bg)', color: 'var(--text-main)', border: 'none', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </div>
        )}
        {success && (
          <div style={{ color: "#22c55e", fontWeight: 500, fontSize: 15, marginTop: 10 }}>{success}</div>
        )}
        {error && (
          <div style={{ color: "#e74c3c", fontWeight: 500, fontSize: 15, marginTop: 10 }}>{error}</div>
        )}
      </div>
  );

  if (inline) {
    // When inline, also render a portal of invite controls if requested
    return (
      <>
        {card}
        {(invitePortalEl ? ReactDOM.createPortal(inviteControls, invitePortalEl) : null)}
      </>
    );
  }

  // Render using a portal to avoid stacking-context issues
  const overlay = (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        background: "rgba(0,0,0,0.32)",
        zIndex: 100050,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-modal="true"
      role="dialog"
    >
      {card}
    </div>
  );

  return typeof document !== 'undefined' ? ReactDOM.createPortal(overlay, document.body) : overlay;
}
