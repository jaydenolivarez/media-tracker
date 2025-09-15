import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import FloatingBanner from "./FloatingBanner";
import { getFirestore, collection, getDocs, query, where } from "firebase/firestore";
import TaskCreateStepper from "./TaskCreateStepper";
import { useAuth } from "../context/AuthContext";
import TaskTable from "./TaskTable";
import { getUserDisplayName } from "../utils/userDisplayName";
import PropertyFilterToggle from "./PropertyFilterToggle";
import MediaTypeToggle from "./MediaTypeToggle";
import { FiSearch } from "react-icons/fi";
import DetailedTaskView from "./DetailedTaskView";
import { useNavigate, useParams } from "react-router-dom";
import PendingTasksView from "./SchedulingList";
import UserManagementView from "./UserManagementView";
// Sidebar is controlled globally in App.js for desktop
import CompletedTasksView from "./CompletedTasksView";
import SettingsPage from "./SettingsPage";
import { MEDIA_TYPES } from "../constants/mediaTypes";
// No need to import DropboxAuthCallback in Dashboard, as redirect is handled externally
import IssueManagementView from "./IssueManagementView";
// MobileTopNav is controlled globally in App.js for mobile

// Fade-in overlay component for popup
export function FadeInOverlay({ sidebarWidth, children, onClose }) {
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => { setVisible(true); }, []);

  // Handler for fade-out
  const handleFadeOut = () => {
    setVisible(false);
    setTimeout(() => {
      if (onClose) onClose();
    }, 350); // match transition duration
  };

  return (
    <div
      style={{
        position: "fixed",
        left: sidebarWidth,
        top: 0,
        width: `calc(100vw - ${sidebarWidth}px)`, // Only covers area to the right of sidebar
        height: "100vh",
        background: 'rgba(0,0,0,0.32)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        zIndex: 99999,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        overflowY: "auto",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.35s cubic-bezier(.4,0,.2,1)"
      }}
      onClick={e => {
        // Only close if clicking directly on the overlay (not on children/modal)
        if (e.target === e.currentTarget) handleFadeOut();
      }}
    >
      {typeof children === "function" ? children(handleFadeOut) : children}
    </div>
  );
}


const sidebarWidth = 68;

