import React, { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MEDIA_TYPES, getMediaTypeLabel, getMediaTypeColor } from "../constants/mediaTypes";

const steps = [
  "mediaType",
  "propertyType",
  "propertyName",
  "updateTypeNotes",
  "assignmentPriority",
];
 const UPDATE_TYPES_ALL = [
   "New Property",
   "Full Reshoot",
   "Interior/Exterior Update",
   "Construction Update",
   "Specific Owner Request",
   "Other",
 ];
 const UPDATE_TYPES_EXISTING = UPDATE_TYPES_ALL.filter(t => t !== "New Property");
 
export default function TaskCreateStepper({ onCancel, onSubmit, users = [] }) {
  // Property list for autocomplete
  const [propertyList, setPropertyList] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filtered, setFiltered] = useState([]); // filtered unitCodes
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);
  const [propertyLookup, setPropertyLookup] = useState({}); // name/unitCode -> unitCode 
  const [propertyMap, setPropertyMap] = useState({}); // unitCode -> { name, unitCode }
  const [propertyError, setPropertyError] = useState("");
  // Track if property was selected from dropdown
  const [propertySelectedFromDropdown, setPropertySelectedFromDropdown] = useState(false);

  // State
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    mediaType: "",
    propertyType: "",
    isNewProperty: null,
    propertyName: "",
    updateType: "",
    notes: "",
    assignees: { photographer: "", editor: "" },
    priorityRequest: false,
    expectedCompletion: "",
    fileLinks: [],
  });

  useEffect(() => {
    // Fetch property names from Firestore for autocomplete
    async function fetchPropertyNames() {
      try {
        const db = (await import('firebase/firestore')).getFirestore();
        const docRef = (await import('firebase/firestore')).doc(db, 'autocomplete', 'propertyNames');
        const snap = await (await import('firebase/firestore')).getDoc(docRef);
        if (snap.exists() && Array.isArray(snap.data().names)) {
          const list = snap.data().names;
          setPropertyList(list);
          window.propertyList = list;
          // Build lookup maps
          const lookup = {};
          const map = {};
          list.forEach(({ name, unitCode, ical }) => {
            if (unitCode) {
              map[unitCode.toLowerCase()] = { name, unitCode, ical };
              lookup[unitCode.toLowerCase()] = unitCode;
            }
            if (name) {
              lookup[name.toLowerCase()] = unitCode;
            }
          });
          setPropertyLookup(lookup);
          setPropertyMap(map);
        } else {
          setPropertyList([]);
          setPropertyLookup({});
          setPropertyMap({});
          window.propertyList = [];
        }
      } catch (err) {
        setPropertyList([]);
        window.propertyList = [];
      }
    }
    fetchPropertyNames();
  }, []);

  // Reset dropdown selection flag when entering property name step or changing type
  useEffect(() => {
    if (step === 2) setPropertySelectedFromDropdown(false);
  }, [step, form.propertyType, form.isNewProperty]);

  // Filtering logic for property autocomplete
  useEffect(() => {
    if (searchQuery.length >= 2) {
      const lower = searchQuery.toLowerCase();
      const matches = propertyList.filter(
        prop => prop.name.toLowerCase().includes(lower) || prop.unitCode.toLowerCase().includes(lower)
      );
      setFiltered(matches.map(prop => prop.unitCode));
      setShowDropdown(matches.length > 0);
      setHighlightedIdx(-1);
    } else {
      setFiltered([]);
      setShowDropdown(false);
      setHighlightedIdx(-1);
    }
  }, [searchQuery, propertyList]);
 
  // Ensure update type remains valid based on Home/Condo + New/Existing toggle
  // - If switching to Existing, clear a previously forced "New Property"
  // - If switching to New, force updateType to "New Property" and hide choices later
  useEffect(() => {
    if (form.propertyType === "Home/Condo") {
      if (form.isNewProperty === false && form.updateType === "New Property") {
        setForm(f => ({ ...f, updateType: "" }));
      } else if (form.isNewProperty === true && form.updateType !== "New Property") {
        setForm(f => ({ ...f, updateType: "New Property" }));
      }
    }
  }, [form.propertyType, form.isNewProperty]);
 
  // Handle selection from dropdown
  const handleSelect = (unitCode) => {
    setForm(f => ({ ...f, propertyName: unitCode }));
    const pretty = propertyMap[unitCode?.toLowerCase()]?.name || unitCode;
    setSearchQuery(pretty);
    setShowDropdown(false);
    setPropertyError("");
    setPropertySelectedFromDropdown(true);
  };

  // Keyboard nav for dropdown
  const handleInputKeyDown = (e) => {
    if (!showDropdown) return;
    if (e.key === "ArrowDown") {
      setHighlightedIdx(idx => Math.min(idx + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      setHighlightedIdx(idx => Math.max(idx - 1, 0));
    } else if (e.key === "Enter") {
      if (highlightedIdx >= 0 && filtered[highlightedIdx]) {
        handleSelect(filtered[highlightedIdx]);
        e.preventDefault();
      }
    }
  };

  const clearAll = () => {
    setForm({
      mediaType: "",
      propertyType: "",
      isNewProperty: null,
      propertyName: "",
      updateType: "",
      notes: "",
      assignees: { photographer: "", editor: "" },
      priorityRequest: false,
      expectedCompletion: "",
      fileLinks: [],
    });
    setStep(0);
    // Reset transient UI state so modal reopens cleanly
    setSearchQuery("");
    setFiltered([]);
    setShowDropdown(false);
    setHighlightedIdx(-1);
    setPropertyError("");
    setPropertySelectedFromDropdown(false);
  };

  // --- Step 1: Media Type ---
  const renderMediaTypeStep = () => (
    <motion.div
      key="media-type"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -24 }}
      transition={{ duration: 0.28 }}
      style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}
    >
      <h2 style={{ fontWeight: 700, fontSize: 24, marginBottom: 32 }}>Select Media Type</h2>
      <div style={{ display: "flex", gap: 32, marginBottom: 24 }}>
        {MEDIA_TYPES.map(type => (
          <button
            key={type.key}
            onClick={() => setForm(f => ({ ...f, mediaType: type.key }))}
            style={{
              minWidth: 140,
              minHeight: 80,
              background: form.mediaType === type.key ? getMediaTypeColor(type.key) : "#f4f6fa",
              color: form.mediaType === type.key ? "#fff" : getMediaTypeColor(type.key),
              border: form.mediaType === type.key ? `2.5px solid ${getMediaTypeColor(type.key)}` : `2px solid #e0e6f0`,
              borderRadius: 16,
              fontWeight: 700,
              fontSize: 22,
              boxShadow: form.mediaType === type.key ? "0 2px 12px rgba(80,120,200,0.08)" : "none",
              cursor: "pointer",
              transition: "all 0.17s cubic-bezier(.4,0,.2,1)",
              outline: "none",
            }}
          >
            {getMediaTypeLabel(type.key)}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 18, marginTop: 24 }}>
        <button onClick={clearAll} style={{ background: "none", color: "#888", border: "none", fontSize: 16, cursor: "pointer", textDecoration: "underline" }}>Clear</button>
        <button
          onClick={() => setStep(1)}
          disabled={!form.mediaType}
          style={{
            background: form.mediaType ? getMediaTypeColor(form.mediaType) : "#e0e6f0",
            color: form.mediaType ? "#fff" : "#bbb",
            border: "none",
            borderRadius: 9,
            fontWeight: 600,
            fontSize: 18,
            minWidth: 120,
            minHeight: 44,
            marginLeft: 12,
            cursor: form.mediaType ? "pointer" : "not-allowed",
            opacity: form.mediaType ? 1 : 0.7,
            boxShadow: form.mediaType ? "0 2px 8px rgba(80,120,200,0.10)" : "none",
            transition: "all 0.17s cubic-bezier(.4,0,.2,1)",
          }}
        >
          Next →
        </button>
      </div>
    </motion.div>
  );

  return (
    <div style={{ width: "100%", minHeight: 420, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative", background: "var(--bg-card)", boxShadow: "0 2px 16px rgba(80,120,200,0.07)", borderRadius: 16, marginTop: 40, padding: 40 }}>
      <AnimatePresence mode="wait">
        {step === 0 && renderMediaTypeStep()}
        {step === 1 && (
          <motion.div
            key="property-type"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ duration: 0.28 }}
            style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}
          >
            <h2 style={{ fontWeight: 700, fontSize: 24, marginBottom: 32 }}>Select Property Type</h2>
            <div style={{ display: "flex", gap: 24, marginBottom: 24 }}>
              {["Home/Condo", "Complex", "Neighborhood", "Community", "Real Estate"].map(type => (
                <button
                  key={type}
                  onClick={() => {
                    setForm(f => ({ ...f, propertyType: type, isNewProperty: type === "Home/Condo" ? null : f.isNewProperty }));
                  }}
                  style={{
                    minWidth: 120,
                    minHeight: 60,
                    background: form.propertyType === type ? "#4078ff" : "#f4f6fa",
                    color: form.propertyType === type ? "#fff" : "#4078ff",
                    border: form.propertyType === type ? `2.5px solid #4078ff` : `2px solid #e0e6f0`,
                    borderRadius: 14,
                    fontWeight: 600,
                    fontSize: 19,
                    boxShadow: form.propertyType === type ? "0 2px 12px rgba(80,120,200,0.08)" : "none",
                    cursor: "pointer",
                    transition: "all 0.17s cubic-bezier(.4,0,.2,1)",
                    outline: "none",
                  }}
                >
                  {type}
                </button>
              ))}
            </div>
            {/* Home/Condo new/existing toggle */}
            {form.propertyType === "Home/Condo" && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.23 }}
                style={{ marginBottom: 24, display: 'flex', gap: 18 }}
              >
                <button
                  onClick={() => setForm(f => ({ ...f, isNewProperty: false }))}
                  style={{
                    minWidth: 110,
                    minHeight: 44,
                    background: form.isNewProperty === false ? '#4078ff' : '#f4f6fa',
                    color: form.isNewProperty === false ? '#fff' : '#4078ff',
                    border: form.isNewProperty === false ? '2.5px solid #4078ff' : '2px solid #e0e6f0',
                    borderRadius: 10,
                    fontWeight: 600,
                    fontSize: 17,
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                >
                  Existing Property
                </button>
                <button
                  onClick={() => setForm(f => ({ ...f, isNewProperty: true }))}
                  style={{
                    minWidth: 110,
                    minHeight: 44,
                    background: form.isNewProperty === true ? '#4078ff' : '#f4f6fa',
                    color: form.isNewProperty === true ? '#fff' : '#4078ff',
                    border: form.isNewProperty === true ? '2.5px solid #4078ff' : '2px solid #e0e6f0',
                    borderRadius: 10,
                    fontWeight: 600,
                    fontSize: 17,
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                >
                  New Property
                </button>
              </motion.div>
            )}
          <div style={{ display: 'flex', gap: 18, marginTop: 24 }}>
            <button
              onClick={() => setStep(0)}
              style={{
                background: 'none',
                color: '#888',
                border: 'none',
                fontSize: 16,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              ← Back
            </button>
            <button
              onClick={() => setStep(2)}
              disabled={
                !form.propertyType || (form.propertyType === 'Home/Condo' && form.isNewProperty === null)
              }
              style={{
                background:
                  form.propertyType && (form.propertyType !== 'Home/Condo' || form.isNewProperty !== null)
                    ? '#4078ff'
                    : '#e0e6f0',
                color:
                  form.propertyType && (form.propertyType !== 'Home/Condo' || form.isNewProperty !== null)
                    ? '#fff'
                    : '#bbb',
                border: 'none',
                borderRadius: 9,
                fontWeight: 600,
                fontSize: 18,
                minWidth: 120,
                minHeight: 44,
                marginLeft: 12,
                cursor:
                  form.propertyType && (form.propertyType !== 'Home/Condo' || form.isNewProperty !== null)
                    ? 'pointer'
                    : 'not-allowed',
                opacity:
                  form.propertyType && (form.propertyType !== 'Home/Condo' || form.isNewProperty !== null)
                    ? 1
                    : 0.7,
                boxShadow:
                  form.propertyType && (form.propertyType !== 'Home/Condo' || form.isNewProperty !== null)
                    ? '0 2px 8px rgba(80,120,200,0.10)'
                    : 'none',
                transition: 'all 0.17s cubic-bezier(.4,0,.2,1)',
              }}
            >
              Next →
            </button>
          </div>
        </motion.div>
      )}
      {step === 2 && (
        <motion.div
          key="property-name"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -24 }}
          transition={{ duration: 0.28 }}
          style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}
        >
          <h2 style={{ fontWeight: 700, fontSize: 24, marginBottom: 32 }}>Property Name</h2>
          {/* Autocomplete for Home/Condo + Existing */}
          {form.propertyType === "Home/Condo" && form.isNewProperty === false ? (
            <>
              <div style={{ position: "relative", width: 320 }}>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => {
                    setSearchQuery(e.target.value);
                    setPropertyError("");
                    setPropertySelectedFromDropdown(false);
                  }}
                  onFocus={() => searchQuery.length >= 2 && filtered.length > 0 && setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 120)}
                  onKeyDown={handleInputKeyDown}
                  placeholder="Start typing to search..."
                  style={{
                    width: 320,
                    padding: "12px 16px",
                    fontSize: 18,
                    borderRadius: 8,
                    border: "2px solid #e0e6f0",
                    marginBottom: 12,
                  }}
                  autoComplete="off"
                />
                {propertyError && (
                  <div style={{ color: '#c00', marginTop: 4, marginBottom: 2, fontWeight: 500 }}>
                    {propertyError}
                  </div>
                )}
                {showDropdown && (
                  <div style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    background: "#222",
                    color: "#fff",
                    border: "1px solid #333",
                    borderRadius: 8,
                    zIndex: 20,
                    maxHeight: 220,
                    overflowY: "auto",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.13)",
                    marginTop: 2
                  }}>
                    {filtered.map((unitCode, idx) => (
                      <div
                        key={unitCode}
                        onMouseDown={() => handleSelect(unitCode)}
                        style={{
                          padding: "8px 14px",
                          background: idx === highlightedIdx ? "#3b82f6" : "inherit",
                          color: idx === highlightedIdx ? "#fff" : "inherit",
                          cursor: "pointer"
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>{propertyMap[unitCode?.toLowerCase()]?.name || unitCode}</span>
                        <span style={{ color: '#aaa', marginLeft: 8, fontSize: 13 }}>
                          {propertyMap[unitCode?.toLowerCase()]?.unitCode && propertyMap[unitCode?.toLowerCase()]?.unitCode !== propertyMap[unitCode?.toLowerCase()]?.name ? `(${propertyMap[unitCode?.toLowerCase()]?.unitCode})` : null}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ color: '#888', fontSize: 14, marginBottom: 12 }}>Select from existing properties</div>
            </>
          ) : (
            // Free input for new or non-Home/Condo
            <input
              type="text"
              value={form.propertyName}
              onChange={e => setForm(f => ({ ...f, propertyName: e.target.value }))}
              placeholder="Enter property name"
              style={{
                width: 320,
                padding: "12px 16px",
                fontSize: 18,
                borderRadius: 8,
                border: "2px solid #e0e6f0",
                marginBottom: 12,
              }}
              autoComplete="off"
            />
          )}
          <div style={{ display: 'flex', gap: 18, marginTop: 24 }}>
            <button
              onClick={() => setStep(1)}
              style={{
                background: 'none',
                color: '#888',
                border: 'none',
                fontSize: 16,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              ← Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={
                (
                  // Home/Condo + Existing: require dropdown selection
                  form.propertyType === "Home/Condo" && form.isNewProperty === false
                    ? !form.propertyName || !propertyMap[form.propertyName?.toLowerCase()] || !propertySelectedFromDropdown
                  // Home/Condo + New: require non-empty
                  : form.propertyType === "Home/Condo" && form.isNewProperty === true
                    ? !form.propertyName
                  // All others: require non-empty
                  : !form.propertyName
                )
              }
              style={{
                background:
                  (
                    // Home/Condo + Existing: require valid selection
                    form.propertyType === "Home/Condo" && form.isNewProperty === false
                      ? form.propertyName && propertyMap[form.propertyName?.toLowerCase()] && searchQuery === propertyMap[form.propertyName?.toLowerCase()]?.name
                    // Home/Condo + New: require non-empty
                    : form.propertyType === "Home/Condo" && form.isNewProperty === true
                      ? !!form.propertyName
                    // All others: require non-empty
                    : !!form.propertyName
                  )
                    ? '#4078ff'
                    : '#e0e6f0',
                color:
                  form.propertyName &&
                  (form.propertyType !== 'Home/Condo' || form.isNewProperty !== false ||
                    (Array.isArray(window.propertyList) && window.propertyList.some(p => p.name === form.propertyName)))
                    ? '#fff'
                    : '#bbb',
                border: 'none',
                borderRadius: 9,
                fontWeight: 600,
                fontSize: 18,
                minWidth: 120,
                minHeight: 44,
                marginLeft: 12,
                cursor:
                  // Use the same logic as the 'disabled' prop
                  (
                    form.propertyType === "Home/Condo" && form.isNewProperty === false
                      ? form.propertyName && propertyMap[form.propertyName?.toLowerCase()] && propertySelectedFromDropdown
                    : form.propertyType === "Home/Condo" && form.isNewProperty === true
                      ? !!form.propertyName
                    : !!form.propertyName
                  )
                    ? 'pointer'
                    : 'not-allowed',
                opacity:
                  (
                    form.propertyType === "Home/Condo" && form.isNewProperty === false
                      ? form.propertyName && propertyMap[form.propertyName?.toLowerCase()] && propertySelectedFromDropdown
                    : form.propertyType === "Home/Condo" && form.isNewProperty === true
                      ? !!form.propertyName
                    : !!form.propertyName
                  )
                    ? 1
                    : 0.7,
                boxShadow:
                  (
                    form.propertyType === "Home/Condo" && form.isNewProperty === false
                      ? form.propertyName && propertyMap[form.propertyName?.toLowerCase()] && propertySelectedFromDropdown
                    : form.propertyType === "Home/Condo" && form.isNewProperty === true
                      ? !!form.propertyName
                    : !!form.propertyName
                  )
                    ? '0 2px 8px rgba(80,120,200,0.10)'
                    : 'none',
                transition: 'all 0.17s cubic-bezier(.4,0,.2,1)',
              }}
            >
              Next →
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    {/* Step 4: Update Type and Notes */}
    {step === 3 && (
      <motion.div
        key="update-type-notes"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -24 }}
        transition={{ duration: 0.28 }}
        style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}
      >
        <h2 style={{ fontWeight: 700, fontSize: 24, marginBottom: 32 }}>Update Type & Notes</h2>
        {form.propertyType === "Home/Condo" && form.isNewProperty === true ? (
          // Auto-set and show only "New Property" indicator (no other options)
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <span style={{
              background: '#4078ff',
              color: '#fff',
              border: '2.5px solid #4078ff',
              borderRadius: 999,
              padding: '8px 14px',
              fontWeight: 700,
              fontSize: 16,
              boxShadow: '0 2px 12px rgba(80,120,200,0.08)'
            }}>
              New Property
            </span>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 18, marginBottom: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
            {(form.propertyType === "Home/Condo" && form.isNewProperty === false ? UPDATE_TYPES_EXISTING : UPDATE_TYPES_ALL).map(type => (
              <button
                key={type}
                onClick={() => setForm(f => ({ ...f, updateType: type }))}
                style={{
                  minWidth: 140,
                  minHeight: 44,
                  background: form.updateType === type ? '#4078ff' : '#f4f6fa',
                  color: form.updateType === type ? '#fff' : '#4078ff',
                  border: form.updateType === type ? '2.5px solid #4078ff' : '2px solid #e0e6f0',
                  borderRadius: 10,
                  fontWeight: 600,
                  fontSize: 17,
                  marginBottom: 8,
                  boxShadow: form.updateType === type ? '0 2px 12px rgba(80,120,200,0.08)' : 'none',
                  cursor: 'pointer',
                  outline: 'none',
                  transition: 'all 0.17s cubic-bezier(.4,0,.2,1)',
                }}
              >
                {type}
              </button>
            ))}
          </div>
        )}
        <textarea
          value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          placeholder="Add notes for this task (optional)"
          style={{
            width: "60%",
            color: "var(--text-main)",
            minHeight: 80,
            padding: "12px 16px",
            fontSize: 16,
            borderRadius: 8,
            background: "var(--bg-main)",
            border: "2px solid var(--input-border)",
            marginBottom: 22,
            resize: "vertical"
          }}
        />
        <div style={{ display: 'flex', gap: 18, marginTop: 16 }}>
          <button
            onClick={() => setStep(2)}
            style={{
              background: 'none',
              color: '#888',
              border: 'none',
              fontSize: 16,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            ← Back
          </button>
          <button
            onClick={() => setStep(4)}
            disabled={!form.updateType}
            style={{
              background: form.updateType ? '#4078ff' : '#e0e6f0',
              color: form.updateType ? '#fff' : '#bbb',
              border: 'none',
              borderRadius: 9,
              fontWeight: 600,
              fontSize: 18,
              minWidth: 120,
              minHeight: 44,
              marginLeft: 12,
              cursor: form.updateType ? 'pointer' : 'not-allowed',
              opacity: form.updateType ? 1 : 0.7,
              boxShadow: form.updateType ? '0 2px 8px rgba(80,120,200,0.10)' : 'none',
              transition: 'all 0.17s cubic-bezier(.4,0,.2,1)',
            }}
          >
            Next →
          </button>
        </div>
      </motion.div>
    )}
    {/* Step 5: Assignment, Priority, Expected Completion, File Links */}
    {step === 4 && (
      <motion.div
        key="assignment-priority"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -24 }}
        transition={{ duration: 0.28 }}
        style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}
      >
        <h2 style={{ fontWeight: 700, fontSize: 24, marginBottom: 28 }}>Assignment & Details</h2>
        <div style={{ display: 'flex', gap: 32, marginBottom: 18, flexWrap: 'wrap', justifyContent: 'center', width: '100%' }}>
          {/* Photographer */}
          <div style={{ minWidth: 220 }}>
            <label style={{ fontWeight: 600, marginBottom: 6, display: 'block' }}>Photographer</label>
            <select
              value={form.assignees.photographer}
              onChange={e => setForm(f => ({ ...f, assignees: { ...f.assignees, photographer: e.target.value } }))}
              style={{ width: '100%', padding: '10px 12px', fontSize: 16, borderRadius: 7, border: '2px solid var(--input-border)', background: 'var(--bg-main)', marginBottom: 6, color: "var(--text-main)" }}
            >
              <option value="">Unassigned</option>
              {users
                .filter(u => Array.isArray(u.roles) ? u.roles.includes('photographer') : u.role === 'photographer')
                .map(u => (
                  <option key={u.uid || u.id} value={u.uid || u.id}>{u.displayName || u.email}</option>
                ))}
            </select>
          </div>
          {/* Editor */}
          <div style={{ minWidth: 220 }}>
            <label style={{ fontWeight: 600, marginBottom: 6, display: 'block' }}>Editor</label>
            <select
              value={form.assignees.editor}
              onChange={e => setForm(f => ({ ...f, assignees: { ...f.assignees, editor: e.target.value } }))}
              style={{ width: '100%', padding: '10px 12px', fontSize: 16, borderRadius: 7, border: '2px solid var(--input-border)', background: 'var(--bg-main)', marginBottom: 6, color: "var(--text-main)" }}
            >
              <option value="">Unassigned</option>
              {users
                .filter(u => Array.isArray(u.roles) ? u.roles.includes('editor') : u.role === 'editor')
                .map(u => (
                  <option key={u.uid || u.id} value={u.uid || u.id}>{u.displayName || u.email}</option>
                ))}
            </select>
          </div>
        </div>
        {/* Priority & Expected Completion */}
        <div style={{ display: 'flex', gap: 32, marginBottom: 18, flexWrap: 'wrap', justifyContent: 'center', width: '100%' }}>
          <label style={{ fontWeight: 600, alignSelf: 'center' }}>
            <input
              type="checkbox"
              checked={form.priorityRequest}
              onChange={e => setForm(f => ({ ...f, priorityRequest: e.target.checked }))}
              style={{ marginRight: 8 }}
            />
            Priority Request
          </label>
          <div style={{ minWidth: 220 }}>
            <label style={{ fontWeight: 600, marginBottom: 6, display: 'block' }}>Expected Completion</label>
            <input
              type="date"
              value={form.expectedCompletion}
              onChange={e => setForm(f => ({ ...f, expectedCompletion: e.target.value }))}
              min={new Date().toISOString().split('T')[0]}
              style={{ width: '100%', padding: '10px 12px', fontSize: 16, borderRadius: 7, border: '2px solid var(--input-border)', background: 'var(--bg-main)', color: "var(--text-main)" }}
            />
          </div>
        </div>
        {/* File Links */}
        <div style={{ width: '60%', marginBottom: 18 }}>
          <label style={{ fontWeight: 600, marginBottom: 6, display: 'block' }}>File Links (optional, comma-separated URLs)</label>
          <input
            type="text"
            value={form.fileLinks.join(', ')}
            onChange={e => {
              const val = e.target.value;
              setForm(f => ({ ...f, fileLinks: val.split(',').map(s => s.trim()).filter(Boolean) }));
            }}
            placeholder="Paste URLs, separated by commas"
            style={{ width: '100%', padding: '10px 12px', fontSize: 16, borderRadius: 7, border: '2px solid var(--input-border)', background: 'var(--bg-main)', color: "var(--text-main)" }}
          />
        </div>
        <div style={{ display: 'flex', gap: 18, marginTop: 18 }}>
          <button
            onClick={() => setStep(3)}
            style={{
              background: 'none',
              color: '#888',
              border: 'none',
              fontSize: 16,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            ← Back
          </button>
          <button
            onClick={async () => {
              const result = await onSubmit(form);
              // If onSubmit returns false or throws, do not clear
              if (result !== false) clearAll();
            }}
            
            style={{
              background: '#4078ff',
              color: '#fff',
              border: 'none',
              borderRadius: 9,
              fontWeight: 600,
              fontSize: 18,
              minWidth: 140,
              minHeight: 44,
              marginLeft: 12,
              cursor: 'pointer',
              opacity: 1,
              boxShadow: '0 2px 8px rgba(80,120,200,0.10)',
              transition: 'all 0.17s cubic-bezier(.4,0,.2,1)',
            }}
          >
            Create Task
          </button>
        </div>
      </motion.div>
    )}
    <button onClick={() => { clearAll(); onCancel(); }} style={{ position: "absolute", top: 18, right: 18, background: "none", border: "none", color: "#888", fontSize: 26, cursor: "pointer" }} title="Close">×</button>
  </div>
  );
}

