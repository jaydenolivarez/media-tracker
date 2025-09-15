import React, { useEffect, useState } from "react";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import app from "../firebase";

const GapSearchModal = ({ open, onClose }) => {
  const [propertyList, setPropertyList] = useState([]);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [gapLength, setGapLength] = useState(2);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");
  // Autocomplete logic
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);
  const filteredProperties = searchQuery.length >= 2
    ? propertyList.filter(
        p =>
          (p.name && p.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (p.unitCode && p.unitCode.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : [];

  // Keyboard navigation for autocomplete
  function handlePropertyInputKeyDown(e) {
    if (!showDropdown || filteredProperties.length === 0) return;
    if (e.key === "ArrowDown") {
      setHighlightedIdx(idx => Math.min(idx + 1, filteredProperties.length - 1));
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      setHighlightedIdx(idx => Math.max(idx - 1, 0));
      e.preventDefault();
    } else if (e.key === "Enter" && highlightedIdx >= 0) {
      const p = filteredProperties[highlightedIdx];
      setSelectedProperty(p);
      setSearchQuery(p.name);
      setShowDropdown(false);
      setHighlightedIdx(-1);
      e.preventDefault();
    } else if (e.key === "Escape") {
      setShowDropdown(false);
      setHighlightedIdx(-1);
    }
  }

  // Fetch property names from Firestore when modal opens
  useEffect(() => {
    if (!open) return;
    const fetchProperties = async () => {
      setLoading(true);
      setError("");
      try {
        const db = getFirestore(app);
        const ref = doc(db, "autocomplete", "propertyNames");
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const names = snap.data().names || [];
          setPropertyList(names);
        } else {
          setPropertyList([]);
        }
      } catch (e) {
        setError("Failed to fetch property names.");
        setPropertyList([]);
      }
      setLoading(false);
    };
    fetchProperties();
  }, [open]);

  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        background: "rgba(0,0,0,0.28)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--bg-card, #fff)",
          borderRadius: 16,
          padding: 36,
          minWidth: 440,
          minHeight: 260,
          boxShadow: "0 8px 40px rgba(60,100,180,0.13)",
          position: "relative",
        }}
        onClick={e => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 0, marginBottom: 20 }}>Gap Search</h2>
        {error && <div style={{ color: 'red', marginBottom: 12 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 16, marginBottom: 18, alignItems: 'flex-end', width: '98%' }}>
          <div style={{ flex: 2, position: 'relative' }}>
            <label style={{ fontWeight: 600, fontSize: 15 }}>Property</label>
            <br />
            <input
              type="text"
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setSelectedProperty(null);
              }}
              onFocus={() => searchQuery.length >= 2 && filteredProperties.length > 0 && setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 120)}
              onKeyDown={handlePropertyInputKeyDown}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 7,
                border: '1.5px solid var(--input-border, #b8c6e6)',
                fontSize: 16,
                outline: 'none',
                background: 'var(--bg-card)',
                color: 'var(--text-main)',
                boxSizing: 'border-box',
                marginBottom: 2,
                marginTop: 6
              }}
              autoComplete="off"
              disabled={loading || propertyList.length === 0}
              required
            />
            {error && (
              <div style={{ color: '#c00', marginTop: 4, marginBottom: 2, fontWeight: 500 }}>
                {error}
              </div>
            )}
            {showDropdown && (
              <div style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                background: "var(--main-bg, #222)",
                color: "var(--main-text, #fff)",
                border: "1px solid #333",
                borderRadius: 8,
                zIndex: 20,
                maxHeight: 220,
                overflowY: "auto",
                boxShadow: "0 2px 8px rgba(0,0,0,0.13)",
                marginTop: 2
              }}>
                {filteredProperties.map((p, idx) => (
                  <div
                    key={p.unitCode || idx}
                    onMouseDown={() => {
                      setSelectedProperty(p);
                      setSearchQuery(p.name);
                      setShowDropdown(false);
                    }}
                    style={{
                      padding: "8px 14px",
                      background: idx === highlightedIdx ? "#3b82f6" : "inherit",
                      color: idx === highlightedIdx ? "#fff" : "inherit",
                      cursor: "pointer",
                      fontWeight: 600
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{p.name}</span>
                    <span style={{ color: '#aaa', marginLeft: 8, fontSize: 13 }}>
                      {p.unitCode && p.unitCode !== p.name ? `(${p.unitCode})` : null}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ flex: 1, width: '20%'}}>
            <label style={{ fontWeight: 600, fontSize: 15 }}>Minimum Gap</label>
            <br />
            <input
              type="number"
              min={2}
              value={gapLength}
              onChange={e => setGapLength(parseInt(e.target.value) || '')}
              style={{
                width: '90%',
                color: 'var(--text-main)',
                padding: '8px 12px',
                fontSize: 16,
                borderRadius: 7,
                border: '1.5px solid var(--input-border, #b8c6e6)',
                background: 'var(--bg-card)',
                marginTop: 6
              }}
            />
          </div>
        </div>
        <button
          style={{
            background: 'linear-gradient(90deg, #f97316, #fbbf24)',
            color: '#fff',
            fontWeight: 700,
            fontSize: 16,
            border: 'none',
            borderRadius: 8,
            padding: '10px 22px',
            cursor: 'pointer',
            marginBottom: 18,
            marginTop: 2,
            boxShadow: '0 2px 12px rgba(249,115,22,0.10)',
            outline: 'none',
            transition: 'background 0.18s, box-shadow 0.18s',
            width: '100%',
          }}
          disabled={!selectedProperty || loading || !gapLength || gapLength < 2}
          onClick={async () => {
            if (!gapLength || gapLength < 2) {
              setError("Minimum gap must be at least 2 days.");
              return;
            }
            setLoading(true);
            setError("");
            setResults([]);
            try {
              // 1. Fetch iCal
              const resp = await fetch(selectedProperty.ical + '?_=' + Date.now()); // prevent caching
              const icalText = await resp.text();
              // 2. Parse events
              const { parseICalEvents } = await import("../utils/icalAvailability");
              const events = parseICalEvents(icalText);
              // 3. Sort events by start
              events.sort((a, b) => a.start - b.start);
              // 4. Find gaps >= gapLength days in next 6 months
              const now = new Date();
              now.setHours(0, 0, 0, 0);
              const sixMonthsOut = new Date(now);
              sixMonthsOut.setMonth(now.getMonth() + 6);
              let pointer = new Date(now);
              const gaps = [];
              for (let i = 0; i <= events.length; i++) {
                const nextStart = i < events.length ? events[i].start : sixMonthsOut;
                // If pointer < nextStart, check gap
                if (pointer < nextStart) {
                  // Calculate gap in days
                  const diffDays = Math.floor((nextStart - pointer) / (1000 * 60 * 60 * 24));
                  if (diffDays >= gapLength) {
                    // Format range
                    const startStr = pointer.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
                    const end = new Date(nextStart);
                    end.setDate(end.getDate() - 1);
                    const endStr = end.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
                    gaps.push(`${startStr} - ${endStr}`);
                  }
                }
                // Move pointer to end of this event (if event ends after pointer)
                if (i < events.length && events[i].end > pointer) {
                  pointer = new Date(events[i].end);
                }
              }
              setResults(gaps);
              if (gaps.length === 0) setError("No gaps found matching the criteria.");
            } catch (e) {
              setError("Failed to search for gaps. Please try again.");
            }
            setLoading(false);
          }}
        >
          {loading ? "Searching..." : "Search"}
        </button>
        <div style={{ minHeight: 40 }}>
          {/* Results will be rendered here */}
          {results.length > 0 && (
            <ul style={{ paddingLeft: 18 }}>
              {results.map((r, idx) => (
                <li key={idx}>{r}</li>
              ))}
            </ul>
          )}
        </div>
        <button
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            background: "none",
            border: "none",
            fontSize: 22,
            cursor: "pointer",
            color: "var(--text-secondary, #888)",
          }}
          onClick={onClose}
          aria-label="Close"
        >
          &times;
        </button>
      </div>
    </div>
  );
};

export default GapSearchModal;