const Dashboard = () => {
  const location = useLocation();
  const [showCompletionBanner, setShowCompletionBanner] = useState(false);
  // Property name/unit code lookup state
  /* eslint-disable no-unused-vars */
  const [propertyList, setPropertyList] = useState([]); // array of { name, unitCode }
  const [propertyMap, setPropertyMap] = useState({}); // unitCode -> pretty name

  // Fetch property names from Firestore for search
  useEffect(() => {
    const fetchPropertyNames = async () => {
      try {
        const db = getFirestore();
        const docRef = await import("firebase/firestore").then(m => m.doc(db, "autocomplete", "propertyNames"));
        const snap = await import("firebase/firestore").then(m => m.getDoc(docRef));
        if (snap.exists() && Array.isArray(snap.data().names)) {
          const list = snap.data().names;
          setPropertyList(list);
          const map = {};
          list.forEach(({ name, unitCode }) => {
            if (unitCode) map[unitCode.toLowerCase()] = name;
          });
          setPropertyMap(map);
        }
      } catch (err) {}
    };
    fetchPropertyNames();
  }, []);
  const navigate = useNavigate();
  const [showPendingTasks, setShowPendingTasks] = useState(false);
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [showCompletedTasks, setShowCompletedTasks] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // Property filter state for toggling new/existing/both
  const [propertyFilter, setPropertyFilter] = useState('both');
  // Attach global handler for sidebar settings button
  React.useEffect(() => {
    window.openSettingsPage = () => setShowSettings(true);
    return () => { window.openSettingsPage = undefined; };
  }, []);
  // Dropbox linking handler
  // Dropbox OAuth: Redirect to Dropbox authorization URL
  const handleLinkDropbox = () => {
    const DROPBOX_APP_KEY = "37xch7ymqezwp8f";
    const DROPBOX_REDIRECT_URI = "https://us-central1-photo-tracker-59878.cloudfunctions.net/dropboxAuthCallback";
    const url = `https://www.dropbox.com/oauth2/authorize?client_id=${DROPBOX_APP_KEY}&response_type=code&redirect_uri=${encodeURIComponent(DROPBOX_REDIRECT_URI)}&token_access_type=offline`;
    window.location.href = url;
  };
  const { user, role, loading, roleLoading, userData, activeRole } = useAuth();
  // Prefer the user-selected role (activeRole) when present, fallback to legacy single role
  const displayRole = activeRole || role;
  const [showIssues, setShowIssues] = useState(false);
  const [tasks, setTasks] = useState([]);
const [selectedMediaTypes, setSelectedMediaTypes] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  // All users, not just editors
  const [users, setUsers] = useState([]);
  // Sorting state
  const [sortColumn, setSortColumn] = useState("propertyName");
  const [sortDirection, setSortDirection] = useState("asc"); // 'asc' or 'desc'

  // Search UI state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Focus ref for input
  const searchInputRef = React.useRef(null);

  // Mobile breakpoint state and filter modal toggle
  const [isMobile, setIsMobile] = React.useState(window.innerWidth <= 900);
  const [filterOpen, setFilterOpen] = React.useState(false);
  React.useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 900);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Handle sort column/direction
  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  }

  // Fetch tasks function (so it can be called from anywhere)
  const fetchTasks = async () => {
    setTasksLoading(true);
    const db = getFirestore();
    let q = collection(db, "tasks");
    if (displayRole === "editor") {
      q = query(
        q,
        where("assignedEditorIds", "array-contains", user.uid)
      );
    } else if (displayRole === "photographer") {
      // Restrict to photographer's assigned tasks in Scheduling or Shooting
      // Note: may require a composite index in Firestore
      try {
        q = query(
          q,
          where("assignedPhotographer", "==", user.uid),
          where("stage", "in", ["Scheduling", "Shooting"])
        );
      } catch (_) {
        // Fallback: run two queries if 'in' is unavailable in the environment
        // This block will be ignored if the above 'in' query is supported
      }
    } else if (displayRole === "manager") {
      q = query(q);
    }
// (optionally: add client/user role filtering here)
    try {
      const snapshot = await getDocs(q);
      let taskList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
// Filter out completed and archived tasks in JS
if (displayRole === "editor" || displayRole === "manager" || displayRole === "photographer") {
  taskList = taskList.filter(task => task.stage !== "Completed" && task.archived !== true);
}
// Editors should only see tasks that are in the "In House Edits" stage
if (displayRole === "editor") {
  taskList = taskList.filter(task => task.stage === "In House Edits");
}
// Photographers: ensure scope is enforced even if Firestore couldn't use 'in' query
if (displayRole === "photographer") {
  taskList = taskList.filter(
    t => t.assignedPhotographer === user.uid && (t.stage === "Scheduling" || t.stage === "Shooting")
  );
}
      setTasks(taskList);
    } catch (err) {
      setTasks([]);
    }
    setTasksLoading(false);
  };

  useEffect(() => {
    if (!user || !displayRole || loading || roleLoading) return;
    fetchTasks();
  }, [user, displayRole, loading, roleLoading]);

  // Initialize selectedMediaTypes from Firestore or all enabled types
  useEffect(() => {
    if (userData?.permissions?.mediaTypes) {
      if (userData.mediaTypeToggle && Array.isArray(userData.mediaTypeToggle) && userData.mediaTypeToggle.length > 0) {
        setSelectedMediaTypes(userData.mediaTypeToggle.filter(type => userData.permissions.mediaTypes.includes(type)));
      } else {
        setSelectedMediaTypes([...userData.permissions.mediaTypes]);
      }
    }
  }, [userData]);

