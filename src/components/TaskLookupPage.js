import React, { useEffect, useState, useRef } from "react";
import { getFirestore, doc, getDoc, collection, query, where, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import FloatingBanner from "./FloatingBanner";
import { useNavigate, useLocation } from "react-router-dom";
import { FiSearch } from "react-icons/fi";
import TaskLookupTable from "./TaskLookupTable";

import { useAuth } from "../context/AuthContext";

const PREDEFINED_UPDATE_TYPES = [
  "Full Reshoot",
  "Interior/Exterior Update",
  "Construction Update",
  "Specific Owner Request",
  "Other"
];

const containerStyle = {
  background: "var(--bg-card)",
  color: "var(--text-main)",
  borderRadius: 16,
  boxShadow: "0 2px 16px rgba(80,120,200,0.07)",
  padding: "32px 32px 60px",
  maxWidth: "65%",
  justifyContent: "center",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  margin: "64px auto",
  width: 'calc(100% - 68px)'
};

const searchBarStyle = {
  display: "flex",
  alignItems: "center",
  background: "var(--sidebar-bg)",
  borderRadius: 8,
  padding: "6px 12px",
  width: "90%",
  boxShadow: "0 1px 4px rgba(80,120,200,0.06)"
};

const inputStyle = {
  border: "none",
  outline: "none",
  background: "transparent",
  color: "var(--text-main)",
  fontSize: 18,
  flex: 1,
  marginLeft: 10
};

const dropdownStyle = {
  width: 320,
  background: "var(--bg-main)",
  border: "1.5px solid var(--sidebar-border)",
  borderRadius: 8,
  marginTop: 2,
  maxHeight: 180,
  overflowY: "auto",
  boxShadow: "0 2px 12px rgba(80,120,200,0.09)",
  zIndex: 20,
  position: "absolute"
};

const itemStyle = {
  padding: "10px 16px",
  cursor: "pointer",
  fontSize: 16,
  color: "var(--text-main)"
};

const TaskLookupPage = () => {
  // ...existing state...
  const location = useLocation();

  // Helper to parse query params
  const getQueryParam = (key) => {
    const params = new URLSearchParams(location.search);
    return params.get(key);
  };

  // Helper to update query params
  const setQueryParam = (key, value) => {
    const params = new URLSearchParams(location.search);
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    return params.toString() ? `?${params.toString()}` : '';
  };

  const { user: currentUser, role } = useAuth();
  const dropdownJustSelected = useRef(false);
  const dropdownJustClosed = useRef(false);
  // Store property objects and lookup maps
  const [propertyList, setPropertyList] = useState([]); // Array of { name, unitCode }
  const [propertyLookup, setPropertyLookup] = useState({}); // Map: searchKey -> unitCode
  const [propertyMap, setPropertyMap] = useState({}); // Map: unitCode -> { name, unitCode }
  const [searchQuery, setSearchQuery] = useState("");
  const [userTyped, setUserTyped] = useState(false);
  const [filtered, setFiltered] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");

  // Task table state
  const [tasks, setTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [taskError, setTaskError] = useState("");
  const [users, setUsers] = useState([]);

  // On mount & when URL changes, check if property param exists and auto-select
  useEffect(() => {
    const urlProperty = getQueryParam('property');
    if (urlProperty && propertyMap && propertyMap[urlProperty.toLowerCase()]) {
      // If not already selected, select and fetch
      if (selected !== urlProperty) {
        setSelected(urlProperty);
        const pretty = propertyMap[urlProperty.toLowerCase()]?.name || urlProperty;
        setUserTyped(false); // Mark as programmatic
        setSearchQuery(pretty);
        setShowDropdown(false); // Ensure dropdown is closed
        setError("");
        setTaskError("");
        fetchTasksAndUsersForProperty(urlProperty);
      }
    }
    // If property param is removed, clear selection
    if (!urlProperty && selected) {
      setSelected(null);
      setSearchQuery("");
      setUserTyped(false);
      setShowDropdown(false); // Also close dropdown if clearing
      setTasks([]);
      setUsers([]);
    }
    // eslint-disable-next-line
  }, [location.search, propertyMap]);

  // Fetch property names
  useEffect(() => {
    const fetchNames = async () => {
      try {
        const db = getFirestore();
        const docRef = doc(db, "autocomplete", "propertyNames");
        const snap = await getDoc(docRef);
        if (snap.exists() && Array.isArray(snap.data().names)) {
          const list = snap.data().names;
          setPropertyList(list);
          // Build lookup maps
          const lookup = {};
          const map = {};
          list.forEach(({ name, unitCode }) => {
            if (unitCode) {
              map[unitCode.toLowerCase()] = { name, unitCode };
              lookup[unitCode.toLowerCase()] = unitCode;
            }
            if (name) {
              lookup[name.toLowerCase()] = unitCode;
            }
          });
          setPropertyLookup(lookup);
          setPropertyMap(map);
        }
      } catch (err) {}
    };
    fetchNames();
  }, []);

  // Autocomplete filtering (match by name or unitCode)
  useEffect(() => {
    if (searchQuery.length >= 2) {
      const lower = searchQuery.toLowerCase();
      const matches = propertyList.filter(
        prop =>
          prop.name.toLowerCase().includes(lower) ||
          prop.unitCode.toLowerCase().includes(lower)
      );
      setFiltered(matches.map(prop => prop.unitCode)); // always return unitCode for selection
      // Only show dropdown if user typed
      setShowDropdown(userTyped && matches.length > 0);
      setHighlightedIdx(-1);
    } else {
      setFiltered([]);
      setShowDropdown(false);
      setHighlightedIdx(-1);
    }
  }, [searchQuery, propertyList, userTyped]);

  const handleSelect = (unitCode) => {
    // Update URL with property param
    navigate(setQueryParam('property', unitCode), { replace: false });
    dropdownJustSelected.current = true;
    dropdownJustClosed.current = true;
    setSelected(unitCode);
    // Show pretty name in search bar if available
    const pretty = propertyMap[unitCode?.toLowerCase()]?.name || unitCode;
    setSearchQuery(pretty);
    setShowDropdown(false);
    setError("");
    setTaskError("");
    fetchTasksAndUsersForProperty(unitCode);
    setTimeout(() => {
      dropdownJustSelected.current = false;
      dropdownJustClosed.current = false;
    }, 250);
  };

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

  // Check if searchQuery matches either a name or unit code
  const isValidProperty = (() => {
    if (!searchQuery) return false;
    const lower = searchQuery.toLowerCase();
    // Try to resolve to a unitCode
    return !!propertyLookup[lower];
  })();

  const handleSearch = (e) => {
    // On search, update URL with property param
    if (isValidProperty) {
      const lower = searchQuery.toLowerCase();
      const unitCode = propertyLookup[lower];
      navigate(setQueryParam('property', unitCode), { replace: false });
    }
    e.preventDefault();
    setTaskError("");
    if (!isValidProperty) {
      setError("Please select a property name or code from the list.");
      return;
    }
    setError("");
    // Always resolve to unitCode
    const lower = searchQuery.toLowerCase();
    const unitCode = propertyLookup[lower];
    setSelected(unitCode);
    fetchTasksAndUsersForProperty(unitCode);
  };


  // Fetch tasks and users for a given unit code
  const fetchTasksAndUsersForProperty = async (unitCode) => {
    if (!unitCode) return;
    setLoadingTasks(true);
    setTaskError("");
    setTasks([]);
    setUsers([]);
    try {
      const db = getFirestore();
      console.log("[TaskLookup] Fetching tasks for unit code:", unitCode);
      // Fetch tasks filtered by propertyName = unitCode
      const q = query(collection(db, "tasks"), where("propertyName", "==", unitCode));
      console.log("[TaskLookup] Firestore query:", q);
      const snap = await getDocs(q);
      const taskList = snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
      console.log("[TaskLookup] Fetched tasks:", taskList);
      setTasks(taskList);
      // Collect unique editor UIDs
      const editorIds = Array.from(new Set(taskList.map(t => t.assignedEditor).filter(Boolean)));
      // Fetch user docs for editors
      const userSnaps = await Promise.all(
        editorIds.map(async uid => {
          try {
            const userRef = doc(db, "users", uid);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
              return { id: uid, ...userSnap.data() };
            }
          } catch (userErr) {
            console.warn("[TaskLookup] Failed to fetch user", uid, userErr);
          }
          return { id: uid };
        })
      );
      setUsers(userSnaps);
    } catch (err) {
      console.error("[TaskLookup] Error fetching tasks or users:", err);
      setTaskError("Failed to fetch tasks. Please try again. " + (err && err.message ? err.message : ""));
    }
    setLoadingTasks(false);
  };


  // Modal state for new task
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [updateType, setUpdateType] = useState(PREDEFINED_UPDATE_TYPES[0]);
  const [customUpdateType, setCustomUpdateType] = useState("");
  const [notes, setNotes] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState(false);

  // Helper: reset modal state
  const resetModal = () => {
    setUpdateType(PREDEFINED_UPDATE_TYPES[0]);
    setCustomUpdateType("");
    setNotes("");
    setCreating(false);
    setCreateError("");
  };

  const navigate = useNavigate();

  // Create new task handler
  const handleCreateTask = async (e) => {
    e.preventDefault();
    setCreating(true);
    setCreateError("");
    try {
      const db = getFirestore();
      const functions = getFunctions();
      const createTaskWithPublicId = httpsCallable(functions, "createTaskWithPublicId");
      const now = new Date().toISOString();
      const ical = propertyMap[selected?.unitCode?.toLowerCase()]?.ical || null;
      const taskData = {
        createdVia: "TaskLookupPage", // Flag for notification logic
        propertyName: selected,
        updateType: updateType === "Other" ? customUpdateType : updateType,
        createdAt: now,
        mediaType: "photos", // All TaskLookupPage creations are photos
        stage: "Scheduling", // Start at the Scheduling stage
        stageUpdated: now,
        ical, // Store the ical URL directly on the task
        assignedEditors: [], // Always present, no assignment logic here
        assignedEditorIds: [], // Always present, no assignment logic here
        log: [
          {
            type: "created",
            timestamp: now,
            user: {
              uid: currentUser?.uid || "unknown",
              displayName: currentUser?.displayName || currentUser?.email || currentUser?.uid || "Unknown User"
            },
            stage: "Scheduling",
            description: "Task created"
          }
        ]
      };
      // Create the task using callable function
      const result = await createTaskWithPublicId({ taskData });
      const { taskId, publicId } = result.data;
      // If notes are present, add as the first comment in subcollection
      if (notes && notes.trim()) {
        const user = currentUser?.uid ? `${currentUser.uid}` : '(system)';
        await addDoc(collection(db, "tasks", taskId, "comments"), {
          text: notes,
          user,
          createdAt: serverTimestamp(),
          timestamp: new Date().toISOString(),
        });
      }
      setShowCreateModal(false);
      resetModal();
      // Refresh tasks
      fetchTasksAndUsersForProperty(selected);
      // Only redirect if user is not a standard user
      if (role !== "standard") {
        navigate(`/tasks/${publicId}`);
      } else {
        setCreateSuccess(true);
      }
    } catch (err) {
      setCreateError("Failed to create task: " + (err && err.message ? err.message : ""));
    }
    setCreating(false);
  };

  return (
    <>
      <FloatingBanner
        type="success"
        visible={createSuccess}
        message="Task created successfully!"
        onClose={() => setCreateSuccess(false)}
        autoHideDuration={4000}
      />
      <div style={containerStyle}>
      <h2 style={{ marginBottom: 24, fontWeight: 600 }}>Media Status Lookup</h2>
      <form onSubmit={handleSearch} style={{ position: "relative", width: 320 }} autoComplete="off">
        <div style={searchBarStyle}>
            <FiSearch size={22} color="var(--text-main)" />
            <input
              style={inputStyle}
              type="text"
              placeholder="Search property name..."
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setUserTyped(true);
                setError("");
                // Only open dropdown if not already selected or if user is typing
                if (!dropdownJustClosed.current && !selected) setShowDropdown(filtered.length > 0);
              }}
              onFocus={() => {
                setUserTyped(true);
                // Only open dropdown if not already selected (prevents open on load)
                if (!dropdownJustClosed.current && !selected) setShowDropdown(filtered.length > 0);
              }}
              onBlur={() => {
                setTimeout(() => setShowDropdown(false), 100);
              }}
              onKeyDown={handleInputKeyDown}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          {showDropdown && (
            <div style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: '100%',
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
              {filtered.map((unitCode, idx) => (
                <div
                  key={unitCode}
                  onMouseDown={() => handleSelect(unitCode)}
                  onMouseEnter={() => setHighlightedIdx(idx)}
                  style={{
                    padding: "8px 14px",
                    background: idx === highlightedIdx ? "#3b82f6" : "inherit",
                    color: idx === highlightedIdx ? "#fff" : "inherit",
                    cursor: "pointer",
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontWeight: 600 }}>
                    {propertyMap[unitCode?.toLowerCase()]?.name || unitCode}
                  </span>
                  <span style={{ color: idx === highlightedIdx ? '#e0eaff' : '#aaa', marginLeft: 8, fontSize: 13 }}>
                    {propertyMap[unitCode?.toLowerCase()]?.unitCode && propertyMap[unitCode?.toLowerCase()]?.unitCode !== propertyMap[unitCode?.toLowerCase()]?.name ? `(${propertyMap[unitCode?.toLowerCase()]?.unitCode})` : null}
                  </span>
                </div>
              ))}
            </div>
          )}
        <button type="submit" style={{ marginTop: 18, width: '100%', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 0', fontWeight: 600, fontSize: 16, cursor: 'pointer' }}>
          Search
        </button>
        {error && <div style={{ color: '#c00', marginTop: 8 }}>{error}</div>}
      </form>

      {/* TASK TABLE SECTION */}
      {selected && (
        <div style={{ width: "100%", maxWidth: 1200, margin: "40px auto 0 auto" }}>
          <div style={{ fontWeight: 600, fontSize: 19, marginBottom: 18, color: 'var(--text-main)' }}>
            Tasks for: <span style={{ color: '#3b82f6' }}>{selected}</span>
          </div>
          {loadingTasks ? (
            <div style={{ padding: 32, textAlign: "center", color: '#888' }}>Loading tasks...</div>
          ) : (
            <div style={{ width: "100%", marginTop: 24 }}>
              {taskError && (
                <div style={{ color: '#c00', padding: 18, background: '#fff0f0', borderRadius: 8, marginBottom: 12 }}>{taskError}</div>
              )}
              <div style={{ position: 'relative' }}>
                <TaskLookupTable
                  tasks={tasks.filter(t => t.archived !== true)}
                  onAddNew={() => setShowCreateModal(true)}
                />
              </div>
            </div>
          )}
          {/* Create Task Modal */}
          {showCreateModal && (
            <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {/* Overlay for click-outside-to-close */}
              <div
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  width: '100vw',
                  height: '100vh',
                  background: 'rgba(0,0,0,0.36)',
                  zIndex: 9999
                }}
                onClick={() => { setShowCreateModal(false); resetModal(); }}
              />
              {/* Modal content */}
              <div
                style={{
                  background: 'var(--bg-card)',
                  borderRadius: 18,
                  boxShadow: '0 6px 32px rgba(50,80,160,0.18)',
                  padding: 38,
                  minWidth: 350,
                  maxWidth: 410,
                  width: '100%',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  zIndex: 10000
                }}
                onClick={e => e.stopPropagation()}
              >
                {/* Close icon */}
                <button
                  aria-label="Close"
                  onClick={() => { setShowCreateModal(false); resetModal(); }}
                  style={{
                    position: 'absolute',
                    top: 16,
                    right: 16,
                    background: 'none',
                    border: 'none',
                    fontSize: 26,
                    color: '#b8c6e6',
                    cursor: 'pointer',
                    zIndex: 2,
                    padding: 0,
                  }}
                  type="button"
                >
                  &times;
                </button>
                <h3 style={{ margin: 0, marginBottom: 18, fontWeight: 700, color: 'var(--text-main)', fontSize: 22, textAlign: 'left' }}>Create New Task</h3>
                <form onSubmit={handleCreateTask}>
                  {/* Form content here */}
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>Update Type:</div>
                    {PREDEFINED_UPDATE_TYPES.map(type => (
                      <label key={type} style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                        <input
                          type="radio"
                          name="updateType"
                          value={type}
                          checked={updateType === type}
                          onChange={() => setUpdateType(type)}
                          style={{ marginRight: 8 }}
                        />
                        {type}
                      </label>
                    ))}
                    {updateType === "Other" && (
                      <input
                        type="text"
                        placeholder="Enter custom update type"
                        value={customUpdateType}
                        onChange={e => setCustomUpdateType(e.target.value)}
                        style={{
                          width: '100%',
                          marginTop: 8,
                          padding: '10px 12px',
                          borderRadius: 8,
                          border: '1.5px solid var(--input-border, #b8c6e6)',
                          background: 'var(--bg-input)',
                          color: 'var(--text-main)',
                          fontSize: 15,
                          outline: 'none',
                          transition: 'border-color 0.2s',
                          boxSizing: 'border-box',
                        }}
                        onFocus={e => e.target.style.borderColor = 'var(--primary, #3b82f6)'}
                        onBlur={e => e.target.style.borderColor = 'var(--input-border, #b8c6e6)'}
                        required
                      />
                    )}
                  </div>
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>Notes:</div>
                    <textarea
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder="Add any relevant notes (will appear as a comment)"
                      style={{
                        width: '100%',
                        minHeight: 70,
                        borderRadius: 8,
                        border: '1.5px solid var(--input-border, #b8c6e6)',
                        background: 'var(--bg-input)',
                        color: 'var(--text-main)',
                        padding: '10px 12px',
                        fontSize: 15,
                        outline: 'none',
                        transition: 'border-color 0.2s',
                        resize: 'vertical',
                        boxSizing: 'border-box',
                      }}
                      onFocus={e => e.target.style.borderColor = 'var(--primary, #3b82f6)'}
                      onBlur={e => e.target.style.borderColor = 'var(--input-border, #b8c6e6)'}
                    />
                  </div>
                  {createError && <div style={{ color: '#c00', marginBottom: 10 }}>{createError}</div>}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                    <button
                      type="submit"
                      style={{ background: '#3b82f6', border: 'none', color: '#fff', borderRadius: 8, padding: '7px 18px', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}
                      disabled={creating || (updateType === "Other" && !customUpdateType)}
                    >{creating ? 'Creating...' : 'Create Task'}</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {!selected && (
        <div style={{ marginTop: 42, color: '#888', fontSize: 15, maxWidth: 450, textAlign: 'center' }}>
          To create a new media request, first select the property above.
        </div>
      )}
    </div>
    </>
  );
};

export default TaskLookupPage;