// Detect navigation state for completedTask
  useEffect(() => {
    if (location.state && location.state.completedTask) {
      setShowCompletionBanner(true);
      setSelectedTask(null); // Hide the task view when navigating to dashboard
      fetchTasks();
      // Clear navigation state so banner doesn't repeat
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const [selectedTask, setSelectedTask] = React.useState(null);
const { publicId } = useParams();
  const [showCreate, setShowCreate] = React.useState(false);

  // Fetch all users (all roles)
  const fetchUsers = async () => {
    try {
      const db = getFirestore();
      const q = collection(db, "users");
      const snap = await getDocs(q);
      const userList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUsers(userList);
    } catch (err) {
      setUsers([]);
    }
  };    

  const enabledMediaTypes = (userData?.permissions?.mediaTypes && Array.isArray(userData.permissions.mediaTypes))
    ? userData.permissions.mediaTypes
    : MEDIA_TYPES.map(t => t.key);

  // Ensure users are fetched on mount
  useEffect(() => {
    fetchUsers();
  }, []);

  // Helper to get any user's displayName by UID (fallback to UID if missing)
  // Use getUserDisplayName for both string and object user fields
  const getUserName = (user) => getUserDisplayName(user, users);

  // Auto-select task if publicId is present in URL and modal is not already open
  useEffect(() => {
    if (
      publicId &&
      tasks.length > 0 &&
      !selectedTask &&
      !showPendingTasks &&
      !showUserManagement &&
      !showCompletedTasks &&
      !showSettings &&
      !showIssues
    ) {
      const match = tasks.find(t => String(t.publicId) === String(publicId));
      if (match) setSelectedTask(match);
    }
  }, [publicId, tasks, selectedTask, showPendingTasks, showUserManagement, showCompletedTasks, showSettings, showIssues]);

  if (loading || roleLoading || tasksLoading || users.length === 0) {
    return <div style={{ textAlign: "center", marginTop: 80, fontSize: 20 }}>Loading tasks...</div>;
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--page-header" }}>
      {showCompletionBanner && (
        <FloatingBanner
          message="Task marked complete!"
          visible={showCompletionBanner}
          type="success"
          onClose={() => setShowCompletionBanner(false)}
        />
      )}
       {/* Global nav (Sidebar/MobileTopNav) is rendered in App.js */}
      {showSettings && (
        <FadeInOverlay sidebarWidth={isMobile ? 0 : sidebarWidth} onClose={() => setShowSettings(false)}>
          {(handleFadeOut) => (
            <div style={{ marginTop: 64, width: "100%", maxWidth: 480 }}>
              <SettingsPage onLinkDropbox={handleLinkDropbox} />
            </div>
          )}
        </FadeInOverlay>
      )}
       <div style={{ width: '100%' }}>
           {showUserManagement ? (
             <UserManagementView />
           ) : showPendingTasks ? (
             <PendingTasksView />
           ) : showCompletedTasks ? (
             <CompletedTasksView />
           ) : showIssues ? (
             <IssueManagementView />
           ) : (
             <main style={{ minHeight: "100vh", boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", width: "100%" }}>

              {/* Title row and controls */}
              <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, marginTop: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                  {!isMobile && (
                    <h1 style={{
                      fontWeight: 700,
                      color: "var(--text-main)",
                      marginLeft: 40,
                      fontSize: 28,
                      letterSpacing: 0.1,
                      alignSelf: "flex-start",
                      marginBottom: 0,
                      marginRight: 16,
                      fontFamily: "var(--title-font)",
                    }}>Open Tasks</h1>
                  )}
                  {/* Show media type toggle inline only on desktop */}
                  {!isMobile && userData?.permissions?.mediaTypes && userData.permissions.mediaTypes.length > 1 && (
                    <MediaTypeToggle
                      enabledMediaTypes={userData.permissions.mediaTypes}
                      selectedMediaTypes={selectedMediaTypes}
                      onChange={setSelectedMediaTypes}
                      persistKey="mediaTypeToggle"
                    />
                  )}
                </div>
                {/* Right-side controls: desktop shows inline search + property toggle; mobile shows Filter button */}
                {!isMobile ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                    <input
                      ref={searchInputRef}
                      type="text"
                      placeholder="Search tasks..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      style={{
                        width: searchOpen ? 240 : 0,
                        opacity: searchOpen ? 1 : 0,
                        marginRight: searchOpen ? 12 : 0,
                        transition: 'width 0.35s cubic-bezier(.4,0,.2,1), opacity 0.23s cubic-bezier(.4,0,.2,1), margin 0.2s',
                        padding: searchOpen ? '8px 14px' : '8px 0px',
                        borderRadius: 8,
                        border: '1.5px solid var(--sidebar-border)',
                        background: 'var(--bg-card)',
                        color: 'var(--text-main)',
                        fontSize: 16,
                        outline: 'none',
                        boxShadow: searchOpen ? '0 2px 8px rgba(80,120,200,0.07)' : 'none',
                        pointerEvents: searchOpen ? 'auto' : 'none',
                        minWidth: 0,
                        maxWidth: 320,
                      }}
                      onBlur={() => { if (searchQuery === "") setSearchOpen(false); }}
                      onKeyDown={e => { if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery(""); } }}
                    />
                    <button
                      title={searchOpen ? "Close Search" : "Search Tasks"}
                      style={{
                        background: 'var(--bg-card)',
                        border: '1.5px solid var(--sidebar-border)',
                        color: 'var(--text-main)',
                        borderRadius: 10,
                        padding: 8,
                        marginRight: 16,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 8px rgba(80,120,200,0.05)',
                        transition: 'background 0.15s, border 0.15s',
                      }}
                      onClick={() => {
                        setSearchOpen(o => {
                          if (!o) setTimeout(() => searchInputRef.current && searchInputRef.current.focus(), 80);
                          else if (searchQuery !== "") setSearchQuery("");
                          return !o;
                        });
                      }}
                      onMouseOver={e => {
                        e.currentTarget.style.background = 'var(--sidebar-bg)';
                      }}
                      onMouseOut={e => {
                        e.currentTarget.style.background = 'var(--bg-card)';
                      }}
                    >
                      <FiSearch size={22} />
                    </button>
                    <div style={{ marginRight: 20 }}>
                      <PropertyFilterToggle value={propertyFilter} onChange={setPropertyFilter} />
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setFilterOpen(true)}
                    style={{
                      background: 'var(--primary)',
                      color: 'white',
                      border: 'none',
                      borderRadius: 10,
                      padding: '10px 14px',
                      marginRight: 20,
                      fontWeight: 600,
                      boxShadow: '0 2px 10px rgba(80,120,200,0.20)'
                    }}
                  >
                    Filter
                  </button>
                )}
              </div>

              {/* Mobile Filter Modal */}
              {isMobile && filterOpen && (
                <FadeInOverlay sidebarWidth={isMobile ? 0 : sidebarWidth} onClose={() => setFilterOpen(false)}>
                  {(handleClose) => (
                    <div style={{ marginTop: 72, width: '100%', maxWidth: 560 }}>
                      <div style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--sidebar-border)',
                        boxShadow: '0 8px 30px rgba(60,100,180,0.18)',
                        borderRadius: 16,
                        padding: 20
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <h3 style={{ margin: 0, color: 'var(--text-main)' }}>Filters</h3>
                          <button onClick={handleClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', fontSize: 18 }}>✕</button>
                        </div>
                        {/* Search */}
                        <div style={{ marginBottom: 14 }}>
                          <label style={{ display: 'block', fontSize: 13, color: 'var(--text-dim)', marginBottom: 6 }}>Search</label>
                          <input
                            ref={searchInputRef}
                            type="text"
                            placeholder="Search tasks..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              borderRadius: 10,
                              border: '1.5px solid var(--sidebar-border)',
                              background: 'var(--bg-main)',
                              color: 'var(--text-main)',
                              fontSize: 16,
                              outline: 'none'
                            }}
                          />
                        </div>
                        {/* Property type toggle */}
                        <div style={{ marginBottom: 14 }}>
                          <label style={{ display: 'block', fontSize: 13, color: 'var(--text-dim)', marginBottom: 6 }}>Property Type</label>
                          <PropertyFilterToggle value={propertyFilter} onChange={setPropertyFilter} />
                        </div>
                        {/* Media type toggle */}
                        {userData?.permissions?.mediaTypes && userData.permissions.mediaTypes.length > 1 && (
                          <div style={{ marginBottom: 6 }}>
                            <label style={{ display: 'block', fontSize: 13, color: 'var(--text-dim)', marginBottom: 6 }}>Media Types</label>
                            <MediaTypeToggle
                              enabledMediaTypes={userData.permissions.mediaTypes}
                              selectedMediaTypes={selectedMediaTypes}
                              onChange={setSelectedMediaTypes}
                              persistKey="mediaTypeToggle"
                            />
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
                          <button onClick={handleClose} style={{ background: 'var(--bg-main)', color: 'var(--text-main)', border: '1px solid var(--sidebar-border)', borderRadius: 10, padding: '10px 14px' }}>Close</button>
                        </div>
                      </div>
                    </div>
                  )}
                </FadeInOverlay>
              )}
              <div style={{ background: "var(--bg-card)", boxShadow: "0 2px 16px rgba(80,120,200,0.07)", padding: 0, minHeight: 360, width: "100%", height: "90vh", minWidth: 800 }}>
                <div className="dashboard-task-table-wrap">
                  {(() => {
                    const mobileVisibleColumns = [
                      ...(enabledMediaTypes.length > 1 ? ["mediaType"] : []),
                      "propertyName",
                      "progressState"
                    ];
                    const desktopVisibleColumns = [
                      ...(enabledMediaTypes.length > 1 ? ["mediaType"] : []),
                      "propertyName",
                      "updateType",
                      "emergency",
                      "createdAt",
                      "progressState",
                      "assignedEditorDisplayName",
                      "expectedCompletion"
                    ];
                    return (
                  <TaskTable
                    visibleColumns={isMobile ? mobileVisibleColumns : desktopVisibleColumns}
                    columnWidths={{
                      mediaType: { width: "5%", maxWidth: 160 },
                      propertyName: { width: "15%", maxWidth: 240 },
                      updateType: { width: "25%", maxWidth: 180 },
                      emergency: { width: "5%", maxWidth: 60 },
                      createdAt: { width: "9%", maxWidth: 110 },
                      progressState: { width: "20%", maxWidth: 80 },
                      assignedEditorDisplayName: { width: "13%", maxWidth: 180 },
                      expectedCompletion: { width: "8%", maxWidth: 180 }
                    }}
                    tasks={(() => {
                      let filtered = tasks.filter(t => !t.archived);
                      // Defensive: treat missing archived as not archived
                      filtered = filtered.filter(t => t.archived !== true);
                      filtered = filtered.filter(t => t.stage !== "Completed");
                      // Photographer view: only assigned to me & stage "Shooting" & "Scheduling"
                      if (activeRole === 'photographer' && user && user.uid) {
                        filtered = filtered.filter(t => t.assignedPhotographer === user.uid && (t.stage === "Shooting" || t.stage === "Scheduling"));
                      }
                      if (propertyFilter === 'new') filtered = filtered.filter(t => t.isNewProperty);
                      else if (propertyFilter === 'existing') filtered = filtered.filter(t => !t.isNewProperty);
                      if (!searchQuery.trim()) {
                        filtered = filtered.filter(t => selectedMediaTypes.includes(t.mediaType));
                      return [...filtered]
                        .map(task => ({ ...task, assignedEditorDisplayName: task.assignedEditor ? getUserName(task.assignedEditor) : 'Unassigned' }))
                        .sort((a, b) => {
                          let valA = a[sortColumn];
                          let valB = b[sortColumn];
                          if (valA == null) valA = "";
                          if (valB == null) valB = "";
                          if (sortColumn === "propertyName" || sortColumn === "updateType" || sortColumn === "assignedEditorDisplayName") {
                            valA = valA.toString().toLowerCase();
                            valB = valB.toString().toLowerCase();
                            if (valA < valB) return sortDirection === "asc" ? -1 : 1;
                            if (valA > valB) return sortDirection === "asc" ? 1 : -1;
                            return 0;
                          }
                          if (sortColumn === "progressState") {
                            return sortDirection === "asc" ? valA - valB : valB - valA;
                          }
                          if (sortColumn === "emergency") {
                            const aFlag = !!(a.emergency || a.priorityRequest);
                            const bFlag = !!(b.emergency || b.priorityRequest);
                            if (aFlag === bFlag) return 0;
                            return sortDirection === "asc" ? (aFlag ? -1 : 1) : (aFlag ? 1 : -1);
                          }
                          if (sortColumn === "expectedCompletion") {
                            const dateA = valA ? new Date(valA) : null;
                            const dateB = valB ? new Date(valB) : null;
                            const validA = dateA && !isNaN(dateA);
                            const validB = dateB && !isNaN(dateB);
                          
                            if (!validA && !validB) return 0;
                            if (!validA) return sortDirection === "asc" ? 1 : -1;
                            if (!validB) return sortDirection === "asc" ? -1 : 1;
                          
                            return sortDirection === "asc"
                              ? dateA - dateB
                              : dateB - dateA;
                          }
                          valA = valA.toString().toLowerCase();
                          valB = valB.toString().toLowerCase();
                          if (valA < valB) return sortDirection === "asc" ? -1 : 1;
                          if (valA > valB) return sortDirection === "asc" ? 1 : -1;
                          return 0;
                        });
                    } else {
                      const q = searchQuery.trim().toLowerCase();
                      // Enhanced: filter by either unit code or pretty property name
                      return tasks
                        .filter(task => task.archived !== true)
                        .filter(task => selectedMediaTypes.includes(task.mediaType))
                        // Photographer view: scope search results to my assigned tasks
                        .filter(task => (activeRole === 'photographer' && user && user.uid) ? (task.assignedPhotographer === user.uid) : true)
                        .map(task => ({ 
                          ...task, 
                          assignedEditorDisplayNames: Array.isArray(task.assignedEditorIds) ? task.assignedEditorIds.map(uid => getUserName(uid)) : [],
                          assignedPhotographerDisplayName: task.assignedPhotographer ? getUserName(task.assignedPhotographer) : '' 
                        }))
                        .filter(task => {
                          // Match by unit code (propertyName) or pretty property name
                          const unitCode = (task.propertyName || '').toLowerCase();
                          const prettyName = propertyMap[unitCode]?.toLowerCase?.() || '';
                          // Other fields as before
                          const fields = [
                            unitCode,
                            prettyName,
                            task.propertyType,
                            task.mediaType,
                            task.updateType,
                            ...task.assignedEditorDisplayNames,
                            task.assignedPhotographer,
                            task.assignedPhotographerDisplayName,
                            task.id
                          ];
                          return fields.some(val => val && val.toString().toLowerCase().includes(q));
                        })
                        .sort((a, b) => {
                          let valA = a[sortColumn];
                          let valB = b[sortColumn];
                          if (valA == null) valA = "";
                          if (valB == null) valB = "";
                          if (sortColumn === "propertyName" || sortColumn === "updateType" || sortColumn === "assignedEditorDisplayName") {
                            valA = valA.toString().toLowerCase();
                            valB = valB.toString().toLowerCase();
                            if (valA < valB) return sortDirection === "asc" ? -1 : 1;
                            if (valA > valB) return sortDirection === "asc" ? 1 : -1;
                            return 0;
                          }
                          if (sortColumn === "progressState") {
                            return sortDirection === "asc" ? valA - valB : valB - valA;
                          }
                          if (sortColumn === "emergency") {
                            const aFlag = !!(a.emergency || a.priorityRequest);
                            const bFlag = !!(b.emergency || b.priorityRequest);
                            if (aFlag === bFlag) return 0;
                            return sortDirection === "asc" ? (aFlag ? -1 : 1) : (aFlag ? 1 : -1);
                          }
                          if (sortColumn === "expectedCompletion") {
                            const dateA = valA ? new Date(valA) : null;
                            const dateB = valB ? new Date(valB) : null;
                            const validA = dateA && !isNaN(dateA);
                            const validB = dateB && !isNaN(dateB);
                          
                            if (!validA && !validB) return 0;
                            if (!validA) return sortDirection === "asc" ? 1 : -1;
                            if (!validB) return sortDirection === "asc" ? -1 : 1;
                          
                            return sortDirection === "asc"
                              ? dateA - dateB
                              : dateB - dateA;
                          }
                          valA = valA.toString().toLowerCase();
                          valB = valB.toString().toLowerCase();
                          if (valA < valB) return sortDirection === "asc" ? -1 : 1;
                          if (valA > valB) return sortDirection === "asc" ? 1 : -1;
                          return 0;
                        });
                    }
                  })()}
                    onRowClick={task => {
                      setSelectedTask(task);
                      if (task && task.publicId !== undefined) {
                        navigate(`/dashboard/tasks/${task.publicId}`);
                      }
                    }}
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    users={users}
                  />
                    );
            })()}
  </div>
            </div>
            {selectedTask && (
                <FadeInOverlay sidebarWidth={isMobile ? 0 : sidebarWidth} onClose={() => {
                  setSelectedTask(null);
                  navigate('/dashboard');
                }}>
                  {(handleFadeOut) => <>
                    <div style={{ marginTop: 20, width: "100%", maxWidth: 1200 }}>
                      <DetailedTaskView
                        taskId={selectedTask?.id}
                        fileLinks={selectedTask?.fileLinks}
                        task={selectedTask}
                        role={displayRole}
                        users={users}
                        onAddFiles={() => alert("Add files")}
                        onCloseTask={() => alert("Close/Complete task")}
                        onReassign={() => alert("Reassign task")}
                        onReportIssue={() => alert("Report issue")}
                      />
                    </div>
                  </>}
                </FadeInOverlay>
            )}
            {(displayRole === "manager" || displayRole === "photographer") && (
                <button
                  onClick={() => setShowCreate(true)}
                  style={{
                    position: "fixed",
                    right: 32,
                    bottom: 32,
                    width: 60,
                    height: 60,
                    borderRadius: "50%",
                    background: "#3b82f6",
                    color: "#fff",
                    border: "none",
                    boxShadow: "0 4px 16px rgba(80,120,200,0.13)",
                    fontSize: 32,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 500,
                    cursor: "pointer",
                    transition: "background 0.2s"
                  }}
                  title="Create New Task"
                >
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
                  </span>
                </button>
            )}
            {showCreate && (
                <FadeInOverlay sidebarWidth={sidebarWidth} onClose={() => setShowCreate(false)}>
                  {(handleFadeOut) => (
                    <div style={{ marginTop: 20, width: "100%", maxWidth: 1000 }}>
                      <TaskCreateStepper
                        users={users}
                        onSubmit={async (form) => {
                          setTasksLoading(true);
                          try {
                            const [{ getFirestore, collection, addDoc }, { getFunctions, httpsCallable }] = await Promise.all([
                              import('firebase/firestore'),
                              import('firebase/functions'),
                            ]);
                            const db = getFirestore();
                            const functions = getFunctions();
                            const now = new Date().toISOString();
                            // Build assigned editors array (legacy: multi-editor support)
                            const assignedEditorsArr = [];
                            if (form.assignees.editor) {
                              const editorUser = users.find(u => u.uid === form.assignees.editor);
                              assignedEditorsArr.push({
                                editorId: form.assignees.editor,
                                label: editorUser?.displayName || editorUser?.email || 'Editor',
                                customLabel: '',
                              });
                            }
                            const assignedEditorIdsArr = assignedEditorsArr.map(a => a.editorId);
                            // Build task object
                            const newTask = {
                              mediaType: form.mediaType,
                              propertyName: form.propertyName,
                              isNewProperty: form.isNewProperty,
                              propertyType: form.propertyType,
                              updateType: form.updateType,
                              priorityRequest: form.priorityRequest,
                              assignedPhotographer: form.assignees.photographer,
                              expectedCompletion: form.expectedCompletion ? new Date(form.expectedCompletion).toISOString() : null,
                              createdAt: now,
                              stage: "Scheduling",
                              assignedEditors: assignedEditorsArr,
                              assignedEditorIds: assignedEditorIdsArr,
                              log: [
                                {
                                  type: 'created',
                                  timestamp: now,
                                  user: {
                                    uid: user?.uid || 'unknown',
                                    displayName: user?.displayName || user?.email || 'Unknown User',
                                  },
                                  progressState: 1,
                                  description: 'Task created',
                                },
                              ],
                            };
                            // Call cloud function to create task with publicId
                            const createTaskWithPublicId = httpsCallable(functions, 'createTaskWithPublicId');
                            const result = await createTaskWithPublicId({ taskData: newTask });
                            const { taskId, publicId } = result.data;
                            // Add file links if present
                            const validLinks = (form.fileLinks || []).map(l => l.trim()).filter(Boolean);
                            if (validLinks.length > 0) {
                              await Promise.all(validLinks.map(link =>
                                addDoc(collection(db, 'tasks', taskId, 'files'), {
                                  url: link,
                                  addedBy: user?.uid || 'unknown',
                                  createdAt: new Date().toISOString(),
                                })
                              ));
                            }
                            // Add notes as the initial note comment if present
                            if (form.notes && form.notes.trim().length > 0) {
                              await addDoc(collection(db, 'tasks', taskId, 'comments'), {
                                text: form.notes,
                                createdAt: new Date().toISOString(),
                                isInitialNote: true,
                                createdVia: 'TaskCreateStepper',
                                user: {
                                  displayName: user?.displayName || user?.email || 'Unknown User',
                                  uid: user?.uid || 'unknown',
                                },
                              });
                            }
                            fetchTasks();
                            handleFadeOut();
                          } catch (err) {
                            alert('Failed to create task: ' + (err && err.message ? err.message : err));
                          } finally {
                            setTasksLoading(false);
                          }
                        }}
                        onCancel={handleFadeOut}
                      />
                    </div>
                  )}
                </FadeInOverlay>
            )}
          </main>
        )}
      </div>
    </div>
  );
};

export default Dashboard;